import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'app.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS recipes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  raw_input     TEXT,
  raw_kind      TEXT,                      -- 'text' | 'image' | 'pdf' | 'manual'
  parsed_json   TEXT NOT NULL,             -- [{name, quantity, unit, grams?, notes?}]
  master_grams_json TEXT,                  -- grams-resolved rows (after baker confirm)
  detected_type TEXT,
  type_override TEXT,
  ratios_json   TEXT,
  classification_json TEXT,
  allergens     TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Legacy per-baker price list. Superseded by master_ingredients; kept for the
-- one-time migration in server/lib/masterIngredients.js, no longer written to.
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  canonical     TEXT,
  unit          TEXT NOT NULL,             -- 'kg' | 'litre' | 'egg' (as entered)
  price         REAL NOT NULL,             -- price per that unit
  price_per_g   REAL,
  price_per_ml  REAL,
  price_per_egg REAL,
  note          TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_prices_name ON ingredient_prices(lower(name));

-- Central ingredient catalogue: measurement/conversion data + a default price.
-- Seeded from server/data/master-ingredients.json on first run.
CREATE TABLE IF NOT EXISTS master_ingredients (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  key                 TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  aliases_json        TEXT NOT NULL DEFAULT '[]',
  measurement_type    TEXT NOT NULL,          -- 'weight' | 'volume' | 'count'
  category            TEXT NOT NULL DEFAULT 'other',
  density_g_per_cup   REAL,                   -- volume conversion (240 ml cup)
  g_per_tsp_min       REAL,
  g_per_tsp_max       REAL,
  grams_per_unit_min  REAL,                   -- count: weight range per whole item
  grams_per_unit_max  REAL,
  count_noun          TEXT,                   -- 'egg', 'banana', ...
  sizes_json          TEXT,                   -- optional {label:[min,max]} for eggs
  price               REAL,
  price_unit          TEXT NOT NULL DEFAULT 'kg',   -- 'kg'|'litre'|'each'|'g'|'ml'
  price_basis         TEXT NOT NULL DEFAULT 'Aldi',
  price_updated_at    TEXT,
  source              TEXT NOT NULL DEFAULT 'manual', -- 'brief'|'seed'|'manual'
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_defaults (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  hourly_rate        REAL,
  energy_cost        REAL NOT NULL DEFAULT 0,
  packaging_cost     REAL NOT NULL DEFAULT 0,
  overhead_pct       REAL NOT NULL DEFAULT 0,
  margin_min_pct     REAL NOT NULL DEFAULT 28,
  margin_std_pct     REAL NOT NULL DEFAULT 50,
  margin_premium_pct REAL NOT NULL DEFAULT 65,
  labour_minutes     REAL,
  currency           TEXT NOT NULL DEFAULT 'GBP',
  business_name      TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO cost_defaults (id) VALUES (1);

CREATE TABLE IF NOT EXISTS calibrations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id        INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  pans_json        TEXT NOT NULL,          -- [pan, ...]
  actual_batter_g  REAL NOT NULL,
  k_per_ml         REAL NOT NULL,
  total_volume_ml  REAL NOT NULL,
  is_recipe_default INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calculations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id      INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  inputs_json    TEXT NOT NULL,
  result_json    TEXT NOT NULL,
  price_json     TEXT,
  audit_json     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  password_hash  TEXT,
  google_sub     TEXT UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_cost_defaults (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate        REAL,
  energy_cost        REAL NOT NULL DEFAULT 0,
  packaging_cost     REAL NOT NULL DEFAULT 0,
  overhead_pct       REAL NOT NULL DEFAULT 0,
  margin_min_pct     REAL NOT NULL DEFAULT 28,
  margin_std_pct     REAL NOT NULL DEFAULT 50,
  margin_premium_pct REAL NOT NULL DEFAULT 65,
  labour_minutes     REAL,
  currency           TEXT NOT NULL DEFAULT 'GBP',
  business_name      TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  calculation_id INTEGER REFERENCES calculations(id) ON DELETE SET NULL,
  recipe_id      INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  mode           TEXT NOT NULL DEFAULT 'single',   -- 'single' | 'menu'
  business_name  TEXT,
  cake_name      TEXT,
  description    TEXT,
  size_label     TEXT,
  weight_label   TEXT,
  allergens      TEXT,
  note           TEXT,
  tier           TEXT,                              -- for 'single'
  price          REAL,                              -- for 'single'
  menu_json      TEXT,                              -- for 'menu': [{size_label, weight_label, price}]
  currency       TEXT NOT NULL DEFAULT 'GBP',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- lightweight migration: add columns if an older db is missing them ---
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('cost_defaults', 'business_name', 'business_name TEXT');
ensureColumn('cost_defaults', 'labour_minutes', 'labour_minutes REAL');
ensureColumn('quotes', 'is_estimate', 'is_estimate INTEGER NOT NULL DEFAULT 0');
ensureColumn('quotes', 'price_floor', 'price_floor REAL');
ensureColumn('quotes', 'estimate_json', 'estimate_json TEXT');
// per-recipe ingredient price overrides: { [masterKey|nameSlug]: { price, priceUnit, note } }
ensureColumn('recipes', 'ingredient_overrides_json', 'ingredient_overrides_json TEXT');
ensureColumn('recipes', 'user_id', 'user_id TEXT REFERENCES users(id)');
ensureColumn('quotes', 'user_id', 'user_id TEXT REFERENCES users(id)');
ensureColumn('calculations', 'user_id', 'user_id TEXT REFERENCES users(id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_calculations_user_id ON calculations(user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');

export default db;
