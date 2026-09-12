import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { resolveRecipe } from '../lib/recipe.js';
import { classify, CAKE_TYPES, knownCakeType } from '../lib/classify.js';
import { calculate, hasCalibration, PAN_SHAPES, PAN_UNITS, CalcError } from '../lib/calcEngine.js';
import { priceBake } from '../lib/cost.js';
import { pricesByKey } from '../lib/masterIngredients.js';
import { auditCalculation } from '../lib/audit.js';
import { readUserDefaults, defaultsTemplate } from '../lib/auth.js';

const router = Router();

const calcLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.VITEST === 'true',
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many calculations. Wait a bit and try again.' },
});

const getRecipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?');
const getDefaultCalib = db.prepare('SELECT k_per_ml FROM calibrations WHERE recipe_id = ? AND is_recipe_default = 1 LIMIT 1');
const saveCalc = db.prepare(`
  INSERT INTO calculations (user_id, recipe_id, inputs_json, result_json, price_json, audit_json, created_at)
  VALUES (@user_id, @recipe_id, @inputs_json, @result_json, @price_json, @audit_json, datetime('now'))
`);

const n = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

router.get('/meta', (_req, res) => {
  res.json({
    cakeTypes: CAKE_TYPES,
    panShapes: PAN_SHAPES,
    units: PAN_UNITS,
  });
});

router.post('/', calcLimiter, (req, res) => {
  const body = req.body || {};
  const pan = body.pan || {};
  if (!pan.shape) return res.status(400).json({ error: 'pan.shape is required' });
  if (!PAN_SHAPES.includes(pan.shape)) {
    return res.status(400).json({ error: `Unknown pan shape "${pan.shape}". Use ${PAN_SHAPES.join(', ')}.` });
  }
  if (pan.unit && !PAN_UNITS.includes(pan.unit)) {
    return res.status(400).json({ error: `Pan unit must be "in" or "cm", not "${pan.unit}".` });
  }

  // ---- master formula + classification ----
  let master;
  let baseGrams;
  let classification;
  let recipeRow = null;

  if (body.recipeId) {
    if (!req.user) return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHENTICATED' });
    recipeRow = getRecipe.get(body.recipeId, req.user.id);
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

  // grams == null is the live signal from measure.js; needsConfirm is kept for
  // saved recipes and any future path that flags a row while still attaching grams.
  const unresolved = master.filter((m) => m.grams == null || m.needsConfirm);
  if (unresolved.length) {
    return res.status(400).json({
      error: `${unresolved.length} ingredient(s) still need a confirmed weight before scaling.`,
      unresolved: unresolved.map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, note: r.note })),
    });
  }

  if (body.cakeTypeKey && !knownCakeType(body.cakeTypeKey)) {
    return res.status(400).json({ error: `Unknown cake type "${body.cakeTypeKey}".` });
  }

  const cakeTypeKey =
    knownCakeType(body.cakeTypeKey) ||
    knownCakeType(recipeRow?.type_override) ||
    knownCakeType(recipeRow?.detected_type) ||
    knownCakeType(classification.detected) ||
    'unclassified';

  // ---- density: explicit > recipe calibration default > generic fill table ----
  let calibrationKPerMl = n(body.calibrationKPerMl);
  if (calibrationKPerMl == null && body.useCalibration !== false && body.recipeId) {
    calibrationKPerMl = getDefaultCalib.get(body.recipeId)?.k_per_ml ?? null;
  }

  let calc;
  try {
    calc = calculate({
      master,
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
  } catch (err) {
    if (err instanceof CalcError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // ---- costing ----
  const d = req.user ? readUserDefaults(req.user.id) : defaultsTemplate();
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

  // per-recipe ingredient price overrides (from the saved recipe or this request)
  let overrides = {};
  try {
    overrides = {
      ...(recipeRow ? JSON.parse(recipeRow.ingredient_overrides_json || '{}') : {}),
      ...(body.ingredientOverrides || {}),
    };
  } catch { overrides = body.ingredientOverrides || {}; }

  const price = priceBake({
    scaledIngredients: calc.scaledIngredients,
    masterPrices: pricesByKey(),
    overrides,
    bake,
  });

  const audit = auditCalculation(calc, price);

  const inputs = { pan, cakeTypeKey, calibrationKPerMl, fillPctOverride: body.fillPctOverride ?? null, bake };
  let calculationId = null;
  if (req.user) {
    const info = saveCalc.run({
      user_id: req.user.id,
      recipe_id: body.recipeId || null,
      inputs_json: JSON.stringify(inputs),
      result_json: JSON.stringify(calc),
      price_json: JSON.stringify(price),
      audit_json: JSON.stringify(audit),
    });
    calculationId = info.lastInsertRowid;
  }

  res.json({
    calculationId,
    recipe: recipeRow ? { id: recipeRow.id, name: recipeRow.name } : null,
    cakeTypeKey,
    classification,
    densitySource: hasCalibration(calibrationKPerMl) ? 'calibration' : 'generic-fill-table',
    calc,
    price,
    audit,
    bakeUsed: bake,
  });
});

export default router;
