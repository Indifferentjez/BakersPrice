// Ingredient-specific gram conversion.
//
// The primary table is copied verbatim from the project brief. Entries with
// `table: true` are the brief's own numbers and resolve with full confidence.
// A small `table: false` set covers common structural ingredients (carrot,
// banana, chocolate chips...) so classification still works; those always come
// back `needsConfirm: true` because the brief says anything not in the table is
// confirmed by the baker, never silently guessed.
//
// Volume convention (matches the brief's liquid row of 240 g/cup ~= 1 g/ml):
//   1 cup  = 240 ml
//   1 tbsp = 15 ml  (cup / 16)
//   1 tsp  = 5 ml   (cup / 48)

import { parseQty } from './qty.js';

// category is used by the classifier. One of:
// flour | oats | sugar | fat | liquid | egg | cocoa | leavening | salt |
// flavour | nuts | dried-fruit | veg | mixin | other
export const CANONICAL = [
  // ---- structural dry base ----
  { key: 'cake flour', category: 'flour', table: true, perCup: 115,
    aliases: ['cake flour', 'sponge flour', 'cake and pastry flour'] },
  { key: 'flour', category: 'flour', table: true, perCup: 120,
    aliases: ['plain flour', 'all purpose flour', 'all-purpose flour', 'ap flour',
      'self raising flour', 'self-raising flour', 'self rising flour', 'self-rising flour',
      'sr flour', 'strong flour', 'bread flour', 'wholemeal flour', 'whole wheat flour',
      'wheat flour', 'flour'] },
  { key: 'oats', category: 'oats', table: true, perCup: 90,
    aliases: ['rolled oats', 'porridge oats', 'quick oats', 'oat flour', 'ground oats',
      'blended oats', 'jumbo oats', 'oats'] },

  // ---- sugars / syrups ----
  { key: 'brown sugar', category: 'sugar', table: true, perCup: 220,
    aliases: ['brown sugar', 'light brown sugar', 'dark brown sugar', 'soft brown sugar',
      'muscovado', 'muscovado sugar', 'demerara sugar', 'packed brown sugar'] },
  { key: 'caster sugar', category: 'sugar', table: true, perCup: 200,
    aliases: ['caster sugar', 'castor sugar', 'granulated sugar', 'white sugar',
      'superfine sugar', 'golden caster sugar', 'sugar'] },
  { key: 'icing sugar', category: 'sugar', table: false, perCup: 120,
    aliases: ['icing sugar', 'powdered sugar', 'confectioners sugar', "confectioner's sugar"] },
  { key: 'honey', category: 'sugar', table: true, perCup: 340,
    aliases: ['honey', 'golden syrup', 'maple syrup', 'agave', 'agave nectar', 'treacle',
      'molasses', 'corn syrup', 'date syrup'] },

  // ---- fats ----
  { key: 'butter', category: 'fat', table: true, perCup: 227,
    aliases: ['butter', 'unsalted butter', 'salted butter', 'margarine', 'baking spread',
      'block margarine'] },
  { key: 'oil', category: 'fat', table: true, perCup: 218,
    aliases: ['oil', 'vegetable oil', 'neutral oil', 'sunflower oil', 'canola oil',
      'rapeseed oil', 'corn oil', 'light olive oil', 'melted coconut oil', 'coconut oil'] },

  // ---- cocoa ----
  { key: 'cocoa', category: 'cocoa', table: true, perCup: 100,
    aliases: ['cocoa', 'cocoa powder', 'cacao powder', 'unsweetened cocoa',
      'dutch process cocoa', 'dutch-process cocoa'] },

  // ---- liquids ----
  { key: 'yogurt', category: 'liquid', table: true, perCup: 245,
    aliases: ['yogurt', 'yoghurt', 'greek yogurt', 'greek yoghurt', 'sour cream',
      'creme fraiche', 'crème fraîche'] },
  { key: 'milk', category: 'liquid', table: true, perCup: 240,
    aliases: ['milk', 'water', 'buttermilk', 'coffee', 'brewed coffee', 'hot coffee',
      'whole milk', 'semi skimmed milk', 'semi-skimmed milk', 'skim milk', 'skimmed milk',
      'almond milk', 'oat milk', 'soy milk', 'soya milk', 'cream', 'double cream',
      'single cream', 'heavy cream', 'whipping cream', 'half and half', 'orange juice',
      'lemon juice', 'lime juice', 'fruit juice', 'juice', 'passata'] },

  // ---- eggs ----
  { key: 'egg', category: 'egg', table: true, perEach: 50,
    sizes: { large: 50, medium: 44, small: 38, xl: 56, 'extra large': 56 },
    aliases: ['egg', 'eggs', 'whole egg', 'large egg', 'medium egg'] },
  { key: 'egg white', category: 'egg', table: false, perEach: 33,
    aliases: ['egg white', 'egg whites', 'white'] },
  { key: 'egg yolk', category: 'egg', table: false, perEach: 17,
    aliases: ['egg yolk', 'egg yolks', 'yolk'] },

  // ---- nuts / dried fruit ----
  { key: 'nuts', category: 'nuts', table: true, perCup: 120,
    aliases: ['nuts', 'chopped nuts', 'walnuts', 'pecans', 'almonds', 'hazelnuts',
      'ground almonds', 'almond flour', 'almond meal', 'blended nuts'] },
  { key: 'dried fruit', category: 'dried-fruit', table: true, perCup: 160,
    aliases: ['raisins', 'sultanas', 'currants', 'dried fruit', 'mixed dried fruit',
      'dried cranberries', 'chopped dates', 'chopped apricots'] },

  // ---- leavening / salt / flavour (per tsp) ----
  { key: 'baking powder', category: 'leavening', table: true, perTsp: 4,
    aliases: ['baking powder'] },
  { key: 'baking soda', category: 'leavening', table: true, perTsp: [4, 5],
    aliases: ['baking soda', 'bicarbonate of soda', 'bicarb', 'sodium bicarbonate',
      'bicarbonate soda'] },
  { key: 'salt', category: 'salt', table: true, perTsp: 6,
    aliases: ['salt', 'fine salt', 'sea salt', 'table salt', 'kosher salt'] },
  { key: 'extract', category: 'flavour', table: true, perTsp: [4, 5],
    aliases: ['vanilla extract', 'vanilla essence', 'vanilla bean paste', 'vanilla',
      'almond extract', 'lemon extract', 'extract', 'essence'] },

  // ---- extended (table:false, always needsConfirm) ----
  { key: 'grated carrot', category: 'veg', table: false, perCup: 110,
    aliases: ['grated carrot', 'shredded carrot', 'carrot', 'carrots'] },
  { key: 'grated courgette', category: 'veg', table: false, perCup: 120,
    aliases: ['grated courgette', 'grated zucchini', 'courgette', 'zucchini'] },
  { key: 'mashed banana', category: 'liquid', table: false, perCup: 225,
    aliases: ['mashed banana', 'banana', 'bananas'] },
  { key: 'applesauce', category: 'liquid', table: false, perCup: 245,
    aliases: ['applesauce', 'apple sauce', 'apple puree', 'pumpkin puree', 'pureed pumpkin'] },
  { key: 'desiccated coconut', category: 'mixin', table: false, perCup: 85,
    aliases: ['desiccated coconut', 'shredded coconut'] },
  { key: 'chocolate chips', category: 'mixin', table: false, perCup: 170,
    aliases: ['chocolate chips', 'choc chips', 'chocolate chunks', 'chopped chocolate',
      'dark chocolate', 'milk chocolate'] },
  { key: 'poppy seeds', category: 'mixin', table: false, perCup: 140,
    aliases: ['poppy seeds', 'poppyseed'] },
];

const MASS_UNITS = {
  g: 1, gram: 1, grams: 1, gr: 1, gm: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};
const VOLUME_UNITS_ML = {
  cup: 240, cups: 240, c: 240,
  tbsp: 15, tbsps: 15, tablespoon: 15, tablespoons: 15, tbs: 15, tb: 15, T: 15,
  tsp: 5, tsps: 5, teaspoon: 5, teaspoons: 5, t: 5,
  ml: 1, milliliter: 1, millilitre: 1, milliliters: 1, millilitres: 1, cc: 1,
  l: 1000, liter: 1000, litre: 1000, liters: 1000, litres: 1000,
  'fl oz': 30, floz: 30, 'fluid ounce': 30, 'fluid ounces': 30,
  pint: 480, pints: 480, quart: 960,
};
const COUNT_UNITS = new Set(['each', 'ea', 'whole', 'x', 'pcs', 'piece', 'pieces', 'count', '', 'unit', 'units']);

// Prep words that never change which ingredient we are looking at. Distinguishing
// words (caster, granulated, brown, cake, self-raising, large, ...) are kept.
const PREP_WORDS = new Set([
  'sifted', 'melted', 'softened', 'room', 'temperature', 'cold', 'warm', 'lukewarm',
  'beaten', 'fresh', 'organic', 'free', 'range', 'good', 'quality', 'pure', 'plus',
  'extra', 'for', 'greasing', 'dusting', 'about', 'approx', 'level', 'heaped',
  'roughly', 'finely', 'coarsely', 'lightly', 'well', 'the', 'of', 'and', 'a',
  'to', 'serve', 'optional', 'divided', 'or', 'more', 'as', 'needed',
]);

function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // drop "(packed)", "(sifted)" ...
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .filter((t) => t && !PREP_WORDS.has(t));
}
function singular(t) {
  if (t.length > 3 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function normalizeName(name) {
  return nameTokens(name).join(' ');
}

// Alias matches only when every one of its (singularised) words is present in the
// ingredient name. Specificity = number of alias words, so "cake flour" beats a
// bare "flour" and "unsalted butter" never captures a lone "salt".
export function resolve(name) {
  const toks = nameTokens(name);
  if (!toks.length) return null;
  const set = new Set(toks);
  let best = null;
  let bestScore = 0;
  for (const entry of CANONICAL) {
    for (const alias of entry.aliases) {
      const aToks = alias.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map(singular);
      if (!aToks.length || !aToks.every((t) => set.has(t))) continue;
      // score: alias word count, +1 if the name is exactly the alias
      const score = aToks.length + (toks.length === aToks.length ? 0.5 : 0);
      if (score > bestScore) { best = entry; bestScore = score; }
    }
  }
  return best;
}

export function categoryOf(name) {
  const e = resolve(name);
  return e ? e.category : 'other';
}

function detectEggSize(rawName, entry) {
  if (!entry.sizes) return entry.perEach;
  const n = String(rawName || '').toLowerCase();
  for (const [label, grams] of Object.entries(entry.sizes)) {
    if (n.includes(label)) return grams;
  }
  return entry.perEach; // default: large
}

// Returns:
//   { grams, gramsRange?, source, needsConfirm, canonical, category, note }
// source: 'given-weight' | 'table' | 'guess' | 'none'
export function toGrams({ name, qty, unit }) {
  const quantity = parseQty(qty);
  const rawUnit = String(unit || '').toLowerCase().trim();
  const entry = resolve(name);
  const category = entry ? entry.category : 'other';
  const canonical = entry ? entry.key : null;

  // 1. Weight given directly always wins over the table.
  if (rawUnit in MASS_UNITS) {
    if (!Number.isFinite(quantity)) {
      return { grams: null, source: 'none', needsConfirm: true, canonical, category,
        note: 'Could not read the quantity.' };
    }
    return {
      grams: quantity * MASS_UNITS[rawUnit],
      source: 'given-weight',
      needsConfirm: false,
      canonical, category,
      note: null,
    };
  }

  if (!entry) {
    return { grams: null, source: 'none', needsConfirm: true, canonical: null, category: 'other',
      note: `"${name}" is not in the conversion table — please enter its weight in grams.` };
  }

  if (!Number.isFinite(quantity)) {
    return { grams: null, source: 'none', needsConfirm: true, canonical, category,
      note: 'Could not read the quantity.' };
  }

  const confirmBase = entry.table !== true; // extended entries always need a check

  // 2. Count-based ingredients (eggs).
  if (entry.perEach != null && (COUNT_UNITS.has(rawUnit) || rawUnit === entry.key || rawUnit === 'egg' || rawUnit === 'eggs')) {
    const per = detectEggSize(name, entry);
    return {
      grams: quantity * per,
      source: 'table',
      needsConfirm: confirmBase,
      canonical, category,
      note: entry.sizes && per === entry.perEach ? 'Assumed large eggs (50 g each).' : null,
    };
  }

  // 3. Volume -> grams via the ingredient's per-cup / per-tsp density.
  if (rawUnit in VOLUME_UNITS_ML) {
    const ml = quantity * VOLUME_UNITS_ML[rawUnit];

    if (entry.perCup != null) {
      const perMl = entry.perCup / 240;
      return {
        grams: ml * perMl,
        source: 'table',
        needsConfirm: confirmBase,
        canonical, category,
        note: null,
      };
    }
    if (entry.perTsp != null) {
      const perMl = Array.isArray(entry.perTsp)
        ? [entry.perTsp[0] / 5, entry.perTsp[1] / 5]
        : entry.perTsp / 5;
      if (Array.isArray(perMl)) {
        const min = ml * perMl[0];
        const max = ml * perMl[1];
        return {
          grams: (min + max) / 2,
          gramsRange: { min, max },
          source: 'table',
          needsConfirm: confirmBase,
          canonical, category,
          note: `Brief lists this as ${entry.perTsp[0]}–${entry.perTsp[1]} g/tsp; midpoint used.`,
        };
      }
      return {
        grams: ml * perMl,
        source: 'table',
        needsConfirm: confirmBase,
        canonical, category,
        note: null,
      };
    }
  }

  // 4. Count given for a volume-only ingredient, or unit we can't map.
  if (entry.perEach != null && Number.isFinite(quantity)) {
    const per = detectEggSize(name, entry);
    return {
      grams: quantity * per,
      source: 'guess',
      needsConfirm: true,
      canonical, category,
      note: `Unrecognised unit "${unit}" — treated as a count.`,
    };
  }

  return {
    grams: null,
    source: 'none',
    needsConfirm: true,
    canonical, category,
    note: `Unrecognised unit "${unit}" for ${entry.key} — please enter grams.`,
  };
}

// Convert a whole parsed ingredient list to grams.
// Input rows: { name, quantity, unit, grams? }  (explicit grams wins)
// Output rows add: grams, gramsSource, needsConfirm, canonical, category, note
export function ingredientsToGrams(rows) {
  return rows.map((row) => {
    if (row.grams != null && Number.isFinite(Number(row.grams)) && !row.unit) {
      return {
        ...row,
        grams: Number(row.grams),
        gramsSource: 'given-weight',
        needsConfirm: false,
        canonical: resolve(row.name)?.key ?? null,
        category: categoryOf(row.name),
        note: null,
      };
    }
    const r = toGrams({ name: row.name, qty: row.quantity ?? row.qty, unit: row.unit });
    return {
      ...row,
      grams: r.grams,
      gramsRange: r.gramsRange,
      gramsSource: r.source,
      needsConfirm: r.needsConfirm,
      canonical: r.canonical,
      category: r.category,
      note: r.note,
    };
  });
}
