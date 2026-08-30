// Costing and pricing. Baker-facing only — none of this may reach the customer doc.
//
// Ingredient prices come from the master ingredient catalogue, optionally
// overridden per recipe. Ingredient cost scales with size; labour, energy and
// packaging are FIXED per bake. Incomplete prices are allowed — we report a firm
// floor (unpriced = £0) plus a weight-proxied estimate and the margin for error.

import { ACC } from './accuracy.js';

// Convert a catalogue price (price + unit) to £/gram, using the ingredient's own
// density for volume units. Returns { perG, perEach } (either may be null).
export function priceToPerGram({ price, priceUnit, densityGPerCup, gramsPerUnitMid }) {
  const p = num(price);
  if (p == null || p < 0) return { perG: null, perEach: null };
  const gPerMl = densityGPerCup ? densityGPerCup / 240 : 1;
  switch (String(priceUnit || 'kg').toLowerCase()) {
    case 'kg': return { perG: p / 1000, perEach: gramsPerUnitMid ? (p / 1000) * gramsPerUnitMid : null };
    case 'g': return { perG: p, perEach: gramsPerUnitMid ? p * gramsPerUnitMid : null };
    case '100g': return { perG: p / 100, perEach: null };
    case 'litre': case 'l': return { perG: (p / 1000) / gPerMl, perEach: null };
    case 'ml': return { perG: p / gPerMl, perEach: null };
    case 'each': case 'unit': return { perEach: p, perG: gramsPerUnitMid ? p / gramsPerUnitMid : null };
    case 'dozen': return { perEach: p / 12, perG: gramsPerUnitMid ? (p / 12) / gramsPerUnitMid : null };
    default: return { perG: p / 1000, perEach: null };
  }
}

// scaledIngredients: [{ name, canonical(=masterKey), category, grams, measurementType, count }]
// masterPrices:      { [key]: { price, priceUnit, densityGPerCup, gramsPerUnit:[min,max]|null, displayName } }
// overrides:         { [key]: { price, priceUnit } }   — per-recipe, wins over master
// bake:              { labourMinutes, hourlyRate, energyCost, packagingCost, overheadPct, margin*Pct, currency }
export function priceBake({ scaledIngredients, masterPrices = {}, overrides = {}, bake = {} }) {
  const effective = (key) => {
    const m = masterPrices[key];
    const o = overrides[key];
    const gramsPerUnitMid = m && m.gramsPerUnit ? (m.gramsPerUnit[0] + m.gramsPerUnit[1]) / 2 : (m && m.gramsPerUnitMid) || null;
    if (o && num(o.price) != null) {
      return { basis: 'override', price: num(o.price), priceUnit: o.priceUnit || (m && m.priceUnit) || 'kg',
        densityGPerCup: m && m.densityGPerCup, gramsPerUnitMid };
    }
    if (m && num(m.price) != null) {
      return { basis: 'master', price: num(m.price), priceUnit: m.priceUnit || 'kg',
        densityGPerCup: m.densityGPerCup, gramsPerUnitMid };
    }
    return { basis: 'missing', price: null, priceUnit: m && m.priceUnit, densityGPerCup: m && m.densityGPerCup, gramsPerUnitMid };
  };

  const lines = [];
  const missing = [];
  let ingredientCost = 0;
  let pricedGrams = 0;
  let unpricedGrams = 0;

  for (const row of scaledIngredients) {
    const grams = Number(row.grams) || 0;
    const key = row.canonical || row.masterKey || null;
    const eff = key ? effective(key) : { basis: 'missing', price: null };
    const per = priceToPerGram(eff);
    const isCount = row.measurementType === 'count' && row.count != null;

    let cost = null;
    let unitPrice = null;
    let unitLabel = null;
    if (isCount && eff.priceUnit && ['each', 'unit', 'dozen'].includes(String(eff.priceUnit).toLowerCase()) && per.perEach != null) {
      cost = row.count * per.perEach;
      unitPrice = per.perEach; unitLabel = '/each';
    } else if (per.perG != null) {
      cost = grams * per.perG;
      unitPrice = per.perG; unitLabel = '/g';
    }

    if (cost == null) {
      missing.push(row.name);
      unpricedGrams += grams;
      lines.push({ name: row.name, key, grams, count: isCount ? row.count : null, unitPrice: null, unit: null, cost: null, priced: false, basis: 'missing' });
      continue;
    }
    ingredientCost += cost;
    pricedGrams += grams;
    lines.push({ name: row.name, key, grams, count: isCount ? row.count : null, unitPrice, unit: unitLabel, cost, priced: true, basis: eff.basis });
  }

  const hourlyRate = num(bake.hourlyRate);
  const labourMinutes = num(bake.labourMinutes);
  const labourCost = (hourlyRate != null && labourMinutes != null) ? (labourMinutes / 60) * hourlyRate : null;
  const labourKnown = labourCost != null;

  const energyCost = Math.max(0, num(bake.energyCost) ?? 0);
  const packagingCost = Math.max(0, num(bake.packagingCost) ?? 0);
  const overheadPct = Math.max(0, num(bake.overheadPct) ?? 0);
  const margins = {
    minimum: num(bake.marginMinPct),
    standard: num(bake.marginStdPct),
    premium: num(bake.marginPremiumPct),
  };

  const buildSet = (ingCost) => {
    const total = ingCost + (labourCost ?? 0) + energyCost + packagingCost;
    const withOverhead = total * (1 + overheadPct / 100);
    const t = (m) => (m == null || m < 0 || m >= 100 ? null : withOverhead / (1 - m / 100));
    return { totalCost: total, costPlusOverhead: withOverhead,
      prices: { minimum: t(margins.minimum), standard: t(margins.standard), premium: t(margins.premium) } };
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
  const ingAccuracy = complete ? ACC.CALCULATED
    : (canProxy && unpricedWeightPct <= 25 ? ACC.ESTIMATED : ACC.REQUIRES_TESTING);
  const overallAccuracy = complete ? ACC.CALCULATED
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
    lines: lines.map((l) => ({ ...l, cost: l.cost == null ? null : round(l.cost, 4), unitPrice: l.unitPrice == null ? null : round(l.unitPrice, 6) })),
    missingPrices: [...new Set(missing)],
    overriddenKeys: lines.filter((l) => l.basis === 'override').map((l) => l.key),
    complete,

    breakdown: {
      ingredientCost: {
        value: round(ingredientCost, 4),
        estimatedValue: ingredientCostEstimated == null ? null : round(ingredientCostEstimated, 4),
        accuracy: ingAccuracy, scales: true,
      },
      labourCost: { value: labourCost == null ? null : round(labourCost, 4), accuracy: labourKnown ? ACC.CALCULATED : ACC.REQUIRES_TESTING, fixed: true },
      energyCost: { value: round(energyCost, 4), accuracy: ACC.KNOWN, fixed: true },
      packagingCost: { value: round(packagingCost, 4), accuracy: ACC.KNOWN, fixed: true },
      totalCost: { value: round(floorSet.totalCost, 4), estimatedValue: estSet ? round(estSet.totalCost, 4) : null, accuracy: overallAccuracy },
      overheadPct: { value: overheadPct, accuracy: ACC.KNOWN },
      costPlusOverhead: { value: round(floorSet.costPlusOverhead, 4), estimatedValue: estSet ? round(estSet.costPlusOverhead, 4) : null, accuracy: overallAccuracy },
    },

    margins,
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
            ? 'No ingredient prices matched — only labour, energy and packaging are counted. Add prices under Ingredients or override them on this recipe.'
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
