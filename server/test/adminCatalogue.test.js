import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

function agent() {
  return request.agent(app);
}

async function signup(ag, email, password = 'password1') {
  const res = await ag.post('/api/auth/signup').send({ email, password });
  expect(res.status, res.body?.error).toBe(201);
  return res.body.user;
}

describe('admin-only catalogue writes', () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
  });

  it('a signed-in non-admin gets 403 on catalogue writes', async () => {
    const ag = agent();
    await signup(ag, `nonadmin-${crypto.randomUUID()}@example.com`);
    const put = await ag.put('/api/master-ingredients/flour').send({ price: 1.23, priceUnit: 'kg' });
    expect(put.status).toBe(403);
    const post = await ag.post('/api/master-ingredients').send({ display_name: 'Test spice', measurement_type: 'weight' });
    expect(post.status).toBe(403);
    const del = await ag.delete('/api/master-ingredients/flour');
    expect(del.status).toBe(403);
    const imp = await ag.post('/api/master-ingredients/import').send({ text: 'flour, kg, 1.10' });
    expect(imp.status).toBe(403);
  });

  it('the ADMIN_EMAIL user can write (case-insensitive match)', async () => {
    const email = `Admin-${crypto.randomUUID()}@Example.com`;
    process.env.ADMIN_EMAIL = email.toLowerCase();
    const ag = agent();
    await signup(ag, email);
    const put = await ag.put('/api/master-ingredients/flour').send({ price: 1.23, priceUnit: 'kg' });
    expect(put.status, put.body?.error).toBe(200);
    expect(put.body.price).toBe(1.23);
  });

  it('GET stays public regardless of admin status', async () => {
    const r = await request(app).get('/api/master-ingredients');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
  });

  it('/api/auth/me reflects isAdmin', async () => {
    const email = `admin2-${crypto.randomUUID()}@example.com`;
    process.env.ADMIN_EMAIL = ` ${email.toUpperCase()} `; // stray whitespace/case should still match
    const ag = agent();
    await signup(ag, email);
    const me = await ag.get('/api/auth/me');
    expect(me.body.isAdmin).toBe(true);
    expect(me.body.user.isAdmin).toBe(true);
  });
});
