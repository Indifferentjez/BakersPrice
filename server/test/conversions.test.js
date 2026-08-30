import { describe, it, expect } from 'vitest';
import { toGrams, resolve, categoryOf, ingredientsToGrams } from '../lib/conversions.js';

describe('gram conversion table (from the brief)', () => {
  const cases = [
    ['plain flour', 1, 'cup', 120],
    ['self-raising flour', 2, 'cups', 240],
    ['cake flour', 1, 'cup', 115],
    ['blended oats', 1, 'cup', 90],
    ['caster sugar', 1, 'cup', 200],
    ['granulated sugar', 1, 'cup', 200],
    ['packed brown sugar', 1, 'cup', 220],
    ['butter', 1, 'cup', 227],
    ['neutral oil', 1, 'cup', 218],
    ['cocoa powder', 1, 'cup', 100],
    ['milk', 1, 'cup', 240],
    ['buttermilk', 1, 'cup', 240],
    ['coffee', 1, 'cup', 240],
    ['yogurt', 1, 'cup', 245],
    ['honey', 1, 'cup', 340],
    ['chopped nuts', 1, 'cup', 120],
    ['sultanas', 1, 'cup', 160],
    ['baking powder', 1, 'tsp', 4],
    ['salt', 1, 'tsp', 6],
  ];
  for (const [name, qty, unit, expected] of cases) {
    it(`${qty} ${unit} ${name} -> ${expected} g`, () => {
      const r = toGrams({ name, qty, unit });
      expect(r.grams).toBeCloseTo(expected, 5);
      expect(r.source).toBe('table');
    });
  }

  it('large egg = 50 g, medium egg = 44 g', () => {
    expect(toGrams({ name: 'large egg', qty: 3, unit: 'each' }).grams).toBe(150);
    expect(toGrams({ name: 'medium egg', qty: 1, unit: '' }).grams).toBe(44);
  });

  it('baking soda is a 4-5 g/tsp range, midpoint used', () => {
    const r = toGrams({ name: 'bicarbonate of soda', qty: 1, unit: 'tsp' });
    expect(r.grams).toBe(4.5);
    expect(r.gramsRange).toEqual({ min: 4, max: 5 });
  });

  it('grams given directly always wins over the table', () => {
    const r = toGrams({ name: 'flour', qty: 137, unit: 'g' });
    expect(r.grams).toBe(137);
    expect(r.source).toBe('given-weight');
    expect(r.needsConfirm).toBe(false);
  });

  it('kg / oz / lb normalise to grams', () => {
    expect(toGrams({ name: 'flour', qty: 1, unit: 'kg' }).grams).toBe(1000);
    expect(toGrams({ name: 'butter', qty: 4, unit: 'oz' }).grams).toBeCloseTo(113.398, 2);
  });

  it('tbsp and tsp derive from the per-cup density', () => {
    // 1 cup = 16 tbsp, so 1 tbsp flour = 120/16 = 7.5 g
    expect(toGrams({ name: 'flour', qty: 1, unit: 'tbsp' }).grams).toBeCloseTo(7.5, 5);
    // 1 cup = 48 tsp, so 1 tsp flour = 2.5 g
    expect(toGrams({ name: 'flour', qty: 1, unit: 'tsp' }).grams).toBeCloseTo(2.5, 5);
  });

  it('unknown ingredient is flagged, never guessed', () => {
    const r = toGrams({ name: 'freeze-dried raspberry powder', qty: 2, unit: 'tbsp' });
    expect(r.grams).toBeNull();
    expect(r.needsConfirm).toBe(true);
  });

  it('extended (non-brief) ingredients resolve but always need confirming', () => {
    const r = toGrams({ name: 'grated carrot', qty: 2, unit: 'cups' });
    expect(r.grams).toBeCloseTo(220, 5);
    expect(r.needsConfirm).toBe(true);
    expect(r.category).toBe('veg');
  });

  it('resolve maps aliases and categories', () => {
    expect(resolve('strong white bread flour').key).toBe('flour');
    expect(resolve('caster sugar').category).toBe('sugar');
    expect(categoryOf('double cream')).toBe('liquid');
    expect(categoryOf('unsweetened cocoa')).toBe('cocoa');
    expect(categoryOf('sunflower oil')).toBe('fat');
  });

  it('fraction quantities parse', () => {
    expect(toGrams({ name: 'flour', qty: '1 1/2', unit: 'cups' }).grams).toBeCloseTo(180, 5);
    expect(toGrams({ name: 'flour', qty: '½', unit: 'cup' }).grams).toBeCloseTo(60, 5);
    expect(toGrams({ name: 'flour', qty: '1½', unit: 'cup' }).grams).toBeCloseTo(180, 5);
  });

  it('ingredientsToGrams tags each row', () => {
    const rows = ingredientsToGrams([
      { name: 'plain flour', quantity: 2, unit: 'cups' },
      { name: 'eggs', quantity: 3, unit: 'each' },
      { name: 'mystery goo', quantity: 1, unit: 'cup' },
    ]);
    expect(rows[0].grams).toBe(240);
    expect(rows[0].category).toBe('flour');
    expect(rows[1].grams).toBe(150);
    expect(rows[2].needsConfirm).toBe(true);
  });
});
