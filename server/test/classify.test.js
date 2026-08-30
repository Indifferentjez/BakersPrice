import { describe, it, expect } from 'vitest';
import { classify } from '../lib/classify.js';

// helper: build grams-resolved rows the way the route would
const g = (name, grams, category, canonical) => ({ name, grams, category, canonical });

describe('cake-type classification from formula ratios', () => {
  it('butter cake (creaming, moderate everything)', () => {
    const rows = [
      g('plain flour', 300, 'flour', 'flour'),
      g('butter', 150, 'fat', 'butter'),
      g('caster sugar', 300, 'sugar', 'caster sugar'),
      g('eggs', 150, 'egg', 'egg'),
      g('milk', 220, 'liquid', 'milk'),
      g('baking powder', 10, 'leavening', 'baking powder'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('butter-cake');
    expect(r.base.grams).toBe(300);
    expect(r.ratios.fat).toBe(50);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('pound cake (equal weight ratio)', () => {
    const rows = [
      g('flour', 225, 'flour', 'flour'),
      g('butter', 225, 'fat', 'butter'),
      g('sugar', 225, 'sugar', 'caster sugar'),
      g('eggs', 225, 'egg', 'egg'),
      g('vanilla', 5, 'flavour', 'extract'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('pound-cake');
    expect(r.signals.equalWeight).toBe(true);
  });

  it('chocolate cake (cocoa 30-40% of flour, high liquid)', () => {
    const rows = [
      g('flour', 315, 'flour', 'flour'),
      g('cocoa powder', 100, 'cocoa', 'cocoa'),
      g('sugar', 450, 'sugar', 'caster sugar'),
      g('vegetable oil', 130, 'fat', 'oil'),
      g('eggs', 100, 'egg', 'egg'),
      g('buttermilk', 300, 'liquid', 'milk'),
      g('hot coffee', 120, 'liquid', 'milk'),
      g('baking soda', 6, 'leavening', 'baking soda'),
      g('baking powder', 6, 'leavening', 'baking powder'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('chocolate-cake');
    expect(r.signals.cocoaVsFlour).toBeGreaterThanOrEqual(28);
  });

  it('carrot cake (oil + grated veg moisture)', () => {
    const rows = [
      g('flour', 260, 'flour', 'flour'),
      g('vegetable oil', 150, 'fat', 'oil'),
      g('brown sugar', 300, 'sugar', 'brown sugar'),
      g('eggs', 150, 'egg', 'egg'),
      g('grated carrot', 260, 'veg', 'grated carrot'),
      g('baking powder', 8, 'leavening', 'baking powder'),
      g('baking soda', 4, 'leavening', 'baking soda'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('carrot-cake');
    expect(r.signals.hasVegMoisture).toBe(true);
    expect(r.signals.fatIsOil).toBe(true);
  });

  it('red velvet (small cocoa + buttermilk)', () => {
    const rows = [
      g('flour', 250, 'flour', 'flour'),
      g('butter', 115, 'fat', 'butter'),
      g('sugar', 300, 'sugar', 'caster sugar'),
      g('eggs', 100, 'egg', 'egg'),
      g('buttermilk', 230, 'liquid', 'milk'),
      g('cocoa powder', 15, 'cocoa', 'cocoa'),
      g('baking soda', 5, 'leavening', 'baking soda'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('red-velvet');
    expect(r.signals.cocoaVsFlour).toBeLessThan(20);
  });

  it('genoise (no chemical leavening, whipped egg, low fat)', () => {
    const rows = [
      g('cake flour', 200, 'flour', 'cake flour'),
      g('eggs', 300, 'egg', 'egg'),
      g('sugar', 200, 'sugar', 'caster sugar'),
      g('butter', 30, 'fat', 'butter'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('genoise');
    expect(r.signals.hasChemicalLeavening).toBe(false);
  });

  it('high-hydration fruit / oat loaf (oats co-structural, liquid 300%+)', () => {
    const rows = [
      g('rolled oats', 200, 'oats', 'oats'),
      g('flour', 50, 'flour', 'flour'),
      g('vegetable oil', 100, 'fat', 'oil'),
      g('eggs', 200, 'egg', 'egg'),
      g('greek yogurt', 400, 'liquid', 'yogurt'),
      g('milk', 300, 'liquid', 'milk'),
      g('mashed banana', 225, 'liquid', 'mashed banana'),
      g('chopped dates', 300, 'dried-fruit', 'dried fruit'),
      g('baking powder', 10, 'leavening', 'baking powder'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('fruit-oat-loaf');
    expect(r.base.components.oats).toBe(200);
    expect(r.ratios.liquid).toBeGreaterThan(280);
  });

  it('oil-based quick bread', () => {
    const rows = [
      g('flour', 250, 'flour', 'flour'),
      g('vegetable oil', 120, 'fat', 'oil'),
      g('sugar', 200, 'sugar', 'caster sugar'),
      g('eggs', 100, 'egg', 'egg'),
      g('milk', 200, 'liquid', 'milk'),
      g('baking powder', 10, 'leavening', 'baking powder'),
    ];
    const r = classify(rows);
    expect(['oil-quick-bread', 'butter-cake']).toContain(r.detected);
    // butter cake needs sugar >= 95% of base; this is 80%, so oil quick bread should win
    expect(r.detected).toBe('oil-quick-bread');
  });

  it('nonsense formula -> no strong match, with alternatives', () => {
    const rows = [
      g('flour', 100, 'flour', 'flour'),
      g('butter', 900, 'fat', 'butter'),
      g('salt', 200, 'salt', 'salt'),
    ];
    const r = classify(rows);
    expect(r.detected).toBe('unclassified');
    expect(r.label).toBe('No strong match');
  });
});
