import { Router } from 'express';
import { db } from '../db.js';
import { resolveRecipe } from '../lib/recipe.js';

const router = Router();

const listStmt = db.prepare(`
  SELECT r.id, r.name, r.raw_kind, r.detected_type, r.type_override, r.allergens, r.created_at, r.updated_at,
         (SELECT COUNT(*) FROM calibrations c WHERE c.recipe_id = r.id) AS calibration_count,
         (SELECT k_per_ml FROM calibrations c WHERE c.recipe_id = r.id AND c.is_recipe_default = 1 LIMIT 1) AS default_k_per_ml
  FROM recipes r ORDER BY r.updated_at DESC
`);
const getStmt = db.prepare('SELECT * FROM recipes WHERE id = ?');
const calibStmt = db.prepare('SELECT * FROM calibrations WHERE recipe_id = ? ORDER BY created_at DESC');
const insertStmt = db.prepare(`
  INSERT INTO recipes (name, raw_input, raw_kind, parsed_json, master_grams_json, detected_type,
                       type_override, ratios_json, classification_json, allergens, notes,
                       ingredient_overrides_json, created_at, updated_at)
  VALUES (@name, @raw_input, @raw_kind, @parsed_json, @master_grams_json, @detected_type,
          @type_override, @ratios_json, @classification_json, @allergens, @notes,
          @ingredient_overrides_json, datetime('now'), datetime('now'))
`);
const updateStmt = db.prepare(`
  UPDATE recipes SET name=@name, raw_input=@raw_input, raw_kind=@raw_kind, parsed_json=@parsed_json,
    master_grams_json=@master_grams_json, detected_type=@detected_type, type_override=@type_override,
    ratios_json=@ratios_json, classification_json=@classification_json, allergens=@allergens,
    notes=@notes, ingredient_overrides_json=@ingredient_overrides_json, updated_at=datetime('now')
  WHERE id=@id
`);
const delStmt = db.prepare('DELETE FROM recipes WHERE id = ?');

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    parsed: safeParse(row.parsed_json, []),
    master: safeParse(row.master_grams_json, []),
    classification: safeParse(row.classification_json, null),
    ratios: safeParse(row.ratios_json, null),
    ingredientOverrides: safeParse(row.ingredient_overrides_json, {}),
    calibrations: calibStmt.all(row.id).map((c) => ({ ...c, pans: safeParse(c.pans_json, []) })),
    effectiveType: row.type_override || row.detected_type,
  };
}
function safeParse(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

function bodyToRow(body) {
  const parsed = body.parsed || body.ingredients || [];
  const overrides = body.overrides || {};
  const resolved = resolveRecipe(parsed, overrides);
  return {
    name: String(body.name || resolved.master[0]?.name || 'Untitled recipe').trim(),
    raw_input: body.raw_input ?? body.rawInput ?? null,
    raw_kind: body.raw_kind ?? body.rawKind ?? 'manual',
    parsed_json: JSON.stringify(parsed),
    master_grams_json: JSON.stringify(resolved.master),
    detected_type: resolved.classification.detected,
    type_override: body.type_override ?? body.typeOverride ?? null,
    ratios_json: JSON.stringify(resolved.classification.ratios),
    classification_json: JSON.stringify(resolved.classification),
    allergens: body.allergens ? String(body.allergens) : null,
    notes: body.notes ? String(body.notes) : null,
    ingredient_overrides_json: JSON.stringify(
      body.ingredientOverrides ?? body.ingredient_overrides ?? safeParse(body.ingredient_overrides_json, {}),
    ),
  };
}

router.get('/', (_req, res) => res.json(listStmt.all()));

router.get('/:id', (req, res) => {
  const row = hydrate(getStmt.get(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const row = bodyToRow(req.body);
  const info = insertStmt.run(row);
  res.status(201).json(hydrate(getStmt.get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = getStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // allow partial: type override only
  if (req.body.onlyTypeOverride) {
    updateStmt.run({
      ...existing,
      type_override: req.body.type_override ?? null,
    });
    return res.json(hydrate(getStmt.get(req.params.id)));
  }
  const row = bodyToRow({ ...existing, ...req.body });
  updateStmt.run({ ...row, id: Number(req.params.id) });
  res.json(hydrate(getStmt.get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  delStmt.run(req.params.id);
  res.status(204).end();
});

export default router;
