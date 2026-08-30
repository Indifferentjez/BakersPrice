// Costing and pricing. Baker-facing only — none of this may reach the customer doc.
//
// Ingredient cost scales with size. Labour, energy and packaging are FIXED per
// bake session (the brief: spreading them by weight priced small cakes near
// zero, which was tried and rejected). Only ingredient cost scales.
//
// Incomplete price lists are allowed. When some ingredients have no saved price
// we report BOTH a firm floor (unpriced items = £0) and an estimate (unpriced
// items assumed to cost the same per gram as the priced ones), plus the size of
// the gap, so the baker can quote from an estimate and see the margin for error.

import { ACC } from './accuracy.js';

// scaledIngredients: [{ name, canonical, grams }]
// priceList: [{ name, canonical, pricePerG, pricePerEgg }]  (already normalised)
// bake: { labourMinutes, hourlyRate, energyCost, packagingCost, overheadPct,
//         marginMinPct, marginStdPct, marginPremiumPct }
export function priceBake({ scaledIngredients, priceList, bake }) {
  const byCanonical = new Map();
  const byName = new Map();
  for (const p of priceList) {
    if (p.canonical) byCanonical.set(p.canonical, p);
    byName.set(norm(p.name), p);
  }

  const lines = [];
  const missing = [];
  let ingredientCost = 0;
  let pricedGrams = 0;
  let unpricedGrams = 0;

  for (const row of scaledIngredients) {
    const grams = Number(row.grams) || 0;
    const match =
      (row.canonical && byCanonical.get(row.canonical)) ||
      byName.get(norm(row.name)) ||
      null;

    const noPrice = !match || (row.category === 'egg' ? (match.pricePerEgg == null && match.pricePerG == null) : match.pricePerG == null);
    if (noPrice) {
      missing.push(row.name);
      unpricedGrams += grams;
      lines.push({ name: row.name, grams, unitPrice: null, cost: null, priced: false });
      continue;
    }

    let cost;
    if (row.category === 'egg' && match.pricePerEgg != null) {
      const perEgg = row.perEgg || 50;
      cost = (grams / perEgg) * match.pricePerEgg;
      lines.push({ name: row.name, grams, unitPrice: match.pricePerEgg, unit: '/egg', cost, priced: true });
    } else {
      cost = grams * match.pricePerG;
      lines.push({ name: row.name, grams, unitPrice: match.pricePerG, unit: '/g', cost, priced: true });
    }
    ingredientCost += cost;
    pricedGrams += grams;
  }

  const hourlyRate = num(bake.hourlyRate);
  const labourMinutes = num(bake.labourMinutes);
  const labourCost = (hourlyRate != null && labourMinutes != null)
    ? (labourMinutes / 60) * hourlyRate
    : null;
  const labourKnown = labourCost != null;

  // fixed costs and overhead can't sensibly be negative — a fat-fingered "-5"
  // must not quietly reduce the price
  const energyCost = Math.max(0, num(bake.energyCost) ?? 0);
  const packagingCost = Math.max(0, num(bake.packagingCost) ?? 0);
  const overheadPct = Math.max(0, num(bake.overheadPct) ?? 0);
  const margins = {
    minimum: num(bake.marginMinPct),
    standard: num(bake.marginStdPct),
    premium: num(bake.marginPremiumPct),
  };

  // --- build a full price set from a given ingredient-cost figure ---
  const buildSet = (ingCost) => {
    const total = ingCost + (labourCost ?? 0) + energyCost + packagingCost;
    const withOverhead = total * (1 + overheadPct / 100);
    // a margin must be in [0, 100) — negative would price below cost, 100 divides by zero
    const t = (m) => (m == null || m < 0 || m >= 100 ? null : withOverhead / (1 - m / 100));
    return {
      totalCost: total,
      costPlusOverhead: withOverhead,
      prices: { minimum: t(margins.minimum), standard: t(margins.standard), premium: t(margins.premium) },
    };
  };

  const totalIngredientGrams = pricedGrams + unpricedGrams;
  const unpricedWeightPct = totalIngredientGrams > 0 ? (unpricedGrams / totalIngredientGrams) * 100 : 0;
  const canProxy = pricedGrams > 0 && unpricedGrams > 0;
  const ingredientCostEstimated = canProxy
    ? ingredientCost * (totalIngredientGrams / pricedGrams)
    : (unpricedGrams > 0 ? null : ingredientCost);

  const floorSet = buildSet(ingredientCost);
  const estSet = ingredientCostEstimated == null ? null : buildSet(ingredientCostEstimated);

  const complete = missing.length === 0 && labourKnown;
  // small gap -> ESTIMATED, large gap or nothing to proxy from -> REQUIRES_TESTING
  const ingAccuracy = complete
    ? ACC.CALCULATED
    : (canProxy && unpricedWeightPct <= 25 ? ACC.ESTIMATED : ACC.REQUIRES_TESTING);
  const overallAccuracy = complete
    ? ACC.CALCULATED
    : (canProxy && unpricedWeightPct <= 25 && labourKnown ? ACC.ESTIMATED : ACC.REQUIRES_TESTING);

  const roundPrices = (p) => ({
    minimum: p.minimum == null ? null : round(p.minimum, 2),
    standard: p.standard == null ? null : round(p.standard, 2),
    premium: p.premium == null ? null : round(p.premium, 2),
  });

  const pricesFloor = roundPrices(floorSet.prices);
  const pricesEstimated = estSet ? roundPrices(estSet.prices) : null;

  return {
    currency: bake.currency || 'GBP',
    lines: lines.map((l) => ({ ...l, cost: l.cost == null ? null : round(l.cost, 4) })),
    missingPrices: [...new Set(missing)],
    complete,

    breakdown: {
      ingredientCost: {
        value: round(ingredientCost, 4),
        estimatedValue: ingredientCostEstimated == null ? null : round(ingredientCostEstimated, 4),
        accuracy: ingAccuracy,
        scales: true,
      },
      labourCost: { value: labourCost == null ? null : round(labourCost, 4), accuracy: labourKnown ? ACC.CALCULATED : ACC.REQUIRES_TESTING, fixed: true },
      energyCost: { value: round(energyCost, 4), accuracy: ACC.KNOWN, fixed: true },
      packagingCost: { value: round(packagingCost, 4), accuracy: ACC.KNOWN, fixed: true },
      totalCost: { value: round(floorSet.totalCost, 4), estimatedValue: estSet ? round(estSet.totalCost, 4) : null, accuracy: overallAccuracy },
      overheadPct: { value: overheadPct, accuracy: ACC.KNOWN },
      costPlusOverhead: { value: round(floorSet.costPlusOverhead, 4), estimatedValue: estSet ? round(estSet.costPlusOverhead, 4) : null, accuracy: overallAccuracy },
    },

    margins,

    // `prices` = the number to lead with: the estimate when we have one, else the floor.
    prices: pricesEstimated || pricesFloor,
    pricesFloor,
    pricesEstimated,

    estimate: {
      isEstimate: !complete,
      accuracy: overallAccuracy,
      missingIngredientPrices: [...new Set(missing)],
      missingLabour: !labourKnown,
      pricedGrams: round(pricedGrams, 0),
      unpricedGrams: round(unpricedGrams, 0),
      totalIngredientGrams: round(totalIngredientGrams, 0),
      unpricedWeightPct: round(unpricedWeightPct, 1),
      method: !complete
        ? (canProxy
          ? 'Unpriced ingredients are assumed to cost the same per gram as the priced ones. Firm floor treats them as £0.'
          : (pricedGrams === 0
            ? 'No ingredient prices are set — only labour, energy and packaging are counted. Add prices for any real ingredient figure.'
            : null))
        : null,
      ingredientCost: {
        firm: round(ingredientCost, 4),
        estimated: ingredientCostEstimated == null ? null : round(ingredientCostEstimated, 4),
      },
      priceRange: {
        minimum: [pricesFloor.minimum, pricesEstimated ? pricesEstimated.minimum : null],
        standard: [pricesFloor.standard, pricesEstimated ? pricesEstimated.standard : null],
        premium: [pricesFloor.premium, pricesEstimated ? pricesEstimated.premium : null],
      },
    },
  };
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function round(n, dp) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
