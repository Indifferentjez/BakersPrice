import { describe, it, expect } from 'vitest';
import { customerDto } from '../routes/quotes.js';

const LEAK_KEYS = /cost|margin|overhead|tier|price_floor|priceFloor|estimate_json|breakdown|bakeUsed/i;

function assertNoLeak(obj, path = '') {
  if (obj == null || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    expect(k, `${path}${k}`).not.toMatch(LEAK_KEYS);
    if (v && typeof v === 'object') assertNoLeak(v, `${path}${k}.`);
  }
}

describe('customer quote DTO', () => {
  const row = {
    mode: 'single',
    business_name: 'Sweet Sobo',
    cake_name: 'Lemon drizzle',
    description: 'A loaf cake.',
    allergens: 'Contains gluten, egg, milk.',
    note: 'Serves 10.',
    currency: 'GBP',
    is_estimate: 1,
    size_label: '9-inch loaf',
    weight_label: '~900 g baked',
    price: 28.5,
    // baker-only fields that must never appear on the customer DTO
    tier: 'standard',
    price_floor: 22,
    estimate_json: JSON.stringify({ missingIngredientPrices: ['butter'], overhead: 0.15, margin: 0.5 }),
    menu_json: null,
  };

  it('never includes cost, margin, overhead, tier, or floor', () => {
    const dto = customerDto(row);
    expect(dto.price).toBe(28.5);
    expect(dto.estimated).toBe(true);
    expect(dto.cakeName).toBe('Lemon drizzle');
    assertNoLeak(dto);
    const blob = JSON.stringify(dto);
    expect(blob).not.toMatch(/standard/);
    expect(blob).not.toMatch(/22/);
    expect(blob).not.toMatch(/butter/);
    expect(blob).not.toMatch(/overhead/i);
    expect(blob).not.toMatch(/margin/i);
  });

  it('strips baker fields from menu items too', () => {
    const dto = customerDto({
      ...row,
      mode: 'menu',
      menu_json: JSON.stringify([
        { sizeLabel: '6 in', weightLabel: '400 g', price: 18, priceFloor: 14, tier: 'minimum', estimated: true, cost: 9 },
      ]),
    });
    expect(dto.menu).toEqual([
      { sizeLabel: '6 in', weightLabel: '400 g', price: 18, estimated: true },
    ]);
    assertNoLeak(dto);
  });
});
