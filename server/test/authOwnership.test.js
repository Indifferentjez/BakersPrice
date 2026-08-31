import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken({ idToken }) {
      const map = {
        'good-token': { sub: 'google-sub-1', email: 'google.user@example.com', email_verified: true, name: 'G User' },
        'collision-token': { sub: 'google-sub-collide', email: 'collide@example.com', email_verified: true, name: 'Collide' },
        'unverified-token': { sub: 'google-sub-2', email: 'unverified@example.com', email_verified: false, name: 'NV' },
      };
      if (!map[idToken]) throw new Error('invalid token');
      return { getPayload: () => map[idToken] };
    }
  },
}));

import request from 'supertest';
import { app } from '../index.js';
import { db } from '../db.js';

const PASS = 'password1';
const FLOUR = [
  { name: 'plain flour', quantity: 200, unit: 'g' },
  { name: 'butter', quantity: 100, unit: 'g' },
  { name: 'caster sugar', quantity: 150, unit: 'g' },
  { name: 'eggs', quantity: 2, unit: 'each' },
];

function agent() {
  return request.agent(app);
}

async function signup(ag, email, password = PASS) {
  const res = await ag.post('/api/auth/signup').send({ email, password });
  expect(res.status, res.body?.error).toBe(201);
  return res.body.user;
}

async function createRecipe(ag, extra = {}) {
  const res = await ag.post('/api/recipes').send({
    name: extra.name || 'Test loaf',
    parsed: extra.parsed || FLOUR,
    user_id: extra.user_id,
  });
  expect(res.status, res.body?.error).toBe(201);
  return res.body;
}

describe('auth + recipe ownership', () => {
  beforeAll(() => {
    if (!process.env.GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID = 'test-google-client';
  });
  it('first signup claims orphan recipes', async () => {
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    if (users > 0) return;
    db.prepare(`
      INSERT INTO recipes (name, parsed_json, master_grams_json, detected_type, created_at, updated_at)
      VALUES ('Orphan loaf', '[]', '[]', 'unclassified', datetime('now'), datetime('now'))
    `).run();
    const ag = agent();
    await signup(ag, 'first-owner@example.com');
    const list = await ag.get('/api/recipes');
    expect(list.status).toBe(200);
    expect(list.body.some((r) => r.name === 'Orphan loaf')).toBe(true);
  });

  it('signup creates a session and GET /me returns the user without secrets', async () => {
    const ag = agent();
    const user = await signup(ag, `me-${crypto.randomUUID()}@example.com`);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.email).toContain('@');
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('google_sub');

    const me = await ag.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user).not.toHaveProperty('password_hash');
    expect(me.body.user).not.toHaveProperty('google_sub');
  });

  it('signup → create recipe stores session user_id; login returns the same recipes', async () => {
    const email = `baker-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    const user = await signup(ag, email);
    const recipe = await createRecipe(ag);
    expect(recipe.user_id).toBeUndefined();

    const row = db.prepare('SELECT user_id FROM recipes WHERE id = ?').get(recipe.id);
    expect(row.user_id).toBe(user.id);

    const listed = await ag.get('/api/recipes');
    expect(listed.body.map((r) => r.id)).toContain(recipe.id);

    await ag.post('/api/auth/logout');
    const loggedOut = await ag.get('/api/recipes');
    expect(loggedOut.status).toBe(401);

    const meGone = await ag.get('/api/auth/me');
    expect(meGone.body.user).toBeNull();

    const login = await ag.post('/api/auth/login').send({ email, password: PASS });
    expect(login.status).toBe(200);
    const again = await ag.get('/api/recipes');
    expect(again.body.map((r) => r.id)).toContain(recipe.id);
  });

  it('second user cannot GET/PUT/DELETE the first user’s recipe (404) and does not see it in the list', async () => {
    const a = agent();
    const b = agent();
    await signup(a, `a-${crypto.randomUUID()}@example.com`);
    await signup(b, `b-${crypto.randomUUID()}@example.com`);
    const recipe = await createRecipe(a, { name: 'Alice cake' });

    const get = await b.get(`/api/recipes/${recipe.id}`);
    expect(get.status).toBe(404);
    const put = await b.put(`/api/recipes/${recipe.id}`).send({ name: 'stolen', parsed: FLOUR });
    expect(put.status).toBe(404);
    const del = await b.delete(`/api/recipes/${recipe.id}`);
    expect(del.status).toBe(404);

    const list = await b.get('/api/recipes');
    expect(list.body.map((r) => r.id)).not.toContain(recipe.id);

    const still = await a.get(`/api/recipes/${recipe.id}`);
    expect(still.status).toBe(200);
    expect(still.body.name).toBe('Alice cake');
  });

  it('create ignores a client-supplied user_id', async () => {
    const a = agent();
    const b = agent();
    const alice = await signup(a, `own-${crypto.randomUUID()}@example.com`);
    const bob = await signup(b, `other-${crypto.randomUUID()}@example.com`);
    const recipe = await createRecipe(a, { user_id: bob.id });
    const row = db.prepare('SELECT user_id FROM recipes WHERE id = ?').get(recipe.id);
    expect(row.user_id).toBe(alice.id);
    expect(row.user_id).not.toBe(bob.id);
    const bobList = await b.get('/api/recipes');
    expect(bobList.body.map((r) => r.id)).not.toContain(recipe.id);
  });

  it('later signups do not claim leftover orphans', async () => {
    db.prepare(`
      INSERT INTO recipes (name, parsed_json, master_grams_json, detected_type, created_at, updated_at)
      VALUES ('Left behind', '[]', '[]', 'unclassified', datetime('now'), datetime('now'))
    `).run();
    const orphanId = db.prepare("SELECT id FROM recipes WHERE name = 'Left behind' ORDER BY id DESC LIMIT 1").get().id;
    const ag = agent();
    await signup(ag, `late-${crypto.randomUUID()}@example.com`);
    const list = await ag.get('/api/recipes');
    expect(list.body.map((r) => r.id)).not.toContain(orphanId);
  });

  it('customer quote endpoint stays public; baker list requires a session', async () => {
    const ag = agent();
    await signup(ag, `quote-${crypto.randomUUID()}@example.com`);
    await ag.put('/api/defaults').send({ hourly_rate: 20, labour_minutes: 60 });
    const recipe = await createRecipe(ag);
    const calc = await ag.post('/api/calc').send({
      recipeId: recipe.id,
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
      bake: { hourlyRate: 20, labourMinutes: 60 },
    });
    expect(calc.status, calc.body?.error).toBe(200);
    expect(calc.body.calculationId).toBeTruthy();

    const quote = await ag.post('/api/quotes').send({
      calculationId: calc.body.calculationId,
      tier: 'standard',
      cakeName: 'Public cake',
      businessName: 'Test Bakery',
    });
    expect(quote.status, quote.body?.error).toBe(201);
    const id = quote.body.id;

    const customer = await request(app).get(`/api/quotes/${id}/customer`);
    expect(customer.status).toBe(200);
    expect(customer.body.cakeName).toBe('Public cake');
    expect(customer.body.price).toBeTypeOf('number');
    expect(customer.body).not.toHaveProperty('tier');

    const bakerNoAuth = await request(app).get('/api/quotes');
    expect(bakerNoAuth.status).toBe(401);

    const bakerOwned = await ag.get(`/api/quotes/${id}`);
    expect(bakerOwned.status).toBe(200);

    const other = agent();
    await signup(other, `nosy-${crypto.randomUUID()}@example.com`);
    const otherGet = await other.get(`/api/quotes/${id}`);
    expect(otherGet.status).toBe(404);
  });

  it('session cookie still authenticates GET /me (refresh analogue)', async () => {
    const ag = agent();
    const user = await signup(ag, `sess-${crypto.randomUUID()}@example.com`);
    const me1 = await ag.get('/api/auth/me');
    expect(me1.body.user.id).toBe(user.id);
    const me2 = await ag.get('/api/auth/me');
    expect(me2.body.user.id).toBe(user.id);
  });

  it('duplicate email is 409; bad login is generic 401', async () => {
    const email = `dup-${crypto.randomUUID()}@example.com`;
    const ag = agent();
    await signup(ag, email);
    const again = await agent().post('/api/auth/signup').send({ email, password: PASS });
    expect(again.status).toBe(409);
    const bad = await agent().post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toMatch(/invalid email or password/i);
  });

  it('guest can preview calc with master[]; persist and quotes require auth', async () => {
    const guestCalc = await request(app).post('/api/calc').send({
      master: FLOUR,
      pan: { shape: 'round', unit: 'in', diameter: 8, depth: 3 },
    });
    expect(guestCalc.status, guestCalc.body?.error).toBe(200);
    expect(guestCalc.body.calculationId).toBeNull();

    const guestRecipe = await request(app).post('/api/recipes').send({ name: 'Nope', parsed: FLOUR });
    expect(guestRecipe.status).toBe(401);

    const guestIng = await request(app).put('/api/master-ingredients/flour').send({ price: 1.11, priceUnit: 'kg' });
    expect(guestIng.status).toBe(401);
  });

  it('Google ID token verify callback links or creates a user', async () => {
    const ag = agent();
    const bad = await ag.post('/api/auth/google').send({ credential: 'bad-token' });
    expect(bad.status).toBe(401);

    const ok = await ag.post('/api/auth/google').send({ credential: 'good-token' });
    expect(ok.status, ok.body?.error).toBe(200);
    expect(ok.body.user.email).toBe('google.user@example.com');
    const me = await ag.get('/api/auth/me');
    expect(me.body.user.email).toBe('google.user@example.com');

    const again = agent();
    const linked = await again.post('/api/auth/google').send({ credential: 'good-token' });
    expect(linked.body.user.id).toBe(ok.body.user.id);
  });

  it('rejects a Google credential whose email is not verified', async () => {
    const r = await agent().post('/api/auth/google').send({ credential: 'unverified-token' });
    expect(r.status).toBe(401);
  });

  it('a logged-out Google sign-in cannot adopt an existing password account', async () => {
    const email = 'collide@example.com';
    const local = agent();
    await signup(local, email); // account with a password, email never verified

    const takeover = await agent().post('/api/auth/google').send({ credential: 'collision-token' });
    expect(takeover.status).toBe(409);
    expect(takeover.body.code).toBe('PASSWORD_ACCOUNT_EXISTS');

    // the real owner: sign in with the password, then Google links to the same account
    const owner = agent();
    await owner.post('/api/auth/login').send({ email, password: PASS });
    const link = await owner.post('/api/auth/google').send({ credential: 'collision-token' });
    expect(link.status, link.body?.error).toBe(200);
    expect(link.body.user.email).toBe(email);
  });

  it('guest cannot call the LLM parse endpoint', async () => {
    const r = await request(app).post('/api/parse').send({ text: '200g plain flour' });
    expect(r.status).toBe(401);
  });

  it('login takes a bcrypt path even for an unknown email (no fast 404)', async () => {
    const r = await agent().post('/api/auth/login').send({ email: `ghost-${crypto.randomUUID()}@example.com`, password: 'whatever12' });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/invalid email or password/i);
  });
});
