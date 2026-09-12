// Thin Stripe wrapper. getStripe() builds a fresh client from the current env
// var on every call (no module-level caching) so tests can flip
// STRIPE_SECRET_KEY per file without stale instances leaking across them.
import Stripe from 'stripe';

export function stripeAvailable() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_MONTHLY);
}

export function webhookAvailable() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
