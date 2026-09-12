// Free/Pro plan limits + usage. Separate from lib/stripeClient.js, which only
// talks to Stripe — this module owns the plan gates themselves and works the
// same whether the plan came from a webhook or a test poking the DB directly.
import { db } from '../db.js';

export const LIMITS = {
  free: { recipes: 3, quotes: 3, parseMonthly: 0 },
  pro: { recipes: null, quotes: null, parseMonthly: 40 },
};

function limitsFor(plan) {
  return LIMITS[plan] || LIMITS.free;
}

const countRecipes = db.prepare('SELECT COUNT(*) AS n FROM recipes WHERE user_id = ?');
const countQuotes = db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE user_id = ?');
const getParseUsage = db.prepare('SELECT parse_count_month, parse_count_reset FROM users WHERE id = ?');
const setParseUsage = db.prepare('UPDATE users SET parse_count_month = ?, parse_count_reset = ? WHERE id = ?');
const bumpParseUsage = db.prepare('UPDATE users SET parse_count_month = parse_count_month + 1 WHERE id = ?');
const updateUserPlan = db.prepare(`
  UPDATE users SET plan = @plan,
    stripe_customer_id = COALESCE(@stripe_customer_id, stripe_customer_id),
    stripe_subscription_id = COALESCE(@stripe_subscription_id, stripe_subscription_id)
  WHERE id = @id
`);
const setCustomerId = db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?');
const getByStripeCustomer = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?');

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function canCreateRecipe(userId, plan) {
  const limit = limitsFor(plan).recipes;
  if (limit == null) return { ok: true };
  const n = countRecipes.get(userId).n;
  if (n >= limit) {
    return { ok: false, reason: `Free plan is limited to ${limit} saved recipes. Upgrade to Pro for unlimited recipes.` };
  }
  return { ok: true };
}

export function canCreateQuote(userId, plan) {
  const limit = limitsFor(plan).quotes;
  if (limit == null) return { ok: true };
  const n = countQuotes.get(userId).n;
  if (n >= limit) {
    return { ok: false, reason: `Free plan is limited to ${limit} saved quotes. Upgrade to Pro for unlimited quotes.` };
  }
  return { ok: true };
}

// Lazily rolls the counter over when the calendar month has changed. Returns
// the current (possibly just-reset) count.
export function ensureParseMonthCurrent(userId) {
  const row = getParseUsage.get(userId);
  if (!row) return 0;
  const key = monthKey();
  if (row.parse_count_reset !== key) {
    setParseUsage.run(0, key, userId);
    return 0;
  }
  return row.parse_count_month;
}

export function canUseParse(userId, plan) {
  if (plan !== 'pro') {
    return { ok: false, reason: 'Photo/PDF/paste parsing is a Pro feature. Upgrade to Pro to use it.' };
  }
  const used = ensureParseMonthCurrent(userId);
  const cap = limitsFor('pro').parseMonthly;
  if (used >= cap) {
    return { ok: false, reason: `You've used all ${cap} AI parses this month. They reset at the start of next month.` };
  }
  return { ok: true };
}

export function recordParseUsage(userId) {
  ensureParseMonthCurrent(userId);
  bumpParseUsage.run(userId);
}

export function getUsageInfo(userId, plan) {
  return {
    limits: limitsFor(plan),
    usage: {
      recipes: countRecipes.get(userId).n,
      quotes: countQuotes.get(userId).n,
      parseThisMonth: ensureParseMonthCurrent(userId),
    },
  };
}

export function setUserPlan(userId, plan, { stripeCustomerId, stripeSubscriptionId } = {}) {
  updateUserPlan.run({
    id: userId,
    plan,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_subscription_id: stripeSubscriptionId ?? null,
  });
}

export function setUserStripeCustomer(userId, customerId) {
  setCustomerId.run(customerId, userId);
}

export function findUserByStripeCustomerId(customerId) {
  return getByStripeCustomer.get(customerId) || null;
}
