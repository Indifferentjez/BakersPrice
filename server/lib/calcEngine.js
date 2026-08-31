// Scaling / weight engine: pan volume -> batter weight -> baked weight,
// master-formula scaling factor, scaled ingredient list, egg practicality.
//
// All generic numbers come from the brief's tables and are labelled ESTIMATED.
// A recipe calibration (real pan + real batter weight) overrides the generic
// fill assumption and is labelled CALCULATED off KNOWN inputs.

import { ACC, weakest } from './accuracy.js';

const IN_TO_CM = 2.54;
export const PAN_SHAPES = ['round', 'square', 'rectangular', 'loaf', 'bundt'];
export const PAN_UNITS = ['in', 'cm'];

export class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalcError';
    this.status = 400;
  }
}

export function hasCalibration(k) {
  return k != null && k !== '' && Number.isFinite(Number(k));
}

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
// Returns { volumeMl, resolvedCm, assumptions, error? }. error is set when the
// shape/unit/dims cannot produce a real volume — callers must not scale from it.
export function panVolume(pan = {}) {
  const assumptions = [];
  const errors = [];
  const shape = pan.shape;
  if (!PAN_SHAPES.includes(shape)) {
    return {
      volumeMl: null, resolvedCm: {}, assumptions,
      error: `Unknown pan shape "${shape || ''}". Use ${PAN_SHAPES.join(', ')}.`,
    };
  }
  const unit = pan.unit || 'in';
  if (!PAN_UNITS.includes(unit)) {
    return {
      volumeMl: null, resolvedCm: {}, assumptions,
      error: `Pan unit must be "in" or "cm", not "${pan.unit}".`,
    };
  }
  const k = unit === 'cm' ? 1 : IN_TO_CM;
  const read = (v, name) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push(`${name} must be a positive number`);
      return null;
    }
    return n * k;
  };

  let diameter = read(pan.diameter, 'diameter');
  let side = read(pan.side, 'side');
  let length = read(pan.length, 'length');
  let width = read(pan.width, 'width');
  let depth = read(pan.depth, 'depth');

  if (shape === 'loaf') {
    if (length && !width) { width = length * 0.5; assumptions.push('width taken as 0.5 x length'); }
    if (length && !depth) { depth = length * 0.3; assumptions.push('depth taken as 0.3 x length'); }
  }
  if ((shape === 'round' || shape === 'bundt') && !depth) { depth = 3 * IN_TO_CM; assumptions.push('depth assumed 3 in'); }
  if (shape === 'square' && !depth) { depth = 3 * IN_TO_CM; assumptions.push('depth assumed 3 in'); }
  if (shape === 'rectangular' && !depth) { depth = 2 * IN_TO_CM; assumptions.push('depth assumed 2 in'); }

  if (shape === 'round' || shape === 'bundt') {
    if (!diameter) errors.push('diameter is required');
  } else if (shape === 'square') {
    if (!side) errors.push('side is required');
  } else if (shape === 'rectangular') {
    if (!length || !width) errors.push('length and width are required');
  } else if (shape === 'loaf') {
    if (!length) errors.push('length is required');
  }

  if (errors.length) {
    return {
      volumeMl: null,
      resolvedCm: { diameter, side, length, width, depth },
      assumptions,
      error: errors.join('; '),
    };
  }

  let volume = null;
  if (shape === 'round') volume = Math.PI * (diameter / 2) ** 2 * depth;
  else if (shape === 'bundt') { volume = Math.PI * (diameter / 2) ** 2 * depth * 0.75; assumptions.push('bundt hollow approximated as 0.75 x cylinder'); }
  else if (shape === 'square') volume = side * side * depth;
  else if (shape === 'rectangular') volume = length * width * depth;
  else if (shape === 'loaf') volume = length * width * depth;

  if (!(volume > 0) || !Number.isFinite(volume)) {
    return {
      volumeMl: null,
      resolvedCm: { diameter, side, length, width, depth },
      assumptions,
      error: 'Pan volume is zero — check the dimensions.',
    };
  }

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
  const bad = vols.find((v) => v.error);
  if (bad) {
    return { error: `Every pan needs valid dimensions. ${bad.error}` };
  }
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
  if (!(masterBatterG > 0)) {
    throw new CalcError('Master recipe has no ingredient weight to scale from — confirm flagged rows first.');
  }

  const vol = panVolume(pan);
  if (vol.error || !(vol.volumeMl > 0)) {
    throw new CalcError(vol.error || 'Pan volume is zero — check the dimensions.');
  }
  const volumeMl = vol.volumeMl;

  const densityAssumed = Number(batterDensityAssumed);
  if (!Number.isFinite(densityAssumed) || densityAssumed <= 0) {
    throw new CalcError('Assumed batter density must be a positive number.');
  }

  const deep = !!pan.deep || pan.shape === 'bundt';
  const fw = fillWindow(cakeTypeKey, deep);
  let fillPct = fw.pct;
  let fillNote = fw.note;
  if (fillPctOverride != null) {
    const pair = Array.isArray(fillPctOverride) ? fillPctOverride : [fillPctOverride, fillPctOverride];
    const lo = Number(pair[0]);
    const hi = Number(pair[1] ?? pair[0]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi > 100 || lo > hi) {
      throw new CalcError('Fill % must be between 0 and 100, with the low end no higher than the high end.');
    }
    fillPct = [lo, hi];
    fillNote = 'Fill % entered by baker.';
  }

  const calibrated = hasCalibration(calibrationKPerMl);
  const k = calibrated ? Number(calibrationKPerMl) : null;

  // batter weight
  let batter; // { min, max, accuracy, basis }
  if (calibrated) {
    const mid = volumeMl * k;
    batter = {
      min: mid * 0.96, max: mid * 1.04,
      accuracy: ACC.CALCULATED,
      basis: `recipe calibration: ${round(k, 3)} g batter per mL of pan volume (±4%)`,
    };
  } else {
    batter = {
      min: volumeMl * (fillPct[0] / 100) * densityAssumed,
      max: volumeMl * (fillPct[1] / 100) * densityAssumed,
      accuracy: ACC.ESTIMATED,
      basis: `generic ${fillPct[0]}–${fillPct[1]}% fill x ${densityAssumed} g/mL assumed batter density`,
    };
  }

  // scaling factor (range from the batter range; midpoint drives the ingredient list)
  const sf = {
    min: batter.min / masterBatterG,
    max: batter.max / masterBatterG,
    mid: ((batter.min + batter.max) / 2) / masterBatterG,
  };

  const scaled = master.map((r) => {
    const masterGrams = round(Number(r.grams) || 0, 1);
    if (r.measurementType === 'count' && r.count != null && r.count > 0) {
      // COUNT stays a count. Scale the number, round to a whole item, and
      // recompute the estimated weight range from that whole count.
      const scaledCount = Math.max(1, Math.round(r.count * sf.mid));
      const per = r.gramsRange ? [r.gramsRange.min / r.count, r.gramsRange.max / r.count] : null;
      const gramsRange = per ? { min: round(scaledCount * per[0], 1), max: round(scaledCount * per[1], 1) } : null;
      return {
        name: r.name, canonical: r.canonical ?? null, category: r.category ?? null,
        measurementType: 'count', countNoun: r.countNoun ?? null,
        masterCount: r.count, count: scaledCount,
        masterGrams,
        grams: gramsRange ? round((gramsRange.min + gramsRange.max) / 2, 1) : round(masterGrams * sf.mid, 1),
        gramsRange,
      };
    }
    return {
      name: r.name, canonical: r.canonical ?? null, category: r.category ?? null,
      measurementType: r.measurementType ?? null,
      masterGrams,
      grams: round(masterGrams * sf.mid, 1),
    };
  });

  // baked weight
  const ret = retentionWindow(cakeTypeKey);
  const baked = {
    min: batter.min * (ret[0] / 100),
    max: batter.max * (ret[1] / 100),
    accuracy: weakest(batter.accuracy, ACC.ESTIMATED),
    retentionPct: ret,
  };

  // count-based ingredients (eggs, bananas, apples, ...) — keep them as counts,
  // advise on rounding when the scaled count isn't whole.
  const targetBase = (masterBase || 0) * sf.mid;
  const countAdvice = master
    .filter((r) => r.measurementType === 'count' && r.count != null && r.count > 0)
    .map((r) => {
      const exact = r.count * sf.mid;
      const rounded = Math.max(1, Math.round(exact));
      const fractional = Math.abs(exact - rounded) > 0.12;
      const perUnitMid = r.gramsRange && r.count
        ? ((r.gramsRange.min + r.gramsRange.max) / 2) / r.count
        : (r.grams && r.count ? r.grams / r.count : 0);
      const shift = targetBase > 0 ? Math.abs((rounded - exact) * perUnitMid) / targetBase : 0;
      const noun = r.countNoun || 'item';
      const isEgg = r.category === 'egg';
      const gr = r.gramsRange && r.count
        ? { min: round(rounded * (r.gramsRange.min / r.count), 0), max: round(rounded * (r.gramsRange.max / r.count), 0) }
        : null;
      return {
        name: r.name, noun,
        masterCount: r.count,
        exactCount: round(exact, 2),
        roundedCount: rounded,
        gramsRange: gr,
        fractional,
        ratioShiftPct: round(shift * 100, 1),
        warnRounding: fractional && shift > 0.05,
        guidance: !fractional
          ? `${rounded} ${noun}${rounded === 1 ? '' : 's'}${gr ? ` (~${gr.min}–${gr.max} g)` : ''}.`
          : isEgg
            ? `use ${rounded} ${noun}${rounded === 1 ? '' : 's'}, or weigh ${round(exact * perUnitMid, 0)} g of beaten egg for accuracy.`
            : `use ${rounded} ${noun}${rounded === 1 ? '' : 's'}${gr ? ` (~${gr.min}–${gr.max} g)` : ''}.`,
        note: fractional && shift > 0.05
          ? `Rounding to ${rounded} shifts this ingredient's share of the dry base by ${round(shift * 100, 1)}% (> 5%).`
          : null,
      };
    });

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
    countAdvice,
    densitySource: calibrated ? 'calibration' : 'generic-fill-table',
    calibrationKPerMl: calibrated ? k : null,
    // batter-per-mL-of-pan-volume actually in use (fill x density), and the
    // density that implies IF the fill matched this cake type's generic table.
    yieldKPerMl: round(calibrated ? k : ((fillPct[0] + fillPct[1]) / 200) * densityAssumed, 3),
    impliedDensity: round((calibrated ? k : ((fillPct[0] + fillPct[1]) / 200) * densityAssumed) /
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
