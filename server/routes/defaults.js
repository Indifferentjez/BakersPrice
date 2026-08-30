import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const get = db.prepare('SELECT * FROM cost_defaults WHERE id = 1');
const upd = db.prepare(`
  UPDATE cost_defaults SET
    hourly_rate=@hourly_rate, energy_cost=@energy_cost, packaging_cost=@packaging_cost,
    overhead_pct=@overhead_pct, margin_min_pct=@margin_min_pct, margin_std_pct=@margin_std_pct,
    margin_premium_pct=@margin_premium_pct, labour_minutes=@labour_minutes,
    currency=@currency, business_name=@business_name, updated_at=datetime('now')
  WHERE id = 1
`);

const numOrNull = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

router.get('/', (_req, res) => {
  const d = get.get();
  res.json({ ...d, needsHourlyRate: d.hourly_rate == null });
});

router.put('/', (req, res) => {
  const cur = get.get();
  const b = req.body || {};
  const merged = {
    hourly_rate: numOrNull(b.hourly_rate ?? cur.hourly_rate),
    energy_cost: numOrNull(b.energy_cost ?? cur.energy_cost) ?? 0,
    packaging_cost: numOrNull(b.packaging_cost ?? cur.packaging_cost) ?? 0,
    overhead_pct: numOrNull(b.overhead_pct ?? cur.overhead_pct) ?? 0,
    margin_min_pct: numOrNull(b.margin_min_pct ?? cur.margin_min_pct) ?? 28,
    margin_std_pct: numOrNull(b.margin_std_pct ?? cur.margin_std_pct) ?? 50,
    margin_premium_pct: numOrNull(b.margin_premium_pct ?? cur.margin_premium_pct) ?? 65,
    labour_minutes: numOrNull(b.labour_minutes ?? cur.labour_minutes),
    currency: String(b.currency ?? cur.currency ?? 'GBP'),
    business_name: (b.business_name ?? cur.business_name) ? String(b.business_name ?? cur.business_name) : null,
  };
  upd.run(merged);
  const d = get.get();
  res.json({ ...d, needsHourlyRate: d.hourly_rate == null });
});

export default router;
