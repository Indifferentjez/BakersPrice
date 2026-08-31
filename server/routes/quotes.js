import { Router } from 'express';
import { db } from '../db.js';
import { sizeLabel, weightLabel } from '../lib/labels.js';
import { renderQuotePdf } from '../lib/quotePdf.js';
import { requireUser, readUserDefaults } from '../lib/auth.js';

const router = Router();

const getCalc = db.prepare('SELECT * FROM calculations WHERE id = ? AND user_id = ?');
const getQuote = db.prepare('SELECT * FROM quotes WHERE id = ?');
const getOwnedQuote = db.prepare('SELECT * FROM quotes WHERE id = ? AND user_id = ?');
const listQuotes = db.prepare('SELECT id, mode, cake_name, business_name, created_at, tier, price, price_floor, is_estimate FROM quotes WHERE user_id = ? ORDER BY created_at DESC');
const del = db.prepare('DELETE FROM quotes WHERE id = ? AND user_id = ?');
const insert = db.prepare(`
  INSERT INTO quotes (user_id, calculation_id, recipe_id, mode, business_name, cake_name, description,
                      size_label, weight_label, allergens, note, tier, price, price_floor,
                      is_estimate, estimate_json, menu_json, currency, created_at)
  VALUES (@user_id, @calculation_id, @recipe_id, @mode, @business_name, @cake_name, @description,
          @size_label, @weight_label, @allergens, @note, @tier, @price, @price_floor,
          @is_estimate, @estimate_json, @menu_json, @currency, datetime('now'))
`);

const CUSTOMER_ESTIMATE_NOTE = 'This is an estimated price. The final price is confirmed when you place your order.';
export const QUOTE_TIERS = ['minimum', 'standard', 'premium'];

export function customerDto(q) {
  const base = {
    mode: q.mode,
    businessName: q.business_name || null,
    cakeName: q.cake_name || null,
    description: q.description || null,
    allergens: q.allergens || null,
    note: q.note || null,
    currency: q.currency || 'GBP',
    estimated: !!q.is_estimate,
    priceNote: q.is_estimate ? CUSTOMER_ESTIMATE_NOTE : null,
  };
  if (q.mode === 'menu') {
    return {
      ...base,
      menu: safeParse(q.menu_json, []).map((m) => ({
        sizeLabel: m.sizeLabel, weightLabel: m.weightLabel || null, price: m.price, estimated: !!m.estimated,
      })),
    };
  }
  return { ...base, sizeLabel: q.size_label || null, weightLabel: q.weight_label || null, price: q.price };
}
function safeParse(s, f) { try { return s ? JSON.parse(s) : f; } catch { return f; } }

function hydrate(q) {
  return {
    id: q.id,
    createdAt: q.created_at,
    isEstimate: !!q.is_estimate,
    shareUrl: `/q/${q.id}`,
    pdfUrl: `/api/quotes/${q.id}/pdf`,
    ...customerDto(q),
  };
}

router.get('/', requireUser, (req, res) => res.json(listQuotes.all(req.user.id)));

router.post('/', requireUser, (req, res) => {
  const b = req.body || {};
  const d = readUserDefaults(req.user.id);
  const businessName = b.businessName ?? d.business_name ?? null;
  const uid = req.user.id;

  if (b.mode === 'menu') {
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'menu mode needs at least one item' });
    const menu = [];
    let currency = b.currency || d.currency || 'GBP';
    let anyEstimate = false;
    const perItemEstimate = [];
    for (const it of items) {
      const c = getCalc.get(it.calculationId, uid);
      if (!c) return res.status(404).json({ error: `calculation ${it.calculationId} not found` });
      const calc = JSON.parse(c.result_json);
      const price = JSON.parse(c.price_json);
      const tier = it.tier || 'standard';
      if (!QUOTE_TIERS.includes(tier)) {
        return res.status(400).json({ error: `tier must be one of: ${QUOTE_TIERS.join(', ')}.` });
      }
      if (price.prices[tier] == null) {
        return res.status(400).json({ error: `Calculation ${it.calculationId} has no ${tier} price — set the three margin percentages first.` });
      }
      currency = price.currency || currency;
      const est = !price.complete;
      anyEstimate = anyEstimate || est;
      perItemEstimate.push({ calculationId: it.calculationId, ...(price.estimate || {}) });
      menu.push({
        sizeLabel: it.sizeLabel || sizeLabel(JSON.parse(c.inputs_json).pan),
        weightLabel: it.weightLabel || weightLabel(calc.bakedWeight.min, calc.bakedWeight.max),
        price: price.prices[tier],
        priceFloor: price.pricesFloor ? price.pricesFloor[tier] : price.prices[tier],
        tier,
        estimated: est,
      });
    }
    const info = insert.run({
      user_id: uid,
      calculation_id: items[0].calculationId, recipe_id: null, mode: 'menu',
      business_name: businessName, cake_name: b.cakeName || 'Cake menu', description: b.description || null,
      size_label: null, weight_label: null, allergens: b.allergens || null, note: b.note || null,
      tier: null, price: null, price_floor: null,
      is_estimate: anyEstimate ? 1 : 0,
      estimate_json: anyEstimate ? JSON.stringify(perItemEstimate) : null,
      menu_json: JSON.stringify(menu), currency,
    });
    return res.status(201).json(hydrate(getQuote.get(info.lastInsertRowid)));
  }

  const c = getCalc.get(b.calculationId, uid);
  if (!c) return res.status(404).json({ error: 'calculation not found' });
  const calc = JSON.parse(c.result_json);
  const price = JSON.parse(c.price_json);
  const inputs = JSON.parse(c.inputs_json);
  const tier = b.tier || 'standard';
  if (!QUOTE_TIERS.includes(tier)) {
    return res.status(400).json({ error: `tier must be one of: ${QUOTE_TIERS.join(', ')}.` });
  }
  if (price.prices[tier] == null) {
    return res.status(400).json({ error: `No ${tier} price on this calculation — set the three margin percentages first.` });
  }

  const isEstimate = !price.complete;
  const info = insert.run({
    user_id: uid,
    calculation_id: b.calculationId, recipe_id: c.recipe_id, mode: 'single',
    business_name: businessName,
    cake_name: b.cakeName || 'Celebration cake',
    description: b.description || null,
    size_label: b.sizeLabel || sizeLabel(inputs.pan),
    weight_label: b.weightLabel || weightLabel(calc.bakedWeight.min, calc.bakedWeight.max),
    allergens: b.allergens || null,
    note: b.note || null,
    tier,
    price: price.prices[tier],
    price_floor: price.pricesFloor ? price.pricesFloor[tier] : price.prices[tier],
    is_estimate: isEstimate ? 1 : 0,
    estimate_json: isEstimate ? JSON.stringify(price.estimate) : null,
    menu_json: null,
    currency: price.currency || 'GBP',
  });
  res.status(201).json(hydrate(getQuote.get(info.lastInsertRowid)));
});

router.get('/:id/customer', (req, res) => {
  const q = getQuote.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json(customerDto(q));
});

router.get('/:id/pdf', (req, res) => {
  const q = getQuote.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const dto = customerDto(q);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quote-${q.id}.pdf"`);
  renderQuotePdf(dto, res);
});

router.get('/:id', requireUser, (req, res) => {
  const q = getOwnedQuote.get(req.params.id, req.user.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json(hydrate(q));
});

router.delete('/:id', requireUser, (req, res) => {
  const info = del.run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
