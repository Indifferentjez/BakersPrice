import { describe, it, expect } from 'vitest';
import { measureIngredient, measureList } from '../lib/measure.js';

describe('measure — weight-based ingredients pass through untouched', () => {
  it('500 g flour stays 500 g weight', () => {
    const r = measureIngredient({ name: 'plain flour', quantity: 500, unit: 'g' });
    expect(r.measurementType).toBe('weight');
    expect(r.grams).toBe(500);
    expect(r.gramsSource).toBe('given-weight');
    expect(r.count).toBeNull();
    expect(r.needsConfirm).toBe(false);
  });
  it('kg / oz normalise', () => {
    expect(measureIngredient({ name: 'flour', quantity: 1, unit: 'kg' }).grams).toBe(1000);
    expect(measureIngredient({ name: 'butter', quantity: 4, unit: 'oz' }).grams).toBeCloseTo(113.398, 2);
  });
});

describe('measure — volume converts with the ingredient\'s OWN density', () => {
  it('a cup is not one universal number', () => {
    expect(measureIngredient({ name: 'plain flour', quantity: 1, unit: 'cup' }).grams).toBe(120);
    expect(measureIngredient({ name: 'butter', quantity: 1, unit: 'cup' }).grams).toBe(227);
    expect(measureIngredient({ name: 'honey', quantity: 1, unit: 'cup' }).grams).toBe(340);
    expect(measureIngredient({ name: 'cocoa powder', quantity: 1, unit: 'cup' }).grams).toBe(100);
  });
  it('tbsp / tsp derive from the per-cup density (240 ml cup)', () => {
    expect(measureIngredient({ name: 'flour', quantity: 1, unit: 'tbsp' }).grams).toBeCloseTo(7.5, 4);
    expect(measureIngredient({ name: 'milk', quantity: 1.5, unit: 'cups' }).grams).toBe(360);
    expect(measureIngredient({ name: 'flour', quantity: 1, unit: 'cup' }).measurementType).toBe('volume');
  });
  it('per-tsp ingredients (leavening / salt / extract)', () => {
    expect(measureIngredient({ name: 'baking powder', quantity: 2, unit: 'tsp' }).grams).toBe(8);
    expect(measureIngredient({ name: 'salt', quantity: 1, unit: 'tsp' }).grams).toBe(6);
    const bs = measureIngredient({ name: 'bicarbonate of soda', quantity: 1, unit: 'tsp' });
    expect(bs.grams).toBe(4.5);
    expect(bs.gramsRange).toEqual({ min: 4, max: 5 });
  });
  it('fraction strings are parsed server-side', () => {
    expect(measureIngredient({ name: 'flour', quantity: '1 1/2', unit: 'cups' }).grams).toBe(180);
    expect(measureIngredient({ name: 'flour', quantity: '½', unit: 'cup' }).grams).toBe(60);
  });
});

describe('measure — count-based ingredients keep the count, add a weight RANGE', () => {
  it('6 bananas -> count 6 + estimated 600-720 g', () => {
    const r = measureIngredient({ name: 'bananas', quantity: 6, unit: 'each' });
    expect(r.measurementType).toBe('count');
    expect(r.count).toBe(6);
    expect(r.countNoun).toBe('banana');
    expect(r.gramsRange).toEqual({ min: 600, max: 720 });
    expect(r.grams).toBe(660);
    expect(r.originalQuantity).toBe(6);
    expect(r.originalUnit).toBe('each');
  });
  it('4 large eggs -> count 4, tighter large-egg range', () => {
    const r = measureIngredient({ name: 'large eggs', quantity: 4, unit: 'each' });
    expect(r.count).toBe(4);
    expect(r.countNoun).toBe('egg');
    expect(r.gramsRange).toEqual({ min: 200, max: 220 });
  });
  it('eggs with no size word use the whole-spread range', () => {
    const r = measureIngredient({ name: 'eggs', quantity: 6, unit: '' });
    expect(r.count).toBe(6);
    expect(r.gramsRange.min).toBe(6 * 44);
    expect(r.gramsRange.max).toBe(6 * 58);
  });
  it('bare number with no unit still resolves as a count', () => {
    const r = measureIngredient({ name: '3 apples', quantity: 3, unit: null });
    expect(r.measurementType).toBe('count');
    expect(r.count).toBe(3);
  });
});

describe('measure — a typed gram value ALWAYS wins over the unit', () => {
  it('cup row with an override uses the override, keeps the original for display', () => {
    const r = measureIngredient({ name: 'plain flour', quantity: 2, unit: 'cup', gramsOverride: 260 });
    expect(r.grams).toBe(260);
    expect(r.gramsSource).toBe('manual');
    expect(r.originalUnit).toBe('cup');
    expect(r.needsConfirm).toBe(false);
  });
  it('override on a count row keeps the count', () => {
    const r = measureIngredient({ name: 'bananas', quantity: 6, unit: 'each', gramsOverride: 700 });
    expect(r.grams).toBe(700);
    expect(r.count).toBe(6);
    expect(r.note).toMatch(/6 banana/);
  });
});

describe('measure — unknowns are flagged, original preserved', () => {
  it('not-in-catalogue -> grams null, needsConfirm, original kept', () => {
    const r = measureIngredient({ name: 'dragonfruit powder', quantity: 2, unit: 'tbsp' });
    expect(r.grams).toBeNull();
    expect(r.needsConfirm).toBe(true);
    expect(r.originalQuantity).toBe(2);
    expect(r.originalUnit).toBe('tbsp');
  });
});

describe('measureList', () => {
  it('tags a whole list and honours row.grams as an override', () => {
    const rows = measureList([
      { name: '2 cups plain flour', quantity: 2, unit: 'cups' },
      { name: 'butter', quantity: 500, unit: 'g' },
      { name: 'eggs', quantity: 4, unit: 'each' },
      { name: 'plain flour', quantity: 2, unit: 'cups', grams: 250 }, // baker override
    ]);
    expect(rows[0].grams).toBe(240);
    expect(rows[1].measurementType).toBe('weight');
    expect(rows[2].count).toBe(4);
    expect(rows[3].grams).toBe(250);
    expect(rows[3].gramsSource).toBe('manual');
  });
});
