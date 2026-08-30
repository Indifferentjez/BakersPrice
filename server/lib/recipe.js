// Turn a parsed ingredient list into measured "master" rows plus a classification.
// Shared by the parse-preview, recipe-save and calc routes.
//
// Every row keeps its original measurement (count / volume / weight) and adds a
// gram estimate. Count rows are never reduced to grams as their only record.

import { measureList } from './measure.js';
import { classify } from './classify.js';

// parsed:    [{ name, quantity, unit, grams?, notes? }]
// overrides: { [index]: { grams } }  — baker-entered weights that win over the unit
export function resolveRecipe(parsed = [], overrides = {}) {
  const rows = parsed.map((r, i) => {
    const ov = overrides[i] ?? overrides[String(i)];
    const gramsOverride = ov && ov.grams != null && ov.grams !== '' ? Number(ov.grams)
      : (r.gramsOverride ?? (r.grams != null && r.grams !== '' ? Number(r.grams) : undefined));
    return { ...r, gramsOverride };
  });

  const measured = measureList(rows);

  const master = measured.map((r) => ({
    name: r.name,
    quantity: r.originalQuantity ?? r.quantity ?? r.qty ?? null,
    unit: r.originalUnit ?? r.unit ?? null,
    notes: r.notes ?? null,
    measurementType: r.measurementType,
    count: r.count ?? null,
    countNoun: r.countNoun ?? null,
    grams: r.grams,
    gramsRange: r.gramsRange ?? null,
    gramsSource: r.gramsSource,
    needsConfirm: r.needsConfirm,
    canonical: r.masterKey ?? r.canonical ?? null,
    masterKey: r.masterKey ?? null,
    category: r.category,
    note: r.note ?? null,
  }));

  const priced = master.filter((r) => r.grams != null);
  const classification = classify(priced);
  const unresolved = master
    .filter((r) => r.needsConfirm || r.grams == null)
    .map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, note: r.note }));

  return {
    master,
    classification,
    unresolved,
    totalMasterGrams: Math.round(priced.reduce((a, r) => a + r.grams, 0) * 10) / 10,
  };
}
