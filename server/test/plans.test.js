import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { db } from '../db.js';

function agent() {
  return request.agent(app);
}

async function signup(ag, email, password = 'password1') {
  const res = await ag.post('/api/auth/signup').send({ email, password });
  expect(res.status, res.body?.error).toBe(201);
  return res.body.user;
}

async function createRecipe(ag, name) {
  return ag.post('/api/recipes').send({
    name,
    parsed: [
      { name: 'plain flour', quantity: 200, unit: 'g' },
      { name: 'butter', quantity: 100, unit: 'g' },
    ],
  });
}

function setPlan(email, plan) {
  db.prepare('UPDATE users SET plan = ? WHERE email = ?').run(plan, email);
}

describe('plan limits', () => {
  it('free plan: 3 recipes ok, 4th is 402 PLAN_LIMIT; /me reflects usage', async () => {
    const email = `free-recipes-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    await signup(ag, email);

    for (let i = 1; i <= 3; i += 1) {
      const r = await createRecipe(ag, `Cake ${i}`);
      expect(r.status, r.body?.error).toBe(201);
    }
    const blocked = await createRecipe(ag, 'Cake 4');
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('PLAN_LIMIT');
    expect(blocked.body.error).toMatch(/upgrade/i);

    const me = await ag.get('/api/auth/me');
    expect(me.body.plan).toBe('free');
    expect(me.body.limits).toEqual({ recipes: 3, quotes: 3, parseMonthly: 0 });
    expect(me.body.usage.recipes).toBe(3);
  });

  it('free plan: 3 quotes ok, 4th is 402 PLAN_LIMIT', async () => {
    const email = `free-quotes-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    await signup(ag, email);
    await ag.put('/api/defaults').send({ hourly_rate: 20, labour_minutes: 30 });

    const recipe = await createRecipe(ag, 'Quote cake');
    expect(recipe.status, recipe.body?.error).toBe(201);

    const makeQuote = async () => {
      const calc = await ag.post('/api/calc').send({
        recipeId: recipe.body.id,
        pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
        bake: { hourlyRate: 20, labourMinutes: 30 },
      });
      expect(calc.status, calc.body?.error).toBe(200);
      return ag.post('/api/quotes').send({ calculationId: calc.body.calculationId, tier: 'standard', cakeName: 'Q' });
    };

    for (let i = 1; i <= 3; i += 1) {
      const q = await makeQuote();
      expect(q.status, q.body?.error).toBe(201);
    }
    const blocked = await makeQuote();
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('PLAN_LIMIT');
  });

  it('free plan can never parse; pro plan can, up to the 40/month cap', async () => {
    const email = `parse-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    await signup(ag, email);

    const freeBlocked = await ag.post('/api/parse').send({ text: '200g plain flour' });
    expect(freeBlocked.status).toBe(402);
    expect(freeBlocked.body.code).toBe('PLAN_LIMIT');

    setPlan(email, 'pro');
    const me = await ag.get('/api/auth/me');
    expect(me.body.plan).toBe('pro');
    expect(me.body.limits).toEqual({ recipes: null, quotes: null, parseMonthly: 40 });
    expect(me.body.usage.parseThisMonth).toBe(0);

    // simulate having already used the monthly cap, without 40 real LLM calls
    db.prepare("UPDATE users SET parse_count_month = 40, parse_count_reset = strftime('%Y-%m','now') WHERE email = ?").run(email);
    const capped = await ag.post('/api/parse').send({ text: '200g plain flour' });
    expect(capped.status).toBe(402);
    expect(capped.body.code).toBe('PLAN_LIMIT');

    const meAfter = await ag.get('/api/auth/me');
    expect(meAfter.body.usage.parseThisMonth).toBe(40);
  });

  it('pro plan: unlimited recipes and quotes', async () => {
    const email = `pro-unlimited-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    await signup(ag, email);
    setPlan(email, 'pro');

    for (let i = 1; i <= 5; i += 1) {
      const r = await createRecipe(ag, `Pro cake ${i}`);
      expect(r.status, r.body?.error).toBe(201);
    }
    const me = await ag.get('/api/auth/me');
    expect(me.body.usage.recipes).toBe(5);
  });
});
