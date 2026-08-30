// Cake-type classification from the formula's own ratios.
//
// Ratios are computed relative to the "dry base": flour, plus oats when oats are
// present in a meaningful quantity (>= 15% of flour, or when there is no flour) -
// the brief treats oats as co-structural, not a mix-in.
//
//   fat : base %      (butter + oil)
//   sugar : base %    (all sugars + syrups/honey)
//   egg : base %      (tracked separately from liquid)
//   liquid : base %   (milk/water/buttermilk/cream/yogurt/juice + fruit purees)
//   cocoa : base %

import { categoryOf, resolve } from './masterIngredients.js';

// key -> display label. Also the override dropdown list.
export const CAKE_TYPES = [
  { key: 'genoise', label: 'Genoise / sponge' },
  { key: 'chiffon', label: 'Chiffon' },
  { key: 'butter-cake', label: 'Butter cake' },
  { key: 'pound-cake', label: 'Pound cake' },
  { key: 'oil-quick-bread', label: 'Oil-based / quick bread' },
  { key: 'chocolate-cake', label: 'Chocolate cake' },
  { key: 'fruit-oat-loaf', label: 'High-hydration fruit / oat loaf' },
  { key: 'carrot-cake', label: 'Carrot cake' },
  { key: 'red-velvet', label: 'Red velvet' },
  { key: 'unclassified', label: 'No strong match' },
];

// Numeric ratio windows per type. Values are percent of dry base.
// Any ratio not listed for a type is simply not scored for it.
const PROFILES = {
  genoise: { fat: [0, 15], sugar: [75, 105], egg: [80, 220], liquid: [0, 25] },
  chiffon: { fat: [25, 45], sugar: [95, 135], egg: [70, 170], liquid: [25, 75] },
  'butter-cake': { fat: [38, 62], sugar: [95, 155], egg: [25, 55], liquid: [45, 95] },
  'pound-cake': { fat: [82, 108], sugar: [85, 115], egg: [82, 110], liquid: [0, 25] },
  'oil-quick-bread': { fat: [38, 62], sugar: [0, 155], egg: [30, 120], liquid: [55, 125] },
  'chocolate-cake': { fat: [38, 62], sugar: [125, 180], egg: [15, 35], liquid: [95, 135], cocoa: [28, 42] },
  'fruit-oat-loaf': { fat: [25, 55], sugar: [0, 45], egg: [75, 400], liquid: [280, 470] },
  'carrot-cake': { fat: [45, 75], sugar: [95, 135], egg: [25, 95], liquid: [35, 85] },
  'red-velvet': { fat: [35, 62], sugar: [95, 135], egg: [25, 70], liquid: [55, 95], cocoa: [3, 14] },
};

const RATIO_LABEL = {
  fat: 'Fat', sugar: 'Sugar', egg: 'Egg', liquid: 'Liquid', cocoa: 'Cocoa',
};

const inBand = (v, [lo, hi]) => v >= lo && v <= hi;
const distanceToBand = (v, [lo, hi]) => (v < lo ? lo - v : v > hi ? v - hi : 0);

function sumBy(rows, predicate) {
  return rows.reduce((acc, r) => acc + (predicate(r) ? (Number(r.grams) || 0) : 0), 0);
}

// rows: [{ name, grams, category? }]  (category filled in if absent)
export function classify(rows) {
  const items = rows.map((r) => ({
    ...r,
    grams: Number(r.grams) || 0,
    category: r.category || categoryOf(r.name),
    canonical: r.canonical || resolve(r.name)?.key || null,
  }));

  const flour = sumBy(items, (r) => r.category === 'flour');
  const oats = sumBy(items, (r) => r.category === 'oats');
  const nuts = sumBy(items, (r) => r.category === 'nuts');
  const fat = sumBy(items, (r) => r.category === 'fat');
  const butter = sumBy(items, (r) => r.canonical === 'butter');
  const oil = sumBy(items, (r) => r.canonical === 'oil');
  const sugar = sumBy(items, (r) => r.category === 'sugar');
  const egg = sumBy(items, (r) => r.category === 'egg');
  const liquidRaw = sumBy(items, (r) => r.category === 'liquid');
  const cocoa = sumBy(items, (r) => r.category === 'cocoa');
  const veg = sumBy(items, (r) => r.category === 'veg');
  // grated vegetable releases moisture during baking but not its whole weight;
  // count half of it toward the liquid ratio (keeps carrot/courgette cakes in band).
  const liquid = liquidRaw + 0.5 * veg;
  const driedFruit = sumBy(items, (r) => r.category === 'dried-fruit');
  const hasChemicalLeavening = items.some((r) => r.category === 'leavening' && r.grams > 0);

  const oatsMeaningful = oats > 0 && (flour === 0 || oats >= 0.15 * flour);
  let base = flour + (oatsMeaningful ? oats : 0);
  const baseComponents = { flour, oats: oatsMeaningful ? oats : 0 };
  let baseNote = oatsMeaningful
    ? 'Dry base = flour + oats (oats are co-structural here).'
    : 'Dry base = flour.';

  if (base === 0 && nuts > 0) {
    base = nuts;
    baseComponents.nuts = nuts;
    baseNote = 'No flour or oats — dry base taken as ground nuts (flourless cake).';
  }

  if (base === 0) {
    return {
      base: { grams: 0, components: baseComponents, note: 'No structural dry ingredient found.' },
      ratios: { fat: null, sugar: null, egg: null, liquid: null, cocoa: null },
      detected: 'unclassified',
      label: 'No strong match',
      confidence: 0,
      reasons: ['Could not find flour, oats, or ground nuts to measure the formula against.'],
      signals: { hasChemicalLeavening, fatIsOil: oil > butter, hasVegMoisture: veg > 0 },
      alternatives: [],
      scores: [],
    };
  }

  const pct = (g) => Math.round((g / base) * 1000) / 10;
  const ratios = {
    fat: pct(fat),
    sugar: pct(sugar),
    egg: pct(egg),
    liquid: pct(liquid),
    cocoa: cocoa > 0 ? pct(cocoa) : 0,
  };

  const fatIsOil = oil > butter;
  const fatIsButter = butter >= oil && butter > 0;
  const hasVegMoisture = veg > 0;
  const cocoaVsFlour = flour > 0 ? Math.round((cocoa / flour) * 1000) / 10 : (cocoa > 0 ? 999 : 0);
  const equalWeight =
    base > 0 &&
    Math.abs(fat - base) / base < 0.18 &&
    Math.abs(sugar - base) / base < 0.18 &&
    Math.abs(egg - base) / base < 0.18;

  const signals = {
    hasChemicalLeavening, fatIsOil, fatIsButter, hasVegMoisture,
    oatsShare: base > 0 ? Math.round(((oatsMeaningful ? oats : 0) / base) * 100) / 100 : 0,
    cocoaVsFlour, equalWeight, driedFruitGrams: driedFruit,
  };

  const scored = Object.entries(PROFILES).map(([key, prof]) => {
    const keys = Object.keys(prof);
    let matched = 0;
    const reasons = [];
    for (const rk of keys) {
      const v = ratios[rk] ?? 0;
      if (inBand(v, prof[rk])) {
        matched += 1;
        reasons.push(`${RATIO_LABEL[rk]} is ${v}% of the dry base — inside ${prof[rk][0]}–${prof[rk][1]}% for ${labelFor(key)}.`);
      }
    }
    let score = matched / keys.length;

    // ---- signature adjustments ----
    if (key === 'chocolate-cake') {
      if (cocoa <= 0) score = 0;
      else if (cocoaVsFlour >= 20) { score += 0.15; reasons.push(`Cocoa is ${cocoaVsFlour}% of the flour — the chocolate-cake signature (30–40%).`); }
      else score -= 0.25;
    }
    if (key === 'red-velvet') {
      if (cocoa <= 0) score = 0;
      else if (cocoaVsFlour > 0 && cocoaVsFlour < 20) { score += 0.15; reasons.push(`Small cocoa addition (${cocoaVsFlour}% of flour) — the red-velvet signature.`); }
      else score -= 0.3;
    }
    if (key === 'carrot-cake') {
      if (hasVegMoisture && fatIsOil) { score += 0.2; reasons.push('Oil-based with grated vegetable moisture — the carrot-cake signature.'); }
      else score -= 0.35;
    }
    if (key === 'chiffon') {
      if (fatIsOil) { score += 0.1; reasons.push('Fat is oil, as chiffon requires.'); }
      else score -= 0.25;
    }
    if (key === 'genoise') {
      if (hasChemicalLeavening) { score -= 0.4; }
      else { score += 0.15; reasons.push('No chemical leavening — consistent with a genoise/sponge.'); }
    }
    if (key === 'pound-cake' && equalWeight) {
      score += 0.25;
      reasons.push('Fat, sugar, egg and flour are all close to equal weight — the classic pound-cake ratio.');
    }
    if (key === 'fruit-oat-loaf') {
      if (ratios.liquid >= 200) { score += 0.25; reasons.push(`Liquid is ${ratios.liquid}% of the dry base — an unusually high hydration that points to a fruit/oat loaf.`); }
      else score -= 0.3;
      if (oatsMeaningful) { score += 0.1; reasons.push('Oats carried into the structural base.'); }
    }
    if (key === 'oil-quick-bread') {
      if (fatIsOil) reasons.push('Oil, not creamed butter — a quick-bread method.');
      else score -= 0.15;
    }

    score = Math.max(0, Math.min(1.25, score));
    return { key, label: labelFor(key), score, matched, total: keys.length, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const strong = top.score >= 0.5 && top.matched >= 2;

  const alternatives = scored
    .slice(strong ? 1 : 0, strong ? 4 : 3)
    .filter((s) => s.score > 0.15)
    .map((s) => ({ key: s.key, label: s.label, confidence: Math.round(Math.min(1, s.score) * 100) / 100 }));

  return {
    base: { grams: Math.round(base), components: roundVals(baseComponents), note: baseNote },
    ratios,
    detected: strong ? top.key : 'unclassified',
    label: strong ? top.label : 'No strong match',
    confidence: Math.round(Math.min(1, top.score) * 100) / 100,
    reasons: strong
      ? top.reasons
      : [
          'No cake type matched at least half of its defining ratios.',
          `Closest: ${scored.slice(0, 2).map((s) => `${s.label} (${Math.round(s.score * 100)}%)`).join(', ')}.`,
          'Pick the intended type from the dropdown so scaling and moisture use the right table.',
        ],
    signals,
    alternatives,
    scores: scored.map(({ key, label, score, matched, total }) => ({
      key, label, score: Math.round(score * 100) / 100, matched, total,
    })),
  };
}

function labelFor(key) {
  return CAKE_TYPES.find((t) => t.key === key)?.label ?? key;
}
function roundVals(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Math.round(v)]));
}
