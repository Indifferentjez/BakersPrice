// Measurement engine. Turns a recipe line (name + quantity + unit, or a
// baker-entered gram override) into a normalised row that ALWAYS keeps the
// original measurement and ADDS derived information — it never replaces a count
// or a volume with grams as the sole record.
//
// Row shape:
//   { name, originalQuantity, originalUnit,
//     masterKey, canonical, category, measurementType,   // 'weight'|'volume'|'count'
//     count, countNoun,                                   // preserved, authoritative
//     grams, gramsRange:{min,max}|null,                   // estimate, for math only
//     gramsSource, needsConfirm, note }

import { parseQty } from './qty.js';
import { resolve, categoryOf } from './masterIngredients.js';

const MASS_UNITS = {
  g: 1, gram: 1, grams: 1, gr: 1, gm: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};
// millilitres per unit, on a 240 ml cup basis (cup/16 = tbsp, cup/48 = tsp)
const VOLUME_UNITS_ML = {
  cup: 240, cups: 240, c: 240,
  tbsp: 15, tbsps: 15, tablespoon: 15, tablespoons: 15, tbs: 15, tb: 15,
  tsp: 5, tsps: 5, teaspoon: 5, teaspoons: 5,
  ml: 1, milliliter: 1, millilitre: 1, milliliters: 1, millilitres: 1, cc: 1,
  l: 1000, liter: 1000, litre: 1000, liters: 1000, litres: 1000,
  'fl oz': 30, floz: 30, 'fluid ounce': 30, 'fluid ounces': 30,
  pint: 480, pints: 480, quart: 960,
};
const COUNT_UNITS = new Set([
  '', 'each', 'ea', 'whole', 'x', 'pcs', 'pc', 'piece', 'pieces', 'count', 'unit', 'units',
  'clove', 'cloves', 'stick', 'sticks', 'sheet', 'sheets',
]);

const cupsOf = (qty, unit) => (qty * VOLUME_UNITS_ML[unit]) / 240;
const tspOf = (qty, unit) => (qty * VOLUME_UNITS_ML[unit]) / 5;

function sizeRange(entry, rawName) {
  if (entry.sizes) {
    const n = String(rawName || '').toLowerCase();
    for (const [label, range] of Object.entries(entry.sizes)) {
      if (n.includes(label)) return Array.isArray(range) ? range : [range, range];
    }
  }
  return entry.gramsPerUnit || [null, null];
}

function base(name, quantity, unit, entry) {
  return {
    name,
    originalQuantity: quantity ?? null,
    originalUnit: unit ?? null,
    masterKey: entry?.key ?? null,
    canonical: entry?.key ?? null, // back-compat for classify.js
    category: entry?.category ?? categoryOf(name),
  };
}
function unresolved(b, note) {
  return {
    ...b, measurementType: null, count: null, countNoun: null,
    grams: null, gramsRange: null, gramsSource: 'none', needsConfirm: true, note,
  };
}

export function measureIngredient({ name, quantity, unit, gramsOverride } = {}) {
  const q = parseQty(quantity);
  const rawUnit = String(unit || '').toLowerCase().trim();
  const entry = resolve(name);
  const b = base(name, quantity, unit, entry);
  const isCountUnit = COUNT_UNITS.has(rawUnit);

  // 1. Explicit gram override — wins over everything. Keep the original count/unit
  //    for display; only the number used for maths changes.
  const ov = Number(gramsOverride);
  if (gramsOverride != null && gramsOverride !== '' && Number.isFinite(ov)) {
    const keepCount = entry?.measurementType === 'count' && (isCountUnit || !(rawUnit in VOLUME_UNITS_ML)) && Number.isFinite(q)
      ? q : null;
    return {
      ...b,
      measurementType: entry?.measurementType || 'weight',
      count: keepCount,
      countNoun: keepCount != null ? (entry.countNoun || null) : null,
      grams: ov, gramsRange: null, gramsSource: 'manual', needsConfirm: false,
      note: keepCount != null ? `Weight set by baker; recipe still requires ${keepCount} ${entry.countNoun || 'items'}.` : 'Weight set by baker.',
    };
  }

  // 2. Mass unit given — authoritative, no conversion, no catalogue needed.
  if (rawUnit in MASS_UNITS) {
    if (!Number.isFinite(q)) return unresolved(b, 'Could not read the quantity.');
    return {
      ...b, measurementType: 'weight', count: null, countNoun: null,
      grams: q * MASS_UNITS[rawUnit], gramsRange: null, gramsSource: 'given-weight',
      needsConfirm: false, note: null,
    };
  }

  if (!entry) {
    return unresolved(b, `"${name}" is not in the ingredient catalogue — enter its weight in grams, or add it under Ingredients.`);
  }
  if (!Number.isFinite(q)) return unresolved(b, 'Could not read the quantity.');

  // 3. Count-based ingredient — KEEP THE COUNT, add an estimated weight range.
  if (entry.measurementType === 'count' && (isCountUnit || !(rawUnit in VOLUME_UNITS_ML))) {
    const [lo, hi] = sizeRange(entry, name);
    if (lo == null) return unresolved(b, `No weight-per-unit for ${entry.displayName} — enter grams.`);
    const gramsRange = { min: round4(q * lo), max: round4(q * hi) };
    return {
      ...b, measurementType: 'count',
      count: q, countNoun: entry.countNoun || null,
      grams: round4((gramsRange.min + gramsRange.max) / 2),
      gramsRange, gramsSource: 'count-estimate', needsConfirm: false,
      note: `${q} ${entry.countNoun || 'x'} — estimated ${lo}–${hi} g each. The count is what the recipe requires; grams are an estimate.`,
    };
  }

  // 4. Volume unit + this ingredient's own density.
  if (rawUnit in VOLUME_UNITS_ML && entry.densityGPerCup != null) {
    return {
      ...b, measurementType: 'volume', count: null, countNoun: null,
      grams: round4(cupsOf(q, rawUnit) * entry.densityGPerCup),
      gramsRange: null, gramsSource: 'volume-density', needsConfirm: false,
      note: `${q} ${rawUnit} × ${entry.densityGPerCup} g/cup for ${entry.displayName}.`,
    };
  }

  // 5. Per-teaspoon ingredient (leavening / salt / extract) in tsp/tbsp/...
  if (rawUnit in VOLUME_UNITS_ML && entry.gPerTsp) {
    const [lo, hi] = entry.gPerTsp;
    const t = tspOf(q, rawUnit);
    const min = round4(t * lo);
    const max = round4(t * hi);
    return {
      ...b, measurementType: 'volume', count: null, countNoun: null,
      grams: round4((min + max) / 2),
      gramsRange: lo === hi ? null : { min, max },
      gramsSource: 'volume-density', needsConfirm: false,
      note: lo === hi ? null : `Catalogue lists ${lo}–${hi} g/tsp; midpoint used.`,
    };
  }

  return unresolved(b, `Unrecognised unit "${unit || ''}" for ${entry.displayName} — enter grams.`);
}

// Whole parsed list -> measured rows.
// rows: [{ name, quantity, unit, grams?, gramsOverride?, notes? }]
export function measureList(rows = []) {
  return rows.map((row) => {
    const override = row.gramsOverride ?? (row.grams != null && row.grams !== '' ? row.grams : undefined);
    const m = measureIngredient({
      name: row.name,
      quantity: row.quantity ?? row.qty,
      unit: row.unit,
      gramsOverride: override,
    });
    return { ...row, ...m, notes: row.notes ?? row.note ?? m.note ?? null };
  });
}

function round4(n) {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000;
}

export { MASS_UNITS, VOLUME_UNITS_ML, COUNT_UNITS };
