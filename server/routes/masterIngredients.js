import { Router } from 'express';
import {
  getCatalogue, byKey, upsertIngredient, removeIngredient, updatePrice, importPrices,
  PRICE_UNITS, resolve,
} from '../lib/masterIngredients.js';
import { requireUser } from '../lib/auth.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ priceUnits: PRICE_UNITS, items: getCatalogue() });
});

// resolve a free-text ingredient name against the catalogue (for the recipe UI)
router.get('/resolve', (req, res) => {
  const hit = resolve(String(req.query.name || ''));
  res.json({ match: hit || null });
});

router.post('/', requireUser, (req, res) => {
  try {
    const row = upsertIngredient(req.body || {});
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:key', requireUser, (req, res) => {
  if (!byKey(req.params.key)) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  try {
    // price-only update vs full edit
    if (Object.keys(b).every((k) => ['price', 'priceUnit', 'price_unit', 'priceBasis'].includes(k))) {
      return res.json(updatePrice(req.params.key, {
        price: b.price, priceUnit: b.priceUnit ?? b.price_unit, priceBasis: b.priceBasis,
      }));
    }
    res.json(upsertIngredient({ ...b, key: req.params.key }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:key', requireUser, (req, res) => {
  removeIngredient(req.params.key);
  res.status(204).end();
});

// Bulk price import. body: { rows: [{ name, price, priceUnit }] }  or  { text: "name\tunit\tprice\n..." }
router.post('/import', requireUser, (req, res) => {
  let rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows && typeof req.body?.text === 'string') {
    rows = req.body.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const parts = line.split(/\t|\s*,\s*|\s{2,}/).map((s) => s.trim()).filter(Boolean);
      // "name  unit  price"  or  "name  price"
      if (parts.length >= 3) return { name: parts.slice(0, -2).join(' '), priceUnit: parts[parts.length - 2], price: parts[parts.length - 1] };
      if (parts.length === 2) return { name: parts[0], price: parts[1] };
      return null;
    }).filter(Boolean);
  }
  if (!rows || !rows.length) return res.status(400).json({ error: 'Provide rows[] or a text block of "name, unit, price" lines.' });
  res.json(importPrices(rows));
});

export default router;
