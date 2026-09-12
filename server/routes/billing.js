import { Router } from 'express';
import { db } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { getStripe, stripeAvailable, webhookAvailable } from '../lib/stripeClient.js';
import { setUserPlan, setUserStripeCustomer, findUserByStripeCustomerId } from '../lib/billing.js';

const router = Router();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const getUserRow = db.prepare('SELECT * FROM users WHERE id = ?');

router.post('/checkout', requireUser, async (req, res, next) => {
  if (!stripeAvailable()) {
    return res.status(503).json({ error: 'Billing is not configured on this server.' });
  }
  try {
    const stripe = getStripe();
    const row = getUserRow.get(req.user.id);
    let customerId = row.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: row.email, metadata: { userId: row.id } });
      customerId = customer.id;
      // Persist immediately so a crash/retry never leaves a Stripe customer
      // with no users row pointing back at it.
      setUserStripeCustomer(row.id, customerId);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: row.id,
      line_items: [{ price: process.env.STRIPE_PRICE_MONTHLY, quantity: 1 }],
      success_url: `${CLIENT_ORIGIN}/account?checkout=success`,
      cancel_url: `${CLIENT_ORIGIN}/pricing?checkout=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

router.post('/portal', requireUser, async (req, res, next) => {
  if (!stripeAvailable()) {
    return res.status(503).json({ error: 'Billing is not configured on this server.' });
  }
  try {
    const stripe = getStripe();
    const row = getUserRow.get(req.user.id);
    if (!row.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account yet — subscribe first.' });
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${CLIENT_ORIGIN}/account`,
    });
    res.json({ url: portal.url });
  } catch (err) {
    next(err);
  }
});

export default router;

// Mounted separately in index.js with express.raw() BEFORE the global JSON
// parser — Stripe's signature check needs the exact raw request bytes.
export async function webhookHandler(req, res) {
  if (!webhookAvailable()) {
    return res.status(503).json({ error: 'Billing is not configured on this server.' });
  }
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const user = session.client_reference_id
        ? { id: session.client_reference_id }
        : findUserByStripeCustomerId(session.customer);
      if (user) {
        setUserPlan(user.id, 'pro', {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        });
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const user = findUserByStripeCustomerId(sub.customer);
      if (user) {
        const plan = ['active', 'trialing'].includes(sub.status) ? 'pro' : 'free';
        setUserPlan(user.id, plan, { stripeSubscriptionId: sub.id });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const user = findUserByStripeCustomerId(sub.customer);
      if (user) setUserPlan(user.id, 'free', { stripeSubscriptionId: sub.id });
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const user = findUserByStripeCustomerId(invoice.customer);
      if (user) setUserPlan(user.id, 'free');
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
}
