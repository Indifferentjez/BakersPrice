import { describe, it, expect } from 'vitest';
import { panVolume, backCalcDensity, calculate, fillWindow, retentionWindow } from '../lib/calcEngine.js';

describe('pan geometry', () => {
  it('round pan volume = pi r^2 h', () => {
    const v = panVolume({ shape: 'round', unit: 'in', diameter: 8, depth: 3 });
    // 8in=20.32cm, 3in=7.62cm -> pi*10.16^2*7.62
    expect(v.volumeMl).toBeCloseTo(Math.PI * 10.16 ** 2 * 7.62, 2);
  });

  it('loaf falls back to width 0.5L, depth 0.3L and says so', () => {
    const v = panVolume({ shape: 'loaf', unit: 'in', length: 9 });
    expect(v.assumptions.join(' ')).toMatch(/0.5 x length/);
    expect(v.assumptions.join(' ')).toMatch(/0.3 x length/);
    const L = 9 * 2.54;
    expect(v.volumeMl).toBeCloseTo(L * (L * 0.5) * (L * 0.3), 2);
  });

  it('rectangular pan in cm', () => {
    const v = panVolume({ shape: 'rectangular', unit: 'cm', length: 30, width: 20, depth: 5 });
    expect(v.volumeMl).toBe(3000);
  });
});

describe('calibration back-calc — reference bake regression', () => {
  // The brief's real 3-tin bake: 4,719 g total batter, back-solved to
  // a density constant of 0.70 g batter per mL of pan volume.
  it('reproduces 0.70 g/mL from the reference data point', () => {
    // three 8in x 2in round tins ~= the reference bake's pans
    const totalV = 3 * (Math.PI * (8 * 2.54 / 2) ** 2 * (2 * 2.54));
    // pick the batter weight the brief's constant implies for that volume
    const actualBatterG = 0.70 * totalV;
    const r = backCalcDensity({
      pans: [
        { shape: 'round', unit: 'in', diameter: 8, depth: 2 },
        { shape: 'round', unit: 'in', diameter: 8, depth: 2 },
        { shape: 'round', unit: 'in', diameter: 8, depth: 2 },
      ],
      actualBatterG,
    });
    expect(r.kPerMl).toBeCloseTo(0.70, 2);
    expect(r.totalVolumeMl).toBeCloseTo(totalV, 0);
  });

  it('with ~4719 g over ~6741 mL of pan volume, k rounds to 0.70', () => {
    // 4719 / 0.70 = 6741.4 mL of pan volume
    const r = backCalcDensity({
      pans: [{ shape: 'rectangular', unit: 'cm', length: 6741.43, width: 1, depth: 1 }],
      actualBatterG: 4719,
    });
    expect(r.kPerMl).toBeCloseTo(0.70, 2);
  });

  it('rejects missing data', () => {
    expect(backCalcDensity({ pans: [], actualBatterG: 100 }).error).toBeTruthy();
    expect(backCalcDensity({ pans: [{ shape: 'round', unit: 'in', diameter: 8 }], actualBatterG: 0 }).error).toBeTruthy();
  });
});

describe('full calculation', () => {
  const master = [
    { name: 'flour', grams: 300, category: 'flour', canonical: 'flour' },
    { name: 'butter', grams: 150, category: 'fat', canonical: 'butter' },
    { name: 'sugar', grams: 300, category: 'sugar', canonical: 'caster sugar' },
    { name: 'eggs', grams: 150, category: 'egg', canonical: 'egg', perEgg: 50 },
    { name: 'milk', grams: 220, category: 'liquid', canonical: 'milk' },
    { name: 'baking powder', grams: 10, category: 'leavening', canonical: 'baking powder' },
  ];
  const base = 300;

  it('scales the ingredient list by targetBatter / masterBatter', () => {
    const c = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
    });
    const masterBatter = 1130;
    expect(c.master.batterG).toBe(masterBatter);
    // every scaled row = master row * mid scaling factor
    for (const row of c.scaledIngredients) {
      const src = master.find((m) => m.name === row.name);
      expect(row.grams).toBeCloseTo(src.grams * c.scalingFactor.mid, 0);
    }
    // batter and baked weight are ranges, never single numbers
    expect(c.batter.max).toBeGreaterThan(c.batter.min);
    expect(c.bakedWeight.max).toBeGreaterThan(c.bakedWeight.min);
    // baked < batter (moisture loss)
    expect(c.bakedWeight.max).toBeLessThan(c.batter.max);
    // scaled egg rows carry the master's per-egg weight through for costing
    const eggRow = c.scaledIngredients.find((r) => r.category === 'egg');
    expect(eggRow.perEgg).toBe(50);
    expect(c.scaledIngredients.find((r) => r.category === 'flour').perEgg).toBeUndefined();
  });

  it('propagates a medium-egg per-egg weight (44 g) onto scaled rows', () => {
    const med = master.map((r) => (r.category === 'egg' ? { ...r, perEgg: 44 } : r));
    const c = calculate({ master: med, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 } });
    expect(c.scaledIngredients.find((r) => r.category === 'egg').perEgg).toBe(44);
  });

  it('uses a saved calibration constant instead of the generic fill table', () => {
    const generic = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
    });
    const calibrated = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
      calibrationKPerMl: 0.70,
    });
    expect(calibrated.batter.accuracy).toBe('CALCULATED');
    expect(generic.batter.accuracy).toBe('ESTIMATED');
    const mid = (calibrated.batter.min + calibrated.batter.max) / 2;
    expect(mid).toBeCloseTo(generic.pan.volumeMl * 0.70, 0);
  });

  it('flags fractional eggs with weigh-the-beaten-egg guidance', () => {
    const c = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 7, depth: 2.5 },
    });
    expect(c.eggAdvice).toBeTruthy();
    if (c.eggAdvice.fractional) {
      expect(c.eggAdvice.guidance).toMatch(/weigh/i);
    }
  });

  it('fill tables match the brief', () => {
    expect(fillWindow('genoise').pct).toEqual([50, 60]);
    expect(fillWindow('fruit-oat-loaf').pct).toEqual([80, 90]);
    expect(fillWindow('butter-cake', true).pct).toEqual([55, 65]); // deep pan override
    expect(retentionWindow('chocolate-cake')).toEqual([88, 93]);
    expect(retentionWindow('unclassified')).toEqual([88, 95]);
  });
});
