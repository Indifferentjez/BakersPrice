// Quantity string parsing: "1 1/2", "1.5", "½", "1½", "3/4" -> Number
const UNICODE_FRACTIONS = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

export function parseQty(raw) {
  if (raw == null) return NaN;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim().toLowerCase();
  if (!s) return NaN;
  if (s === 'a' || s === 'an' || s === 'one') return 1;

  // Replace unicode fractions, inserting a space if glued to a leading integer (e.g. "1½")
  for (const [glyph, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(glyph)) {
      s = s.replace(new RegExp(`(\\d)\\s*${glyph}`), (_, d) => `${d} ${val}`);
      s = s.replace(new RegExp(glyph, 'g'), ` ${val} `);
    }
  }
  s = s.replace(/\s+/g, ' ').trim();

  // "1 1/2" or "1 0.5"
  const mixed = s.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const mixedDec = s.match(/^(\d+)\s+(\d*\.\d+)$/);
  if (mixedDec) return Number(mixedDec[1]) + Number(mixedDec[2]);

  // "3/4"
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);

  // range "2-3" or "2 to 3" -> midpoint
  const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;

  const num = s.match(/^-?\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : NaN;
}
