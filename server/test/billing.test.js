import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { app } from '../index.js';
import { db } from '../db.js';

const WEBHOOK_SECRET = 'whsec_test_secret';

function agent() {
  return request.agent(app);
}

async function signup(ag, email, password = 'password1') {
  const res = await ag.post('/api/auth/signup').send({ email, password });
  expect(res.status, res.body?.error).toBe(201);
  return res.body.user;
}

function sendWebhook(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', header)
    .send(payload);
}

describe('Stripe billing', () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummykey';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('checkout.session.completed flips the referenced user to pro and stores ids', async () => {
    const email = `webhook1-${crypto.randomUUID()}@example.com`;
    const user = await signup(agent(), email);

    const r = await sendWebhook({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: user.id, customer: 'cus_123', subscription: 'sub_123' } },
    });
    expect(r.status, r.body?.error).toBe(200);

    const row = db.prepare('SELECT plan, stripe_customer_id, stripe_subscription_id FROM users WHERE id = ?').get(user.id);
    expect(row.plan).toBe('pro');
    expect(row.stripe_customer_id).toBe('cus_123');
    expect(row.stripe_subscription_id).toBe('sub_123');
  });

  it('customer.subscription.updated: active -> pro, past_due -> free', async () => {
    const email = `webhook2-${crypto.randomUUID()}@example.com`;
    const user = await signup(agent(), email);
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run('cus_456', user.id);

    const active = await sendWebhook({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_456', customer: 'cus_456', status: 'active' } },
    });
    expect(active.status).toBe(200);
    expect(db.prepare('SELECT plan FROM users WHERE id = ?').get(user.id).plan).toBe('pro');

    const pastDue = await sendWebhook({
      id: 'evt_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_456', customer: 'cus_456', status: 'past_due' } },
    });
    expect(pastDue.status).toBe(200);
    expect(db.prepare('SELECT plan FROM users WHERE id = ?').get(user.id).plan).toBe('free');
  });

  it('rejects a bad signature with 400', async () => {
    const payload = JSON.stringify({ id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } });
    const r = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send(payload);
    expect(r.status).toBe(400);
  });

  describe('with billing unconfigured', () => {
    afterEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_dummykey';
      process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
      process.env.STRIPE_PRICE_MONTHLY = 'price_test';
    });

    it('checkout/portal 503 when STRIPE_SECRET_KEY is unset', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const ag = agent();
      await signup(ag, `nobilling-${crypto.randomUUID()}@example.com`);
      const checkout = await ag.post('/api/billing/checkout');
      expect(checkout.status).toBe(503);
      const portal = await ag.post('/api/billing/portal');
      expect(portal.status).toBe(503);
    });

    it('webhook 503 when not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const r = await request(app)
        .post('/api/billing/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'x' }));
      expect(r.status).toBe(503);
    });
  });
});
