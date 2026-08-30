import { Router } from 'express';
import { db } from '../db.js';
import { normalizePrice, PRICE_UNITS } from '../lib/price.js';

const router = Router();

const list = db.prepare('SELECT * FROM ingredient_prices ORDER BY lower(name)');
const getOne = db.prepare('SELECT * FROM ingredient_prices WHERE id = ?');
const insert = db.prepare(`
  INSERT INTO ingredient_prices (name, canonical, unit, price, price_per_g, price_per_ml, price_per_egg, note, updated_at)
  VALUES (@name, @canonical, @unit, @price, @price_per_g, @price_per_ml, @price_per_egg, @note, datetime('now'))
`);
const update = db.prepare(`
  UPDATE ingredient_prices SET
    name=@name, canonical=@canonical, unit=@unit, price=@price,
    price_per_g=@price_per_g, price_per_ml=@price_per_ml, price_per_egg=@price_per_egg,
    note=@note, updated_at=datetime('now')
  WHERE id=@id
`);
const del = db.prepare('DELETE FROM ingredient_prices WHERE id = ?');

function rowFromBody(body) {
  const { name, unit, price, note } = body;
  const norm = normalizePrice({ name, unit, price });
  return {
    name: String(name || '').trim(),
    canonical: norm.canonical,
    unit: String(unit || 'kg').trim(),
    price: Number(price),
    price_per_g: norm.price_per_g,
    price_per_ml: norm.price_per_ml,
    price_per_egg: norm.price_per_egg,
    note: note ? String(note) : null,
  };
}

router.get('/', (_req, res) => {
  res.json({ units: PRICE_UNITS, items: list.all() });
});

router.post('/', (req, res) => {
  const row = rowFromBody(req.body);
  if (!row.name || !Number.isFinite(row.price)) {
    return res.status(400).json({ error: 'name and a numeric price are required.' });
  }
  try {
    const info = insert.run(row);
    res.status(201).json(getOne.get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `A price for "${row.name}" already exists — edit it instead.` });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existing = getOne.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const row = rowFromBody({ ...existing, ...req.body });
  update.run({ ...row, id: Number(req.params.id) });
  res.json(getOne.get(req.params.id));
});

router.delete('/:id', (req, res) => {
  del.run(req.params.id);
  res.status(204).end();
});

export default router;
