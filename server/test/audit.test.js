import { describe, it, expect } from 'vitest';
import { calculate } from '../lib/calcEngine.js';
import { priceBake } from '../lib/cost.js';
import { auditCalculation } from '../lib/audit.js';

const master = [
  { name: 'flour', grams: 300, category: 'flour', canonical: 'flour' },
  { name: 'butter', grams: 150, category: 'fat', canonical: 'butter' },
  { name: 'sugar', grams: 300, category: 'sugar', canonical: 'caster sugar' },
  { name: 'eggs', grams: 150, category: 'egg', canonical: 'egg', perEgg: 50 },
  { name: 'milk', grams: 220, category: 'liquid', canonical: 'milk' },
];

describe('self-audit', () => {
  it('passes a sane in-range calculation', () => {
    const c = calculate({ master, base: 300, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 } });
    const a = auditCalculation(c);
    expect(a.worst).not.toBe('fail');
    expect(a.checks.some((x) => x.title === 'Scaling factor' && x.level === 'ok')).toBe(true);
  });

  it('flags scaling beyond 4x as REQUIRES_TESTING', () => {
    const c = calculate({ master, base: 300, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 18, depth: 4 } });
    const a = auditCalculation(c);
    expect(c.scalingFactor.mid).toBeGreaterThan(4);
    expect(a.worst).toBe('fail');
    expect(a.overallAccuracy).toBe('REQUIRES_TESTING');
    expect(a.checks.some((x) => /safe linear range/i.test(x.title))).toBe(true);
  });

  it('flags scaling below 0.25x', () => {
    const c = calculate({ master, base: 300, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 3, depth: 1.5 } });
    const a = auditCalculation(c);
    expect(c.scalingFactor.mid).toBeLessThan(0.25);
    expect(a.worst).toBe('fail');
  });

  it('flags a non-monotonic price tier set', () => {
    const c = calculate({ master, base: 300, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 } });
    const price = priceBake({
      scaledIngredients: c.scaledIngredients,
      priceList: [
        { name: 'flour', canonical: 'flour', pricePerG: 0.0012 },
        { name: 'butter', canonical: 'butter', pricePerG: 0.008 },
        { name: 'sugar', canonical: 'caster sugar', pricePerG: 0.001 },
        { name: 'eggs', canonical: 'egg', pricePerEgg: 0.25 },
        { name: 'milk', canonical: 'milk', pricePerG: 0.0009 },
      ],
      bake: { labourMinutes: 60, hourlyRate: 12, energyCost: 0.5, packagingCost: 2,
        overheadPct: 15, marginMinPct: 60, marginStdPct: 50, marginPremiumPct: 40 },
    });
    const a = auditCalculation(c, price);
    expect(a.checks.some((x) => /not ordered/i.test(x.title))).toBe(true);
  });

  it('estimate check states the uplift relative to the FLOOR, not the estimate', () => {
    const c = calculate({ master, base: 300, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 } });
    // price only flour + sugar -> butter, eggs, milk unpriced (big gap)
    const price = priceBake({
      scaledIngredients: c.scaledIngredients,
      priceList: [
        { name: 'flour', canonical: 'flour', pricePerG: 0.0012 },
        { name: 'sugar', canonical: 'caster sugar', pricePerG: 0.001 },
      ],
      bake: { labourMinutes: 30, hourlyRate: 8, energyCost: 0.2, packagingCost: 0.5,
        overheadPct: 0, marginMinPct: 28, marginStdPct: 50, marginPremiumPct: 65 },
    });
    const a = auditCalculation(c, price);
    const check = a.checks.find((x) => /ESTIMATE, not firm/i.test(x.title));
    expect(check).toBeTruthy();

    const floor = price.pricesFloor.standard;
    const est = price.pricesEstimated.standard;
    const expectedUplift = Math.round(((est - floor) / floor) * 100);
    expect(check.detail).toContain(`+${expectedUplift}%`);
    expect(check.detail).toMatch(/above the floor/);
    // the wrong (estimate-denominator) figure must NOT be what we print
    const wrongUplift = Math.round(((est - floor) / est) * 100);
    if (wrongUplift !== expectedUplift) {
      expect(check.detail).not.toContain(`+${wrongUplift}%`);
    }
  });
});
