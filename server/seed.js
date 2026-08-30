// Optional first-run sample data: one recipe so the wizard has something to open.
// Master ingredient catalogue is seeded separately (server/lib/masterIngredients.js);
// its prices start null and are imported by the baker (Aldi basis).

import { db } from './db.js';
import { bootstrap } from './lib/masterIngredients.js';
import { resolveRecipe } from './lib/recipe.js';

bootstrap();

const SAMPLE = {
  name: 'Banana & oat loaf',
  raw_kind: 'manual',
  raw_input: 'Seeded sample — mixes count, volume and weight measurements.',
  ingredients: [
    { name: 'ripe bananas', quantity: 4, unit: 'each' },   // count-based, kept as a count
    { name: 'large eggs', quantity: 3, unit: 'each' },      // count-based
    { name: 'rolled oats', quantity: 2, unit: 'cups' },     // volume -> grams
    { name: 'plain flour', quantity: 1.5, unit: 'cups' },   // volume -> grams
    { name: 'vegetable oil', quantity: 120, unit: 'g' },    // weight, kept as-is
    { name: 'greek yogurt', quantity: 250, unit: 'g' },
    { name: 'honey', quantity: 0.5, unit: 'cup' },
    { name: 'baking powder', quantity: 2, unit: 'tsp' },
    { name: 'baking soda', quantity: 1, unit: 'tsp' },
    { name: 'salt', quantity: 0.5, unit: 'tsp' },
  ],
  allergens: 'Contains: gluten (wheat, oats), egg, milk.',
  notes: 'Sample recipe. Bananas and eggs stay as counts; cups convert with each ingredient\'s own density.',
};

const count = db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n;
if (count > 0) {
  console.log(`Recipes already present (${count}) — nothing seeded.`);
  process.exit(0);
}

const r = resolveRecipe(SAMPLE.ingredients);
db.prepare(`
  INSERT INTO recipes (name, raw_input, raw_kind, parsed_json, master_grams_json, detected_type,
                       type_override, ratios_json, classification_json, allergens, notes,
                       ingredient_overrides_json, created_at, updated_at)
  VALUES (@name, @raw_input, @raw_kind, @parsed_json, @master_grams_json, @detected_type,
          NULL, @ratios_json, @classification_json, @allergens, @notes, '{}', datetime('now'), datetime('now'))
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
