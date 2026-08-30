// Normalise a baker-entered ingredient price to the internal per-gram / per-egg
// figures the cost engine uses.
//
// Entered as one of: £/kg, £/litre, £/egg  (also accept £/g, £/ml, £/100g).

import { CANONICAL, resolve } from './conversions.js';

const DENSITY_G_PER_ML = (canonical) => {
  const e = CANONICAL.find((c) => c.key === canonical);
  return e && e.perCup ? e.perCup / 240 : 1.0; // fallback: water-like
};

export function normalizePrice({ name, unit, price }) {
  const p = Number(price);
  const u = String(unit || '').toLowerCase().trim();
  const canonical = resolve(name)?.key ?? null;
  const out = { canonical, price_per_g: null, price_per_ml: null, price_per_egg: null };
  if (!Number.isFinite(p) || p < 0) return out;

  switch (u) {
    case 'kg':
    case 'kilo':
    case 'kilogram':
      out.price_per_g = p / 1000;
      break;
    case 'g':
    case 'gram':
    case 'grams':
      out.price_per_g = p;
      break;
    case '100g':
    case 'per 100g':
      out.price_per_g = p / 100;
      break;
    case 'litre':
    case 'liter':
    case 'l':
      out.price_per_ml = p / 1000;
      out.price_per_g = (p / 1000) / DENSITY_G_PER_ML(canonical);
      break;
    case 'ml':
      out.price_per_ml = p;
      out.price_per_g = p / DENSITY_G_PER_ML(canonical);
      break;
    case 'egg':
    case 'each':
    case 'unit':
      out.price_per_egg = p;
      break;
    case 'dozen':
      out.price_per_egg = p / 12;
      break;
    default:
      // assume per kg — the most common shopping unit
      out.price_per_g = p / 1000;
  }
  return out;
}

export const PRICE_UNITS = ['kg', 'litre', 'egg', 'g', 'ml', '100g', 'dozen'];
