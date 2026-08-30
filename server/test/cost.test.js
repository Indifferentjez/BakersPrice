import { describe, it, expect } from 'vitest';
import { priceBake, priceToPerGram } from '../lib/cost.js';

// master price catalogue (keyed by masterKey / canonical slug)
const masterPrices = {
  flour: { price: 1.10, priceUnit: 'kg', densityGPerCup: 120 },
  butter: { price: 8.00, priceUnit: 'kg', densityGPerCup: 227 },
  'caster-sugar': { price: 1.00, priceUnit: 'kg', densityGPerCup: 200 },
  milk: { price: 1.30, priceUnit: 'litre', densityGPerCup: 240 },
  egg: { price: 0.25, priceUnit: 'each', gramsPerUnit: [44, 58] },
  banana: { price: 0.18, priceUnit: 'each', gramsPerUnit: [100, 120] },
};

const bake = {
  labourMinutes: 90, hourlyRate: 15, energyCost: 0.8, packagingCost: 2.5,
  overheadPct: 20, marginMinPct: 28, marginStdPct: 50, marginPremiumPct: 65,
};

const cake = [
  { name: 'flour', canonical: 'flour', category: 'flour', measurementType: 'weight', grams: 300 },
  { name: 'butter', canonical: 'butter', category: 'fat', measurementType: 'weight', grams: 150 },
  { name: 'sugar', canonical: 'caster-sugar', category: 'sugar', measurementType: 'weight', grams: 300 },
  { name: 'eggs', canonical: 'egg', category: 'egg', measurementType: 'count', count: 4, grams: 204 },
  { name: 'bananas', canonical: 'banana', category: 'liquid', measurementType: 'count', count: 3, grams: 330 },
];

describe('priceToPerGram — unit conversion uses the ingredient\'s own density', () => {
  it('kg', () => expect(priceToPerGram({ price: 1.10, priceUnit: 'kg' }).perG).toBeCloseTo(0.0011, 6));
  it('litre uses density', () => {
    // £1.30/litre oil (218 g/cup -> 0.9083 g/ml) -> £/g = 0.0013 / 0.9083
    const r = priceToPerGram({ price: 1.30, priceUnit: 'litre', densityGPerCup: 218 });
    expect(r.perG).toBeCloseTo(0.0013 / (218 / 240), 8);
  });
  it('each -> perEach, plus perG when grams-per-unit known', () => {
    const r = priceToPerGram({ price: 0.30, priceUnit: 'each', gramsPerUnitMid: 51 });
    expect(r.perEach).toBe(0.30);
    expect(r.perG).toBeCloseTo(0.30 / 51, 8);
  });
});

describe('priceBake — master catalogue', () => {
  it('prices weight rows per gram and count rows per each', () => {
    const r = priceBake({ scaledIngredients: cake, masterPrices, bake });
    expect(r.complete).toBe(true);
    const line = (n) => r.lines.find((l) => l.name === n);
    expect(line('flour').cost).toBeCloseTo(300 * 0.0011, 4);
    expect(line('flour').basis).toBe('master');
    expect(line('eggs').cost).toBeCloseTo(4 * 0.25, 4);   // per each, not per gram
    expect(line('eggs').unit).toBe('/each');
    expect(line('bananas').cost).toBeCloseTo(3 * 0.18, 4);
    const ing = 300 * 0.0011 + 150 * 0.008 + 300 * 0.001 + 4 * 0.25 + 3 * 0.18;
    expect(r.breakdown.ingredientCost.value).toBeCloseTo(ing, 4);
  });

  it('applies the brief price formula on top', () => {
    const r = priceBake({ scaledIngredients: cake, masterPrices, bake });
    const ing = r.breakdown.ingredientCost.value;
    const withOverhead = (ing + (90 / 60) * 15 + 0.8 + 2.5) * 1.2;
    expect(r.prices.standard).toBeCloseTo(withOverhead / (1 - 0.5), 2);
    expect(r.prices.minimum).toBeLessThanOrEqual(r.prices.standard);
    expect(r.prices.standard).toBeLessThanOrEqual(r.prices.premium);
  });

  it('labour / energy / packaging are fixed — only ingredient cost scales', () => {
    const big = cake.map((r) => (r.measurementType === 'count'
      ? { ...r, count: r.count * 2, grams: r.grams * 2 }
      : { ...r, grams: r.grams * 2 }));
    const a = priceBake({ scaledIngredients: cake, masterPrices, bake });
    const b = priceBake({ scaledIngredients: big, masterPrices, bake });
    expect(b.breakdown.labourCost.value).toBe(a.breakdown.labourCost.value);
    expect(b.breakdown.energyCost.value).toBe(a.breakdown.energyCost.value);
    expect(b.breakdown.ingredientCost.value).toBeCloseTo(a.breakdown.ingredientCost.value * 2, 4);
  });
});

describe('priceBake — per-recipe overrides', () => {
  it('an override wins over the master price and is flagged', () => {
    const base = priceBake({ scaledIngredients: cake, masterPrices, bake });
    const over = priceBake({
      scaledIngredients: cake, masterPrices, bake,
      overrides: { butter: { price: 12.00, priceUnit: 'kg' } },
    });
    const bLine = over.lines.find((l) => l.name === 'butter');
    expect(bLine.basis).toBe('override');
    expect(bLine.cost).toBeCloseTo(150 * 0.012, 4);
    expect(over.breakdown.ingredientCost.value).toBeGreaterThan(base.breakdown.ingredientCost.value);
    expect(over.overriddenKeys).toContain('butter');
  });

  it('an override can supply a price the master lacks', () => {
    const noSugar = { ...masterPrices, 'caster-sugar': { price: null, priceUnit: 'kg', densityGPerCup: 200 } };
    const missing = priceBake({ scaledIngredients: cake, masterPrices: noSugar, bake });
    expect(missing.complete).toBe(false);
    expect(missing.missingPrices).toContain('sugar');
    const fixed = priceBake({
      scaledIngredients: cake, masterPrices: noSugar, bake,
      overrides: { 'caster-sugar': { price: 0.95, priceUnit: 'kg' } },
    });
    expect(fixed.complete).toBe(true);
    expect(fixed.lines.find((l) => l.name === 'sugar').basis).toBe('override');
  });
});

describe('priceBake — incomplete prices still cost out', () => {
  it('floor + weight-proxy estimate + margin for error', () => {
    const partial = { flour: masterPrices.flour, 'caster-sugar': masterPrices['caster-sugar'] };
    const r = priceBake({ scaledIngredients: cake, masterPrices: partial, bake });
    expect(r.complete).toBe(false);
    expect(r.missingPrices).toEqual(expect.arrayContaining(['butter', 'eggs', 'bananas']));
    expect(r.pricesFloor.standard).toBeGreaterThan(0);
    expect(r.pricesEstimated.standard).toBeGreaterThan(r.pricesFloor.standard);
    expect(r.prices.standard).toBe(r.pricesEstimated.standard);
    expect(r.estimate.priceRange.standard).toEqual([r.pricesFloor.standard, r.pricesEstimated.standard]);
  });

  it('no matches at all -> labour/energy/packaging floor, no estimate', () => {
    const r = priceBake({ scaledIngredients: cake, masterPrices: {}, bake });
    expect(r.pricesEstimated).toBeNull();
    expect(r.pricesFloor.standard).toBeGreaterThan(0);
    expect(r.prices.standard).toBe(r.pricesFloor.standard);
  });
});

describe('priceBake — guards', () => {
  it('negative margin -> null for that tier only', () => {
    const r = priceBake({ scaledIngredients: cake, masterPrices, bake: { ...bake, marginMinPct: -10 } });
    expect(r.prices.minimum).toBeNull();
    expect(r.prices.standard).not.toBeNull();
  });
  it('negative energy/packaging/overhead clamped to 0', () => {
    const neg = priceBake({ scaledIngredients: cake, masterPrices, bake: { ...bake, energyCost: -5, packagingCost: -3, overheadPct: -10 } });
    const zero = priceBake({ scaledIngredients: cake, masterPrices, bake: { ...bake, energyCost: 0, packagingCost: 0, overheadPct: 0 } });
    expect(neg.breakdown.energyCost.value).toBe(0);
    expect(neg.breakdown.costPlusOverhead.value).toBeCloseTo(zero.breakdown.costPlusOverhead.value, 6);
  });
});
