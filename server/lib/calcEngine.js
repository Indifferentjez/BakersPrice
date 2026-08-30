// Scaling / weight engine: pan volume -> batter weight -> baked weight,
// master-formula scaling factor, scaled ingredient list, egg practicality.
//
// All generic numbers come from the brief's tables and are labelled ESTIMATED.
// A recipe calibration (real pan + real batter weight) overrides the generic
// fill assumption and is labelled CALCULATED off KNOWN inputs.

import { ACC, weakest } from './accuracy.js';

const IN_TO_CM = 2.54;

// cake-type key -> generic fill % window and baked-weight retention % window.
const FILL_PCT = {
  genoise: [50, 60], chiffon: [50, 60],
  'butter-cake': [60, 70], 'pound-cake': [60, 70], 'red-velvet': [60, 70],
  'oil-quick-bread': [65, 75], 'carrot-cake': [65, 75],
  'chocolate-cake': [65, 70],
  'fruit-oat-loaf': [80, 90],
  unclassified: [60, 75],
};
const RETENTION_PCT = {
  genoise: [85, 90], chiffon: [85, 90],
  'butter-cake': [90, 94], 'pound-cake': [90, 94], 'red-velvet': [90, 94],
  'oil-quick-bread': [90, 95], 'carrot-cake': [90, 95],
  'chocolate-cake': [88, 93],
  'fruit-oat-loaf': [90, 96],
  unclassified: [88, 95],
};
const DEEP_PAN_FILL = [55, 65]; // brief: deep/bundt overrides type, regardless

export function fillWindow(cakeTypeKey, deep) {
  if (deep) return { pct: DEEP_PAN_FILL, note: 'Deep / bundt pan — 55–65% fill regardless of cake type.' };
  return { pct: FILL_PCT[cakeTypeKey] || FILL_PCT.unclassified, note: null };
}
export function retentionWindow(cakeTypeKey) {
  return RETENTION_PCT[cakeTypeKey] || RETENTION_PCT.unclassified;
}

// ---- pan geometry -------------------------------------------------------------
// pan = { shape:'round'|'square'|'rectangular'|'loaf'|'bundt', unit:'in'|'cm',
//         diameter?, side?, length?, width?, depth? }
export function panVolume(pan) {
  const k = (pan.unit === 'cm') ? 1 : IN_TO_CM;
  const assumptions = [];
  const d = (v) => (v == null || v === '' ? null : Number(v) * k);

  let diameter = d(pan.diameter);
  let side = d(pan.side);
  let length = d(pan.length);
  let width = d(pan.width);
  let depth = d(pan.depth);

  const shape = pan.shape || 'round';

  if (shape === 'loaf') {
    if (length && !width) { width = length * 0.5; assumptions.push('width taken as 0.5 x length'); }
    if (length && !depth) { depth = length * 0.3; assumptions.push('depth taken as 0.3 x length'); }
  }
  if ((shape === 'round' || shape === 'bundt') && !depth) { depth = 3 * IN_TO_CM; assumptions.push('depth assumed 3 in'); }
  if (shape === 'square' && !depth) { depth = 3 * IN_TO_CM; assumptions.push('depth assumed 3 in'); }
  if (shape === 'rectangular' && !depth) { depth = 2 * IN_TO_CM; assumptions.push('depth assumed 2 in'); }

  let volume = null;
  if (shape === 'round') volume = Math.PI * (diameter / 2) ** 2 * depth;
  else if (shape === 'bundt') { volume = Math.PI * (diameter / 2) ** 2 * depth * 0.75; assumptions.push('bundt hollow approximated as 0.75 x cylinder'); }
  else if (shape === 'square') volume = side * side * depth;
  else if (shape === 'rectangular') volume = length * width * depth;
  else if (shape === 'loaf') volume = length * width * depth;

  return {
    volumeMl: volume,               // cm^3 == mL
    resolvedCm: { diameter, side, length, width, depth },
    assumptions,
  };
}

// Back-calculate the recipe's real batter-per-mL constant from a real bake.
// pans: array of pan objects (the reference calibration was a 3-tin bake).
export function backCalcDensity({ pans, actualBatterG }) {
  const vols = pans.map(panVolume);
  const totalVolumeMl = vols.reduce((a, v) => a + (v.volumeMl || 0), 0);
  if (!(totalVolumeMl > 0) || !(actualBatterG > 0)) {
    return { error: 'Need at least one pan with dimensions and a positive batter weight.' };
  }
  const kPerMl = actualBatterG / totalVolumeMl;
  // implied batter density if we assume the fill fraction equalled `assumedFillPct`
  return {
    kPerMl: round(kPerMl, 4),
    totalVolumeMl: round(totalVolumeMl, 0),
    impliedFillPctAtDensity1: round(kPerMl * 100, 1),
    perPan: vols.map((v) => ({ volumeMl: round(v.volumeMl, 0), assumptions: v.assumptions })),
    note: 'k = actual batter weight / total pan volume. Save this as the recipe default so future sizes use the real yield, not the generic fill table.',
  };
}

// ---- full calculation -------------------------------------------------------
// input = {
//   master:   [{ name, grams, canonical, category }],   // grams-resolved master recipe
//   cakeTypeKey,
//   pan:      { shape, unit, ...dims, deep? },
//   base:     dry-base grams of the MASTER formula (from classify),
//   calibrationKPerMl?: number | null,                  // recipe-saved constant
//   fillPctOverride?: [lo,hi] | number | null,
//   batterDensityAssumed?: number,                       // default 1.0 g/mL
// }
export function calculate(input) {
  const {
    master, cakeTypeKey, pan, base: masterBase,
    calibrationKPerMl = null, fillPctOverride = null,
    batterDensityAssumed = 1.0,
  } = input;

  const masterBatterG = master.reduce((a, r) => a + (Number(r.grams) || 0), 0);
  const vol = panVolume(pan);
  const volumeMl = vol.volumeMl;

  const deep = !!pan.deep || pan.shape === 'bundt';
  const fw = fillWindow(cakeTypeKey, deep);
  let fillPct = fw.pct;
  let fillNote = fw.note;
  if (fillPctOverride != null) {
    fillPct = Array.isArray(fillPctOverride) ? fillPctOverride : [fillPctOverride, fillPctOverride];
    fillNote = 'Fill % entered by baker.';
  }

  // batter weight
  let batter; // { min, max, accuracy, basis }
  if (calibrationKPerMl) {
    const mid = volumeMl * calibrationKPerMl;
    batter = {
      min: mid * 0.96, max: mid * 1.04,
      accuracy: ACC.CALCULATED,
      basis: `recipe calibration: ${round(calibrationKPerMl, 3)} g batter per mL of pan volume (±4%)`,
    };
  } else {
    batter = {
      min: volumeMl * (fillPct[0] / 100) * batterDensityAssumed,
      max: volumeMl * (fillPct[1] / 100) * batterDensityAssumed,
      accuracy: ACC.ESTIMATED,
      basis: `generic ${fillPct[0]}–${fillPct[1]}% fill x ${batterDensityAssumed} g/mL assumed batter density`,
    };
  }

  // scaling factor (range from the batter range; midpoint drives the ingredient list)
  const sf = {
    min: batter.min / masterBatterG,
    max: batter.max / masterBatterG,
    mid: ((batter.min + batter.max) / 2) / masterBatterG,
  };

  const scaled = master.map((r) => ({
    name: r.name,
    canonical: r.canonical ?? null,
    category: r.category ?? null,
    // carry the recipe's real per-egg weight through so costing matches the
    // egg count calcEngine itself uses (large 50 g vs medium 44 g)
    ...(r.category === 'egg' ? { perEgg: r.perEgg || 50 } : {}),
    masterGrams: round(Number(r.grams) || 0, 1),
    grams: round((Number(r.grams) || 0) * sf.mid, 1),
  }));

  // baked weight
  const ret = retentionWindow(cakeTypeKey);
  const baked = {
    min: batter.min * (ret[0] / 100),
    max: batter.max * (ret[1] / 100),
    accuracy: weakest(batter.accuracy, ACC.ESTIMATED),
    retentionPct: ret,
  };

  // eggs
  const eggRow = master.find((r) => r.category === 'egg' && r.grams > 0);
  const perEgg = eggRow && eggRow.perEgg ? eggRow.perEgg : 50;
  const scaledEggGrams = scaled
    .filter((r) => r.category === 'egg')
    .reduce((a, r) => a + r.grams, 0);
  const targetBase = (masterBase || 0) * sf.mid;
  let eggAdvice = null;
  if (scaledEggGrams > 0) {
    const count = scaledEggGrams / perEgg;
    const rounded = Math.round(count);
    const fractional = Math.abs(count - rounded) > 0.12;
    const roundedGrams = rounded * perEgg;
    const ratioShift = targetBase > 0 ? Math.abs(roundedGrams - scaledEggGrams) / targetBase : 0;
    eggAdvice = {
      exactCount: round(count, 2),
      exactGrams: round(scaledEggGrams, 1),
      roundedCount: rounded,
      fractional,
      ratioShiftPct: round(ratioShift * 100, 1),
      warnRounding: fractional && ratioShift > 0.05,
      guidance: fractional
        ? `Whisk 1–2 eggs and weigh ${round(scaledEggGrams, 0)} g of the beaten egg for accuracy, or use ${rounded} whole egg${rounded === 1 ? '' : 's'}.`
        : `${rounded} whole egg${rounded === 1 ? '' : 's'}.`,
      note: fractional && ratioShift > 0.05
        ? `Rounding to ${rounded} eggs shifts the egg:base ratio by ${round(ratioShift * 100, 1)}% (> 5%) — weigh the beaten egg instead.`
        : null,
    };
  }

  return {
    master: { batterG: round(masterBatterG, 1), baseG: round(masterBase || 0, 0) },
    pan: {
      shape: pan.shape, unit: pan.unit,
      volumeMl: round(volumeMl, 0),
      resolvedCm: mapRound(vol.resolvedCm, 1),
      assumptions: vol.assumptions,
      deep,
    },
    fill: { pct: fillPct, note: fillNote, accuracy: fillPctOverride != null ? ACC.KNOWN : ACC.ESTIMATED },
    batter: {
      min: round(batter.min, 0), max: round(batter.max, 0),
      accuracy: batter.accuracy, basis: batter.basis,
    },
    scalingFactor: { min: round(sf.min, 3), max: round(sf.max, 3), mid: round(sf.mid, 3), accuracy: batter.accuracy },
    scaledIngredients: scaled,
    bakedWeight: {
      min: round(baked.min, 0), max: round(baked.max, 0),
      accuracy: baked.accuracy, retentionPct: ret,
    },
    eggAdvice,
    densitySource: calibrationKPerMl ? 'calibration' : 'generic-fill-table',
    calibrationKPerMl: calibrationKPerMl || null,
    // batter-per-mL-of-pan-volume actually in use (fill x density), and the
    // density that implies IF the fill matched this cake type's generic table.
    yieldKPerMl: round(calibrationKPerMl || ((fillPct[0] + fillPct[1]) / 200) * batterDensityAssumed, 3),
    impliedDensity: round((calibrationKPerMl || ((fillPct[0] + fillPct[1]) / 200) * batterDensityAssumed) /
      (((fillPct[0] + fillPct[1]) / 2) / 100), 3),
  };
}

// ---- helpers ----
function round(n, dp = 0) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function mapRound(obj, dp) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, round(v, dp)]));
}
