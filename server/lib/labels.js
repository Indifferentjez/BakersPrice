// Plain-language labels for the customer document.

export function sizeLabel(pan) {
  if (!pan || !pan.shape) return '';
  const u = pan.unit === 'cm' ? 'cm' : 'inch';
  const nice = (v) => (v == null || v === '' ? null : `${+Number(v).toFixed(1).replace(/\.0$/, '')}`);
  const shape = pan.shape;
  if (shape === 'round' || shape === 'bundt') {
    const d = nice(pan.diameter);
    return d ? `${d}-${u} ${shape === 'bundt' ? 'bundt' : 'round'}` : `${shape}`;
  }
  if (shape === 'square') {
    const s = nice(pan.side);
    return s ? `${s}-${u} square` : 'square';
  }
  if (shape === 'loaf') {
    const l = nice(pan.length);
    return l ? `${l}-${u} loaf` : 'loaf';
  }
  if (shape === 'rectangular') {
    const l = nice(pan.length); const w = nice(pan.width);
    return l && w ? `${l} × ${w} ${u === 'inch' ? 'inch' : 'cm'} rectangular` : 'rectangular';
  }
  return shape;
}

// baked weight range (grams) -> "approx. 1.2–1.3 kg" / "approx. 850–900 g"
export function weightLabel(minG, maxG) {
  if (minG == null || maxG == null) return '';
  const fmt = (g) => (g >= 1000
    ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 2)} kg`
    : `${Math.round(g / 10) * 10} g`);
  if (Math.abs(maxG - minG) < 1) return `approx. ${fmt(minG)}`;
  if (maxG >= 1000) return `approx. ${(minG / 1000).toFixed(2)}–${(maxG / 1000).toFixed(2)} kg`;
  return `approx. ${Math.round(minG / 10) * 10}–${Math.round(maxG / 10) * 10} g`;
}

export function money(amount, currency = 'GBP') {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}
