import { Router } from 'express';
import { db } from '../db.js';
import { backCalcDensity } from '../lib/calcEngine.js';

const router = Router();

const recipeExists = db.prepare('SELECT id FROM recipes WHERE id = ?');
const insert = db.prepare(`
  INSERT INTO calibrations (recipe_id, pans_json, actual_batter_g, k_per_ml, total_volume_ml, is_recipe_default, note, created_at)
  VALUES (@recipe_id, @pans_json, @actual_batter_g, @k_per_ml, @total_volume_ml, @is_recipe_default, @note, datetime('now'))
`);
const clearDefault = db.prepare('UPDATE calibrations SET is_recipe_default = 0 WHERE recipe_id = ?');
const setDefault = db.prepare('UPDATE calibrations SET is_recipe_default = 1 WHERE id = ?');
const listForRecipe = db.prepare('SELECT * FROM calibrations WHERE recipe_id = ? ORDER BY created_at DESC');
const del = db.prepare('DELETE FROM calibrations WHERE id = ?');

// Preview a back-calc without saving. body: { pans:[...], actualBatterG }
router.post('/preview', (req, res) => {
  const { pans = [], actualBatterG } = req.body || {};
  const r = backCalcDensity({ pans, actualBatterG: Number(actualBatterG) });
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// Save a calibration. body: { recipeId, pans, actualBatterG, makeDefault, note }
router.post('/', (req, res) => {
  const { recipeId, pans = [], actualBatterG, makeDefault = true, note } = req.body || {};
  if (!recipeExists.get(recipeId)) return res.status(404).json({ error: 'Recipe not found' });
  const calc = backCalcDensity({ pans, actualBatterG: Number(actualBatterG) });
  if (calc.error) return res.status(400).json(calc);

  const tx = db.transaction(() => {
    if (makeDefault) clearDefault.run(recipeId);
    const info = insert.run({
      recipe_id: recipeId,
      pans_json: JSON.stringify(pans),
      actual_batter_g: Number(actualBatterG),
      k_per_ml: calc.kPerMl,
      total_volume_ml: calc.totalVolumeMl,
      is_recipe_default: makeDefault ? 1 : 0,
      note: note ? String(note) : calc.note,
    });
    return info.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ id, ...calc, isDefault: !!makeDefault, calibrations: listForRecipe.all(recipeId) });
});

router.post('/:id/make-default', (req, res) => {
  const row = db.prepare('SELECT * FROM calibrations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.transaction(() => {
    clearDefault.run(row.recipe_id);
    setDefault.run(row.id);
  })();
  res.json({ ok: true, calibrations: listForRecipe.all(row.recipe_id) });
});

router.delete('/:id', (req, res) => {
  del.run(req.params.id);
  res.status(204).end();
});

export default router;
