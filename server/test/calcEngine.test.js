import { describe, it, expect } from 'vitest';
import { panVolume, backCalcDensity, calculate, fillWindow, retentionWindow, CalcError } from '../lib/calcEngine.js';

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

  it('rejects missing diameter instead of returning volume 0', () => {
    const v = panVolume({ shape: 'round', unit: 'in', depth: 3 });
    expect(v.error).toMatch(/diameter/i);
    expect(v.volumeMl).toBeNull();
  });

  it('rejects negative dimensions', () => {
    const v = panVolume({ shape: 'round', unit: 'in', diameter: -8, depth: 3 });
    expect(v.error).toMatch(/positive/i);
  });

  it('rejects unknown units instead of treating them as inches', () => {
    const v = panVolume({ shape: 'round', unit: 'mm', diameter: 200, depth: 50 });
    expect(v.error).toMatch(/in.*cm/i);
  });

  it('rejects unknown shapes', () => {
    const v = panVolume({ shape: 'hexagon', unit: 'in', diameter: 8, depth: 3 });
    expect(v.error).toMatch(/shape/i);
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

  it('rejects a pan with missing dimensions instead of inflating k', () => {
    const r = backCalcDensity({
      pans: [
        { shape: 'round', unit: 'in', diameter: 8, depth: 2 },
        { shape: 'round', unit: 'in' },
      ],
      actualBatterG: 2000,
    });
    expect(r.error).toBeTruthy();
    expect(r.kPerMl).toBeUndefined();
  });
});

describe('full calculation', () => {
  const master = [
    { name: 'flour', grams: 300, category: 'flour', canonical: 'flour', measurementType: 'volume' },
    { name: 'butter', grams: 150, category: 'fat', canonical: 'butter', measurementType: 'weight' },
    { name: 'sugar', grams: 300, category: 'sugar', canonical: 'caster-sugar', measurementType: 'volume' },
    { name: 'eggs', grams: 210, category: 'egg', canonical: 'egg', measurementType: 'count', count: 4, countNoun: 'egg', gramsRange: { min: 200, max: 220 } },
    { name: 'milk', grams: 220, category: 'liquid', canonical: 'milk', measurementType: 'volume' },
    { name: 'baking powder', grams: 10, category: 'leavening', canonical: 'baking-powder', measurementType: 'volume' },
  ];
  const base = 300;

  it('scales weight/volume rows by grams and keeps count rows as counts', () => {
    const c = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
    });
    expect(c.master.batterG).toBe(1190); // count-egg grams are in the batter total

    for (const row of c.scaledIngredients) {
      const src = master.find((m) => m.name === row.name);
      if (row.measurementType === 'count') {
        expect(Number.isInteger(row.count)).toBe(true);
        expect(row.count).toBe(Math.round(src.count * c.scalingFactor.mid));
        expect(row.gramsRange.min).toBeLessThan(row.gramsRange.max);
        expect(row.masterCount).toBe(src.count);
      } else {
        expect(row.grams).toBeCloseTo(src.grams * c.scalingFactor.mid, 0);
      }
    }
    // ranges, never single numbers; moisture loss
    expect(c.batter.max).toBeGreaterThan(c.batter.min);
    expect(c.bakedWeight.max).toBeLessThan(c.batter.max);
  });

  it('a count ingredient never becomes grams-only when scaled', () => {
    const c = calculate({ master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 11, depth: 3 } });
    const egg = c.scaledIngredients.find((r) => r.category === 'egg');
    expect(egg.measurementType).toBe('count');
    expect(egg.count).toBeGreaterThan(4);          // scaled up
    expect(egg.countNoun).toBe('egg');
    expect(egg.gramsRange).toBeTruthy();           // estimate still provided
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

  it('countAdvice covers each count ingredient; fractional eggs get weigh-the-egg guidance', () => {
    const c = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 7, depth: 2.5 },
    });
    expect(Array.isArray(c.countAdvice)).toBe(true);
    const egg = c.countAdvice.find((a) => a.noun === 'egg');
    expect(egg).toBeTruthy();
    expect(Number.isInteger(egg.roundedCount)).toBe(true);
    if (egg.fractional) expect(egg.guidance).toMatch(/weigh|egg/i);
  });

  it('uses a saved calibration of 0 instead of falling back to the generic table', () => {
    const c = calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
      calibrationKPerMl: 0,
    });
    expect(c.densitySource).toBe('calibration');
    expect(c.calibrationKPerMl).toBe(0);
    expect(c.batter.min).toBe(0);
    expect(c.batter.max).toBe(0);
  });

  it('throws when pan dimensions are missing', () => {
    expect(() => calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', depth: 3 },
    })).toThrow(CalcError);
  });

  it('throws when master batter weight is 0', () => {
    expect(() => calculate({
      master: [{ name: 'flour', grams: 0, category: 'flour' }],
      base: 0, cakeTypeKey: 'unclassified',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
    })).toThrow(/no ingredient weight/i);
  });

  it('throws on an invalid fill % override', () => {
    expect(() => calculate({
      master, base, cakeTypeKey: 'butter-cake',
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
      fillPctOverride: 140,
    })).toThrow(/Fill %/i);
  });

  it('fill tables match the brief', () => {
    expect(fillWindow('genoise').pct).toEqual([50, 60]);
    expect(fillWindow('fruit-oat-loaf').pct).toEqual([80, 90]);
    expect(fillWindow('butter-cake', true).pct).toEqual([55, 65]); // deep pan override
    expect(retentionWindow('chocolate-cake')).toEqual([88, 93]);
    expect(retentionWindow('unclassified')).toEqual([88, 95]);
  });
});
