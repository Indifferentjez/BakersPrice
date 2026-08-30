import { Router } from 'express';
import { db } from '../db.js';
import { resolveRecipe } from '../lib/recipe.js';
import { classify, CAKE_TYPES } from '../lib/classify.js';
import { calculate } from '../lib/calcEngine.js';
import { priceBake } from '../lib/cost.js';
import { auditCalculation } from '../lib/audit.js';

const router = Router();

const getRecipe = db.prepare('SELECT * FROM recipes WHERE id = ?');
const getDefaultCalib = db.prepare('SELECT k_per_ml FROM calibrations WHERE recipe_id = ? AND is_recipe_default = 1 LIMIT 1');
const getDefaults = db.prepare('SELECT * FROM cost_defaults WHERE id = 1');
const listPrices = db.prepare('SELECT * FROM ingredient_prices');
const saveCalc = db.prepare(`
  INSERT INTO calculations (recipe_id, inputs_json, result_json, price_json, audit_json, created_at)
  VALUES (@recipe_id, @inputs_json, @result_json, @price_json, @audit_json, datetime('now'))
`);

const n = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

router.get('/meta', (_req, res) => {
  res.json({
    cakeTypes: CAKE_TYPES,
    panShapes: ['round', 'square', 'rectangular', 'loaf', 'bundt'],
    units: ['in', 'cm'],
  });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const pan = body.pan || {};
  if (!pan.shape) return res.status(400).json({ error: 'pan.shape is required' });

  // ---- master formula + classification ----
  let master;
  let baseGrams;
  let classification;
  let recipeRow = null;

  if (body.recipeId) {
    recipeRow = getRecipe.get(body.recipeId);
    if (!recipeRow) return res.status(404).json({ error: 'Recipe not found' });
    master = JSON.parse(recipeRow.master_grams_json || '[]');
    classification = JSON.parse(recipeRow.classification_json || 'null') || classify(master);
    baseGrams = classification.base?.grams ?? 0;
  } else if (Array.isArray(body.master) && body.master.length) {
    const r = resolveRecipe(body.master, body.overrides || {});
    master = r.master;
    classification = r.classification;
    baseGrams = classification.base?.grams ?? 0;
  } else {
    return res.status(400).json({ error: 'Provide recipeId or a master ingredient list.' });
  }

  const priced = master.filter((m) => m.grams != null);
  if (!priced.length) return res.status(400).json({ error: 'No ingredient weights resolved — confirm the flagged rows first.' });

  const cakeTypeKey =
    body.cakeTypeKey ||
    recipeRow?.type_override ||
    recipeRow?.detected_type ||
    classification.detected ||
    'unclassified';

  // ---- density: explicit > recipe calibration default > generic fill table ----
  let calibrationKPerMl = n(body.calibrationKPerMl);
  if (calibrationKPerMl == null && body.useCalibration !== false && body.recipeId) {
    calibrationKPerMl = getDefaultCalib.get(body.recipeId)?.k_per_ml ?? null;
  }

  const calc = calculate({
    master: priced,
    base: baseGrams,
    cakeTypeKey,
    pan: {
      shape: pan.shape,
      unit: pan.unit || 'in',
      diameter: pan.diameter, side: pan.side, length: pan.length, width: pan.width, depth: pan.depth,
      deep: !!pan.deep,
    },
    calibrationKPerMl,
    fillPctOverride: body.fillPctOverride ?? null,
  });

  // ---- costing ----
  const d = getDefaults.get();
  const b = body.bake || {};
  const bake = {
    labourMinutes: n(b.labourMinutes ?? d.labour_minutes),
    hourlyRate: n(b.hourlyRate ?? d.hourly_rate),
    energyCost: n(b.energyCost ?? d.energy_cost) ?? 0,
    packagingCost: n(b.packagingCost ?? d.packaging_cost) ?? 0,
    overheadPct: n(b.overheadPct ?? d.overhead_pct) ?? 0,
    marginMinPct: n(b.marginMinPct ?? d.margin_min_pct) ?? 28,
    marginStdPct: n(b.marginStdPct ?? d.margin_std_pct) ?? 50,
    marginPremiumPct: n(b.marginPremiumPct ?? d.margin_premium_pct) ?? 65,
    currency: b.currency || d.currency || 'GBP',
  };

  const price = priceBake({
    scaledIngredients: calc.scaledIngredients.map((r) => ({ ...r, perEgg: r.perEgg || 50 })),
    priceList: listPrices.all().map((p) => ({
      name: p.name, canonical: p.canonical,
      pricePerG: p.price_per_g, pricePerEgg: p.price_per_egg,
    })),
    bake,
  });

  const audit = auditCalculation(calc, price);

  const inputs = { pan, cakeTypeKey, calibrationKPerMl, fillPctOverride: body.fillPctOverride ?? null, bake };
  const info = saveCalc.run({
    recipe_id: body.recipeId || null,
    inputs_json: JSON.stringify(inputs),
    result_json: JSON.stringify(calc),
    price_json: JSON.stringify(price),
    audit_json: JSON.stringify(audit),
  });

  res.json({
    calculationId: info.lastInsertRowid,
    recipe: recipeRow ? { id: recipeRow.id, name: recipeRow.name } : null,
    cakeTypeKey,
    classification,
    densitySource: calibrationKPerMl ? 'calibration' : 'generic-fill-table',
    calc,
    price,
    audit,
    bakeUsed: bake,
  });
});

export default router;
