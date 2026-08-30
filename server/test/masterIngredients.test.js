import { describe, it, expect } from 'vitest';
import {
  getCatalogue, resolve, byKey, categoryOf, pricesByKey,
  updatePrice, importPrices, upsertIngredient,
} from '../lib/masterIngredients.js';

describe('master catalogue — seed + resolve', () => {
  it('seeds from the JSON on first use', () => {
    const c = getCatalogue();
    expect(c.length).toBeGreaterThan(30);
    expect(byKey('flour')).toBeTruthy();
    expect(byKey('egg').measurementType).toBe('count');
    expect(byKey('flour').measurementType).toBe('volume');
    expect(byKey('egg').priceBasis).toBe('Aldi');
    expect(byKey('flour').price).toBeNull(); // no fabricated prices
  });

  it('token-subset name matching', () => {
    expect(resolve('plain flour').key).toBe('flour');
    expect(resolve('strong white bread flour').key).toBe('flour');
    expect(resolve('caster sugar').key).toBe('caster-sugar');
    expect(resolve('unsalted butter').key).toBe('butter');
    expect(resolve('sunflower oil').key).toBe('oil');
    expect(categoryOf('double cream')).toBe('liquid');
  });

  it('whole fruit resolves to the COUNT entry, purée to the volume entry', () => {
    expect(resolve('bananas').key).toBe('banana');
    expect(resolve('6 ripe bananas').key).toBe('banana');
    expect(resolve('mashed bananas').key).toBe('banana');
    expect(resolve('banana purée').key).toBe('banana-puree');
    expect(byKey('banana').measurementType).toBe('count');
    expect(byKey('banana-puree').measurementType).toBe('volume');
    expect(resolve('apples').key).toBe('apple');
    expect(resolve('oranges').key).toBe('orange');
  });

  it('does not capture a lone "salt" as "unsalted butter"', () => {
    expect(resolve('salt').key).toBe('salt');
  });
});

describe('master catalogue — writes', () => {
  it('updatePrice is reflected in pricesByKey', () => {
    updatePrice('flour', { price: 1.09, priceUnit: 'kg', priceBasis: 'Aldi' });
    expect(pricesByKey().flour.price).toBe(1.09);
    expect(byKey('flour').priceBasis).toBe('Aldi');
  });

  it('importPrices matches by name, reports unmatched', () => {
    const r = importPrices([
      { name: 'caster sugar', price: 0.85, priceUnit: 'kg' },
      { name: 'large eggs', price: 0.22, priceUnit: 'each' },
      { name: 'unobtainium dust', price: 99, priceUnit: 'kg' },
    ]);
    expect(r.updated.map((u) => u.key)).toEqual(expect.arrayContaining(['caster-sugar', 'egg']));
    expect(r.unmatched).toContain('unobtainium dust');
    expect(byKey('caster-sugar').price).toBe(0.85);
    expect(byKey('egg').price).toBe(0.22);
  });

  it('upsertIngredient adds a new catalogue entry that resolve() then finds', () => {
    upsertIngredient({
      display_name: 'Marzipan', measurement_type: 'weight', category: 'mixin',
      aliases: ['marzipan', 'almond paste'], price: 4.5, price_unit: 'kg',
    });
    const hit = resolve('almond paste');
    expect(hit).toBeTruthy();
    expect(hit.key).toBe('marzipan');
    expect(hit.price).toBe(4.5);
  });
});
