import { Router } from 'express';
import { readUserDefaults, writeUserDefaults, defaultsTemplate, requireUser } from '../lib/auth.js';

const router = Router();

const numOrNull = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

function asDto(d) {
  return { ...d, needsHourlyRate: d.hourly_rate == null };
}

router.get('/', (req, res) => {
  if (!req.user) {
    return res.json(asDto(defaultsTemplate()));
  }
  res.json(readUserDefaults(req.user.id));
});

router.put('/', requireUser, (req, res) => {
  const cur = readUserDefaults(req.user.id);
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
  res.json(writeUserDefaults(req.user.id, merged));
});

export default router;
