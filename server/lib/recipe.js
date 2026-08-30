// Turn a parsed ingredient list into grams-resolved "master" rows plus a
// classification. Shared by the recipe-save route and the calc route.

import { ingredientsToGrams, CANONICAL } from './conversions.js';
import { classify } from './classify.js';

function perEggFor(row) {
  const e = CANONICAL.find((c) => c.key === (row.canonical || 'egg'));
  if (!e || !e.sizes) return 50;
  const n = String(row.name || '').toLowerCase();
  for (const [label, grams] of Object.entries(e.sizes)) if (n.includes(label)) return grams;
  return e.perEach || 50;
}

// parsed: [{ name, quantity, unit, grams?, notes? }]
// overrides: { [index]: { grams } }  — baker-confirmed weights for flagged rows
export function resolveRecipe(parsed, overrides = {}) {
  const withGrams = ingredientsToGrams(
    parsed.map((r, i) => {
      const ov = overrides[i] ?? overrides[String(i)];
      if (ov && ov.grams != null && ov.grams !== '') {
        return { ...r, grams: Number(ov.grams), unit: undefined };
      }
      return r;
    }),
  );

  const master = withGrams.map((r) => ({
    name: r.name,
    quantity: r.quantity ?? r.qty ?? null,
    unit: r.unit ?? null,
    notes: r.notes ?? null,
    grams: r.grams,
    gramsRange: r.gramsRange ?? null,
    gramsSource: r.gramsSource,
    needsConfirm: r.needsConfirm,
    canonical: r.canonical,
    category: r.category,
    note: r.note,
    perEgg: r.category === 'egg' ? perEggFor(r) : undefined,
  }));

  const priced = master.filter((r) => r.grams != null);
  const classification = classify(priced);
  const unresolved = master.filter((r) => r.needsConfirm || r.grams == null);

  return {
    master,
    classification,
    unresolved: unresolved.map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, note: r.note })),
    totalMasterGrams: Math.round(priced.reduce((a, r) => a + r.grams, 0) * 10) / 10,
  };
}
