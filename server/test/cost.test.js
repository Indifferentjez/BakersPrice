import { describe, it, expect } from 'vitest';
import { priceBake } from '../lib/cost.js';

const priceList = [
  { name: 'flour', canonical: 'flour', pricePerG: 0.0012 },
  { name: 'butter', canonical: 'butter', pricePerG: 0.008 },
  { name: 'sugar', canonical: 'caster sugar', pricePerG: 0.001 },
  { name: 'eggs', canonical: 'egg', pricePerEgg: 0.25 },
  { name: 'milk', canonical: 'milk', pricePerG: 0.0009 },
];

const bake = {
  labourMinutes: 90, hourlyRate: 15,
  energyCost: 0.8, packagingCost: 2.5,
  overheadPct: 20,
  marginMinPct: 28, marginStdPct: 50, marginPremiumPct: 65,
};

const smallCake = [
  { name: 'flour', canonical: 'flour', category: 'flour', grams: 150 },
  { name: 'butter', canonical: 'butter', category: 'fat', grams: 75 },
  { name: 'sugar', canonical: 'caster sugar', category: 'sugar', grams: 150 },
  { name: 'eggs', canonical: 'egg', category: 'egg', grams: 75, perEgg: 50 },
  { name: 'milk', canonical: 'milk', category: 'liquid', grams: 110 },
];
const bigCake = smallCake.map((r) => ({ ...r, grams: r.grams * 4 }));

describe('cost model', () => {
  it('applies the brief formula: (cost+overhead) / (1 - margin)', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList, bake });
    const ing = 150 * 0.0012 + 75 * 0.008 + 150 * 0.001 + (75 / 50) * 0.25 + 110 * 0.0009;
    const labour = (90 / 60) * 15;
    const total = ing + labour + 0.8 + 2.5;
    const withOverhead = total * 1.2;
    expect(r.breakdown.ingredientCost.value).toBeCloseTo(ing, 4);
    expect(r.breakdown.labourCost.value).toBeCloseTo(labour, 4);
    expect(r.breakdown.totalCost.value).toBeCloseTo(total, 4);
    expect(r.breakdown.costPlusOverhead.value).toBeCloseTo(withOverhead, 4);
    expect(r.prices.minimum).toBeCloseTo(withOverhead / (1 - 0.28), 2);
    expect(r.prices.standard).toBeCloseTo(withOverhead / (1 - 0.50), 2);
    expect(r.prices.premium).toBeCloseTo(withOverhead / (1 - 0.65), 2);
  });

  it('labour, energy and packaging are FIXED — they do not scale with size', () => {
    const small = priceBake({ scaledIngredients: smallCake, priceList, bake });
    const big = priceBake({ scaledIngredients: bigCake, priceList, bake });
    expect(big.breakdown.labourCost.value).toBe(small.breakdown.labourCost.value);
    expect(big.breakdown.energyCost.value).toBe(small.breakdown.energyCost.value);
    expect(big.breakdown.packagingCost.value).toBe(small.breakdown.packagingCost.value);
    // only ingredient cost scales (4x here)
    expect(big.breakdown.ingredientCost.value).toBeCloseTo(small.breakdown.ingredientCost.value * 4, 4);
  });

  it('price rises with size at every tier', () => {
    const small = priceBake({ scaledIngredients: smallCake, priceList, bake });
    const big = priceBake({ scaledIngredients: bigCake, priceList, bake });
    for (const tier of ['minimum', 'standard', 'premium']) {
      expect(big.prices[tier]).toBeGreaterThan(small.prices[tier]);
    }
  });

  it('tiers stay ordered minimum <= standard <= premium', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList, bake });
    expect(r.prices.minimum).toBeLessThanOrEqual(r.prices.standard);
    expect(r.prices.standard).toBeLessThanOrEqual(r.prices.premium);
  });

  it('missing ingredient price -> flagged, cost incomplete, small gap = ESTIMATED', () => {
    const r = priceBake({
      scaledIngredients: [...smallCake, { name: 'saffron', category: 'other', grams: 1 }],
      priceList, bake,
    });
    expect(r.missingPrices).toContain('saffron');
    expect(r.complete).toBe(false);
    // 1 g unpriced in a ~560 g cake — a tiny gap, so ESTIMATED not REQUIRES_TESTING
    expect(r.breakdown.ingredientCost.accuracy).toBe('ESTIMATED');
    expect(r.estimate.isEstimate).toBe(true);
    expect(r.estimate.unpricedWeightPct).toBeLessThan(1);
  });

  it('incomplete price still produces a quote: floor + estimate + margin for error', () => {
    // drop butter and eggs from the price list -> a big chunk of the mix unpriced
    const partialList = priceList.filter((p) => !['butter', 'egg'].includes(p.canonical));
    const r = priceBake({ scaledIngredients: smallCake, priceList: partialList, bake });

    expect(r.complete).toBe(false);
    expect(r.estimate.isEstimate).toBe(true);
    expect(r.estimate.missingIngredientPrices).toEqual(expect.arrayContaining(['butter', 'eggs']));
    expect(r.estimate.unpricedWeightPct).toBeGreaterThan(0);

    // floor treats unpriced items as £0; estimate proxies them at the priced avg £/g
    expect(r.pricesFloor.standard).toBeGreaterThan(0);
    expect(r.pricesEstimated.standard).toBeGreaterThan(r.pricesFloor.standard);
    // `prices` leads with the estimate when incomplete
    expect(r.prices.standard).toBe(r.pricesEstimated.standard);
    // per-tier range is [floor, estimate]
    expect(r.estimate.priceRange.standard).toEqual([r.pricesFloor.standard, r.pricesEstimated.standard]);
    // big gap -> REQUIRES_TESTING
    expect(r.breakdown.ingredientCost.accuracy).toBe('REQUIRES_TESTING');
  });

  it('proxy estimate ~= floor scaled by total/priced weight', () => {
    const partialList = priceList.filter((p) => p.canonical !== 'butter');
    const r = priceBake({ scaledIngredients: smallCake, priceList: partialList, bake });
    const { pricedGrams, totalIngredientGrams, ingredientCost } = r.estimate;
    const expected = r.breakdown.ingredientCost.value * (totalIngredientGrams / pricedGrams);
    expect(r.breakdown.ingredientCost.estimatedValue).toBeCloseTo(expected, 2);
    expect(ingredientCost.firm).toBeCloseTo(r.breakdown.ingredientCost.value, 4);
  });

  it('no ingredient prices at all -> cannot estimate ingredient cost', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList: [], bake });
    expect(r.complete).toBe(false);
    expect(r.pricesEstimated).toBeNull();
    expect(r.breakdown.ingredientCost.estimatedValue).toBeNull();
    // still yields a (labour+energy+packaging) floor price so a quote can be made
    expect(r.pricesFloor.standard).toBeGreaterThan(0);
    expect(r.prices.standard).toBe(r.pricesFloor.standard);
  });

  it('no hourly rate -> labour cost null, not zero, and bake incomplete', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList, bake: { ...bake, hourlyRate: null } });
    expect(r.breakdown.labourCost.value).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.estimate.missingLabour).toBe(true);
  });
});

describe('cost model — input guards', () => {
  it('a negative margin yields no price for that tier (never below cost)', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList, bake: { ...bake, marginMinPct: -20 } });
    expect(r.prices.minimum).toBeNull();
    expect(r.pricesFloor.minimum).toBeNull();
    expect(r.prices.standard).not.toBeNull(); // other tiers unaffected
  });

  it('margin of exactly 100 (÷0) yields null, not Infinity', () => {
    const r = priceBake({ scaledIngredients: smallCake, priceList, bake: { ...bake, marginPremiumPct: 100 } });
    expect(r.prices.premium).toBeNull();
  });

  it('negative energy / packaging / overhead are clamped to 0, not subtracted', () => {
    const neg = priceBake({ scaledIngredients: smallCake, priceList, bake: { ...bake, energyCost: -5, packagingCost: -3, overheadPct: -10 } });
    const zero = priceBake({ scaledIngredients: smallCake, priceList, bake: { ...bake, energyCost: 0, packagingCost: 0, overheadPct: 0 } });
    expect(neg.breakdown.energyCost.value).toBe(0);
    expect(neg.breakdown.packagingCost.value).toBe(0);
    expect(neg.breakdown.costPlusOverhead.value).toBeCloseTo(zero.breakdown.costPlusOverhead.value, 6);
  });

  it('egg line cost uses the row\'s real per-egg weight, not a hardcoded 50 g', () => {
    const medium = [{ name: 'eggs', canonical: 'egg', category: 'egg', grams: 132, perEgg: 44 }];
    const large = [{ name: 'eggs', canonical: 'egg', category: 'egg', grams: 132, perEgg: 50 }];
    const eggOnlyBake = { ...bake, labourMinutes: 0, hourlyRate: 0, energyCost: 0, packagingCost: 0, overheadPct: 0 };
    const rM = priceBake({ scaledIngredients: medium, priceList, bake: eggOnlyBake });
    const rL = priceBake({ scaledIngredients: large, priceList, bake: eggOnlyBake });
    expect(rM.breakdown.ingredientCost.value).toBeCloseTo((132 / 44) * 0.25, 4); // 3 eggs
    expect(rL.breakdown.ingredientCost.value).toBeCloseTo((132 / 50) * 0.25, 4); // 2.64 eggs
    expect(rM.breakdown.ingredientCost.value).toBeGreaterThan(rL.breakdown.ingredientCost.value);
  });
});
