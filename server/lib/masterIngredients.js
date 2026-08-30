// Central ingredient catalogue: measurement/conversion data + a default price per
// ingredient. Backed by the master_ingredients table, seeded once from
// server/data/master-ingredients.json, then editable via /api/master-ingredients.
//
// This module owns ingredient *identity* (name -> catalogue entry) and the
// per-ingredient reference data. server/lib/measure.js turns a recipe line
// (quantity + unit) into weight/count using it. server/lib/cost.js prices with it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'data', 'master-ingredients.json');

// ---------------------------------------------------------------- name matching
// Prep words that never change which ingredient we mean. Distinguishing words
// (caster, brown, cake, self-raising, large, grated, mashed...) are kept.
const PREP_WORDS = new Set([
  'sifted', 'melted', 'softened', 'room', 'temperature', 'cold', 'warm', 'lukewarm',
  'beaten', 'fresh', 'organic', 'good', 'quality', 'pure', 'plus', 'extra', 'for',
  'greasing', 'dusting', 'about', 'approx', 'level', 'heaped', 'roughly', 'lightly',
  'well', 'the', 'of', 'and', 'a', 'to', 'serve', 'optional', 'divided', 'or',
  'more', 'as', 'needed', 'drained', 'rinsed', 'packed',
]);

function singular(t) {
  if (t.length > 3 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}
export function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .filter((t) => t && !PREP_WORDS.has(t));
}

// ---------------------------------------------------------------- normalisation
function normEntry(row) {
  return {
    id: row.id ?? null,
    key: row.key,
    displayName: row.display_name ?? row.displayName ?? row.key,
    aliases: parseJson(row.aliases_json ?? row.aliases, []),
    measurementType: row.measurement_type ?? row.measurementType,
    category: row.category || 'other',
    densityGPerCup: numOrNull(row.density_g_per_cup ?? row.densityGPerCup),
    gPerTsp: rangeOrNull(row.g_per_tsp_min ?? row.gPerTspMin, row.g_per_tsp_max ?? row.gPerTspMax),
    gramsPerUnit: rangeOrNull(row.grams_per_unit_min ?? row.gramsPerUnitMin, row.grams_per_unit_max ?? row.gramsPerUnitMax),
    countNoun: row.count_noun ?? row.countNoun ?? null,
    sizes: parseJson(row.sizes_json ?? row.sizes, null),
    price: numOrNull(row.price),
    priceUnit: row.price_unit ?? row.priceUnit ?? 'kg',
    priceBasis: row.price_basis ?? row.priceBasis ?? 'Aldi',
    priceUpdatedAt: row.price_updated_at ?? row.priceUpdatedAt ?? null,
    source: row.source || 'manual',
  };
}
function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function rangeOrNull(a, b) {
  const lo = numOrNull(a);
  const hi = numOrNull(b);
  if (lo == null && hi == null) return null;
  return [lo ?? hi, hi ?? lo];
}

// ---------------------------------------------------------------- bootstrap
const insertStmt = () => db.prepare(`
  INSERT INTO master_ingredients
    (key, display_name, aliases_json, measurement_type, category, density_g_per_cup,
     g_per_tsp_min, g_per_tsp_max, grams_per_unit_min, grams_per_unit_max, count_noun,
     sizes_json, price, price_unit, price_basis, price_updated_at, source)
  VALUES
    (@key, @display_name, @aliases_json, @measurement_type, @category, @density_g_per_cup,
     @g_per_tsp_min, @g_per_tsp_max, @grams_per_unit_min, @grams_per_unit_max, @count_noun,
     @sizes_json, @price, @price_unit, @price_basis, @price_updated_at, @source)
`);

function seedRow(x) {
  const gt = Array.isArray(x.g_per_tsp) ? x.g_per_tsp : [x.g_per_tsp_min, x.g_per_tsp_max];
  return {
    key: x.key,
    display_name: x.display_name || x.key,
    aliases_json: JSON.stringify(x.aliases || []),
    measurement_type: x.measurement_type,
    category: x.category || 'other',
    density_g_per_cup: x.density_g_per_cup ?? null,
    g_per_tsp_min: gt?.[0] ?? null,
    g_per_tsp_max: gt?.[1] ?? gt?.[0] ?? null,
    grams_per_unit_min: x.grams_per_unit_min ?? null,
    grams_per_unit_max: x.grams_per_unit_max ?? x.grams_per_unit_min ?? null,
    count_noun: x.count_noun ?? null,
    sizes_json: x.sizes ? JSON.stringify(x.sizes) : null,
    price: x.price ?? null,
    price_unit: x.price_unit || (x.measurement_type === 'count' ? 'each' : 'kg'),
    price_basis: x.price_basis || 'Aldi',
    price_updated_at: x.price != null ? new Date().toISOString() : null,
    source: x.source || 'seed',
  };
}

function loadSeedFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : (raw.ingredients || []);
  } catch (e) {
    console.error('master-ingredients seed missing/invalid:', e.message);
    return [];
  }
}

let booted = false;
export function bootstrap() {
  if (booted) return;
  booted = true;
  syncSeed();
  migrateLegacyPrices();
  invalidate();
}

// Keep the catalogue in step with server/data/master-ingredients.json on every
// boot: insert new keys, refresh measurement/conversion data for existing keys,
// and adopt the seed price ONLY where the baker hasn't set one of their own
// (current price NULL, or last set by a seed — basis 'Aldi'/'migrated'/'seed').
function syncSeed() {
  const rows = loadSeedFile();
  if (!rows.length) return;
  const existing = new Map(
    db.prepare('SELECT key, price, price_unit, price_basis FROM master_ingredients').all().map((r) => [r.key, r]),
  );
  const ins = insertStmt();
  const updStruct = db.prepare(`
    UPDATE master_ingredients SET display_name=@display_name, aliases_json=@aliases_json,
      measurement_type=@measurement_type, category=@category, density_g_per_cup=@density_g_per_cup,
      g_per_tsp_min=@g_per_tsp_min, g_per_tsp_max=@g_per_tsp_max,
      grams_per_unit_min=@grams_per_unit_min, grams_per_unit_max=@grams_per_unit_max,
      count_noun=@count_noun, sizes_json=@sizes_json, updated_at=datetime('now')
    WHERE key=@key`);
  const updPrice = db.prepare(`
    UPDATE master_ingredients SET price=@price, price_unit=@price_unit, price_basis='Aldi',
      price_updated_at=datetime('now'), updated_at=datetime('now') WHERE key=@key`);

  let inserted = 0;
  let repriced = 0;
  const bakerSet = new Set(['manual', 'override-push', 'migrated']);
  const tx = db.transaction(() => {
    for (const raw of rows) {
      const row = seedRow(raw);
      const cur = existing.get(row.key);
      if (!cur) { ins.run(row); inserted += 1; continue; }
      updStruct.run(row);
      const keepBakerPrice = cur.price != null && bakerSet.has(cur.price_basis);
      const priceChanged = row.price != null && (cur.price !== row.price || cur.price_unit !== row.price_unit);
      if (!keepBakerPrice && priceChanged) { updPrice.run(row); repriced += 1; }
    }
  });
  tx();
  if (inserted || repriced) {
    console.log(`master_ingredients sync: +${inserted} new, ${repriced} price(s) set from seed (basis Aldi).`);
  }
}

// One-time: fold the old per-baker ingredient_prices list into master prices,
// only where the master row has no price yet.
function migrateLegacyPrices() {
  let legacy;
  try { legacy = db.prepare('SELECT * FROM ingredient_prices').all(); } catch { return; }
  if (!legacy.length) return;
  const setPrice = db.prepare(
    `UPDATE master_ingredients SET price=@price, price_unit=@unit, price_basis='migrated',
     price_updated_at=datetime('now'), updated_at=datetime('now') WHERE key=@key AND price IS NULL`,
  );
  let moved = 0;
  for (const row of legacy) {
    const hit = resolveRaw(row.canonical || row.name);
    if (!hit) continue;
    const unit = ['kg', 'litre', 'each', 'g', 'ml'].includes(row.unit)
      ? row.unit
      : (row.price_per_egg != null ? 'each' : row.price_per_ml != null ? 'litre' : 'kg');
    const info = setPrice.run({ price: row.price, unit, key: hit.key });
    if (info.changes) moved += 1;
  }
  if (moved) console.log(`master_ingredients: migrated ${moved} legacy price(s).`);
}

// ---------------------------------------------------------------- catalogue + cache
let cache = null;
let testOverride = null;

export function invalidate() { cache = null; }

export function getCatalogue() {
  if (testOverride) return testOverride;
  if (!booted) bootstrap();
  if (!cache) {
    cache = db.prepare('SELECT * FROM master_ingredients ORDER BY key').all().map(normEntry);
  }
  return cache;
}

// resolve against the live catalogue
export function resolve(name) {
  return matchIn(getCatalogue(), name);
}
// resolve straight from the DB rows (used during migration, before cache is warm)
function resolveRaw(name) {
  const rows = db.prepare('SELECT * FROM master_ingredients').all().map(normEntry);
  return matchIn(rows, name);
}

function matchIn(catalogue, name) {
  const toks = nameTokens(name);
  if (!toks.length) return null;
  const set = new Set(toks);
  let best = null;
  let bestScore = 0;
  for (const entry of catalogue) {
    for (const alias of entry.aliases) {
      const aToks = String(alias).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular);
      if (!aToks.length || !aToks.every((t) => set.has(t))) continue;
      const score = aToks.length + (toks.length === aToks.length ? 0.5 : 0);
      if (score > bestScore) { best = entry; bestScore = score; }
    }
  }
  return best;
}

export function byKey(key) {
  return getCatalogue().find((e) => e.key === key) || null;
}
export function categoryOf(name) {
  return resolve(name)?.category ?? 'other';
}

// Map for the pricing engine: { [key]: { price, priceUnit, densityGPerCup, gramsPerUnit, displayName } }
export function pricesByKey() {
  const out = {};
  for (const e of getCatalogue()) {
    out[e.key] = {
      price: e.price,
      priceUnit: e.priceUnit,
      densityGPerCup: e.densityGPerCup,
      gramsPerUnit: e.gramsPerUnit,
      displayName: e.displayName,
    };
  }
  return out;
}

// ---------------------------------------------------------------- writes
const PRICE_UNITS = ['kg', 'litre', 'each', 'g', 'ml', '100g', 'dozen'];
export { PRICE_UNITS };

export function updatePrice(key, { price, priceUnit, priceBasis }) {
  const row = db.prepare('SELECT id FROM master_ingredients WHERE key = ?').get(key);
  if (!row) return null;
  db.prepare(
    `UPDATE master_ingredients SET price=@price, price_unit=@priceUnit,
     price_basis=@priceBasis, price_updated_at=datetime('now'), updated_at=datetime('now')
     WHERE key=@key`,
  ).run({
    key,
    price: numOrNull(price),
    priceUnit: PRICE_UNITS.includes(priceUnit) ? priceUnit : 'kg',
    priceBasis: priceBasis || 'manual',
  });
  invalidate();
  return byKey(key);
}

export function upsertIngredient(body) {
  const key = String(body.key || slugify(body.display_name || body.displayName || body.name || '')).trim();
  if (!key) throw new Error('key or display_name required');
  const existing = db.prepare('SELECT id FROM master_ingredients WHERE key = ?').get(key);
  const r = seedRow({ ...body, key, source: body.source || 'manual', price: body.price ?? null });
  if (existing) {
    db.prepare(`
      UPDATE master_ingredients SET display_name=@display_name, aliases_json=@aliases_json,
        measurement_type=@measurement_type, category=@category, density_g_per_cup=@density_g_per_cup,
        g_per_tsp_min=@g_per_tsp_min, g_per_tsp_max=@g_per_tsp_max,
        grams_per_unit_min=@grams_per_unit_min, grams_per_unit_max=@grams_per_unit_max,
        count_noun=@count_noun, sizes_json=@sizes_json, price=@price, price_unit=@price_unit,
        price_basis=@price_basis, updated_at=datetime('now')
      WHERE key=@key`).run(r);
  } else {
    insertStmt().run(r);
  }
  invalidate();
  return byKey(key);
}

export function removeIngredient(key) {
  db.prepare('DELETE FROM master_ingredients WHERE key = ?').run(key);
  invalidate();
}

// Bulk price import. rows: [{ name, price, priceUnit }]  (name matched via resolve)
export function importPrices(rows = []) {
  const out = { updated: [], unmatched: [] };
  const tx = db.transaction((list) => {
    for (const row of list) {
      const hit = matchIn(db.prepare('SELECT * FROM master_ingredients').all().map(normEntry), row.name);
      if (!hit) { out.unmatched.push(row.name); continue; }
      updatePriceInternal(hit.key, row.price, row.priceUnit || hit.priceUnit, row.priceBasis || 'Aldi');
      out.updated.push({ name: row.name, key: hit.key });
    }
  });
  tx(rows);
  invalidate();
  return out;
}
function updatePriceInternal(key, price, priceUnit, basis) {
  db.prepare(
    `UPDATE master_ingredients SET price=@price, price_unit=@priceUnit, price_basis=@basis,
     price_updated_at=datetime('now'), updated_at=datetime('now') WHERE key=@key`,
  ).run({ key, price: numOrNull(price), priceUnit: PRICE_UNITS.includes(priceUnit) ? priceUnit : 'kg', basis });
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------- test hooks
export function __setCatalogue(arr) { testOverride = arr ? arr.map(normEntry) : null; }
export function __loadSeedAsCatalogue() { return loadSeedFile().map((x) => normEntry(seedRow(x))); }
