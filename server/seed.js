// Optional first-run sample data: one recipe so the wizard has something to open.
// No ingredient prices are seeded — the brief is explicit that prices must come
// from the baker, never invented.

import { db } from './db.js';
import { resolveRecipe } from './lib/recipe.js';

const SAMPLE = {
  name: 'High-hydration oat & fruit loaf',
  raw_kind: 'manual',
  raw_input: 'Seeded sample — a deliberately high-hydration loaf to show calibration.',
  ingredients: [
    { name: 'rolled oats', quantity: 200, unit: 'g' },
    { name: 'plain flour', quantity: 50, unit: 'g' },
    { name: 'vegetable oil', quantity: 100, unit: 'g' },
    { name: 'large eggs', quantity: 4, unit: 'each' },
    { name: 'greek yogurt', quantity: 400, unit: 'g' },
    { name: 'milk', quantity: 300, unit: 'g' },
    { name: 'mashed banana', quantity: 225, unit: 'g' },
    { name: 'chopped dates', quantity: 300, unit: 'g' },
    { name: 'baking powder', quantity: 10, unit: 'g' },
    { name: 'baking soda', quantity: 5, unit: 'g' },
    { name: 'ground cinnamon', quantity: 6, unit: 'g' },
    { name: 'salt', quantity: 4, unit: 'g' },
  ],
  allergens: 'Contains: gluten (wheat, oats), egg, milk. May contain nuts.',
  notes: 'Bakes long and low. Real 3-tin bake logged 4,719 g batter — use Calibrate to lock the real yield.',
};

const count = db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n;
if (count > 0) {
  console.log(`Recipes already present (${count}) — nothing seeded.`);
  process.exit(0);
}

const r = resolveRecipe(SAMPLE.ingredients);
db.prepare(`
  INSERT INTO recipes (name, raw_input, raw_kind, parsed_json, master_grams_json, detected_type,
                       type_override, ratios_json, classification_json, allergens, notes, created_at, updated_at)
  VALUES (@name, @raw_input, @raw_kind, @parsed_json, @master_grams_json, @detected_type,
          NULL, @ratios_json, @classification_json, @allergens, @notes, datetime('now'), datetime('now'))
`).run({
  name: SAMPLE.name,
  raw_input: SAMPLE.raw_input,
  raw_kind: SAMPLE.raw_kind,
  parsed_json: JSON.stringify(SAMPLE.ingredients),
  master_grams_json: JSON.stringify(r.master),
  detected_type: r.classification.detected,
  ratios_json: JSON.stringify(r.classification.ratios),
  classification_json: JSON.stringify(r.classification),
  allergens: SAMPLE.allergens,
  notes: SAMPLE.notes,
});

console.log(`Seeded sample recipe "${SAMPLE.name}" — detected ${r.classification.detected} (${r.classification.label}).`);
