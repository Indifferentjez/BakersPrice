import { Router } from 'express';
import { db } from '../db.js';
import { sizeLabel, weightLabel } from '../lib/labels.js';
import { renderQuotePdf } from '../lib/quotePdf.js';

const router = Router();

const getCalc = db.prepare('SELECT * FROM calculations WHERE id = ?');
const getDefaults = db.prepare('SELECT * FROM cost_defaults WHERE id = 1');
const insert = db.prepare(`
  INSERT INTO quotes (calculation_id, recipe_id, mode, business_name, cake_name, description,
                      size_label, weight_label, allergens, note, tier, price, price_floor,
                      is_estimate, estimate_json, menu_json, currency, created_at)
  VALUES (@calculation_id, @recipe_id, @mode, @business_name, @cake_name, @description,
          @size_label, @weight_label, @allergens, @note, @tier, @price, @price_floor,
          @is_estimate, @estimate_json, @menu_json, @currency, datetime('now'))
`);
const getQuote = db.prepare('SELECT * FROM quotes WHERE id = ?');
const listQuotes = db.prepare('SELECT id, mode, cake_name, business_name, created_at, tier, price, price_floor, is_estimate FROM quotes ORDER BY created_at DESC');
const del = db.prepare('DELETE FROM quotes WHERE id = ?');

const CUSTOMER_ESTIMATE_NOTE = 'This is an estimated price. The final price is confirmed when you place your order.';

// Build the CUSTOMER-SAFE DTO. This is the only shape sent to the customer
// endpoints. It never contains cost, margin, overhead, scaled ingredients, or
// the estimate's error breakdown — only a plain "this is an estimate" note.
function customerDto(q) {
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
  // note: internal tier name and the cost/error breakdown are NOT exposed here
  return { ...base, sizeLabel: q.size_label || null, weightLabel: q.weight_label || null, price: q.price };
}
function safeParse(s, f) { try { return s ? JSON.parse(s) : f; } catch { return f; } }

router.get('/', (_req, res) => res.json(listQuotes.all()));

// Create a quote. Incomplete price lists are ALLOWED — the quote is flagged as an
// estimate and carries the margin for error (baker view only).
//
// SINGLE mode body: { calculationId, tier, cakeName, description, businessName?,
//                     allergens?, note?, sizeLabel?, weightLabel? }
// MENU mode body:   { mode:'menu', businessName?, cakeName, description?, allergens?,
//                     note?, currency?, items:[{ calculationId, tier, sizeLabel? }] }
router.post('/', (req, res) => {
  const b = req.body || {};
  const d = getDefaults.get();
  const businessName = b.businessName ?? d.business_name ?? null;

  if (b.mode === 'menu') {
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'menu mode needs at least one item' });
    const menu = [];
    let currency = b.currency || d.currency || 'GBP';
    let anyEstimate = false;
    const perItemEstimate = [];
    for (const it of items) {
      const c = getCalc.get(it.calculationId);
      if (!c) return res.status(404).json({ error: `calculation ${it.calculationId} not found` });
      const calc = JSON.parse(c.result_json);
      const price = JSON.parse(c.price_json);
      const tier = it.tier || 'standard';
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

  // single
  const c = getCalc.get(b.calculationId);
  if (!c) return res.status(404).json({ error: 'calculation not found' });
  const calc = JSON.parse(c.result_json);
  const price = JSON.parse(c.price_json);
  const inputs = JSON.parse(c.inputs_json);
  const tier = b.tier || 'standard';
  if (price.prices[tier] == null) {
    return res.status(400).json({ error: `No ${tier} price on this calculation — set the three margin percentages first.` });
  }

  const isEstimate = !price.complete;
  const info = insert.run({
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

function hydrate(q) {
  return {
    id: q.id, mode: q.mode, createdAt: q.created_at, isEstimate: !!q.is_estimate,
    bakerView: {
      ...q,
      menu: safeParse(q.menu_json, null),
      estimate: safeParse(q.estimate_json, null),
      shareUrl: `/q/${q.id}`,
      pdfUrl: `/api/quotes/${q.id}/pdf`,
    },
    customerView: customerDto(q),
  };
}

router.get('/:id', (req, res) => {
  const q = getQuote.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json(hydrate(q));
});

// CUSTOMER-SAFE endpoint — used by the public share page. Whitelisted DTO only.
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

router.delete('/:id', (req, res) => { del.run(req.params.id); res.status(204).end(); });

export default router;
