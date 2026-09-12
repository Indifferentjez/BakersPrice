import { describe, expect, it, vi } from 'vitest';
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

function latestTokenFor(email) {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return db.prepare(
    'SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(user.id);
}

describe('password reset', () => {
  it('POST /forgot is always 200, for a real and a fake email', async () => {
    const email = `forgot-${crypto.randomUUID()}@example.com`;
    await signup(agent(), email);
    const real = await request(app).post('/api/auth/forgot').send({ email });
    expect(real.status).toBe(200);
    expect(real.body).toEqual({ ok: true });

    const fake = await request(app).post('/api/auth/forgot').send({ email: `nobody-${crypto.randomUUID()}@example.com` });
    expect(fake.status).toBe(200);
    expect(fake.body).toEqual({ ok: true });
  });

  it('forgot creates a hashed, single-use token row, never storing the raw token', async () => {
    const email = `forgot2-${crypto.randomUUID()}@example.com`;
    await signup(agent(), email);
    await request(app).post('/api/auth/forgot').send({ email });
    const row = latestTokenFor(email);
    expect(row).toBeTruthy();
    expect(row.token_hash).toHaveLength(64); // sha256 hex
    expect(row.used_at).toBeNull();
  });

  it('reset with a valid token sets the new password and logs the user in', async () => {
    const email = `reset-${crypto.randomUUID()}@example.com`;
    await signup(agent(), email);
    const { createPasswordResetToken } = await import('../lib/auth.js');
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const token = createPasswordResetToken(user.id);

    const ag = agent();
    const reset = await ag.post('/api/auth/reset').send({ token, password: 'newpassword1' });
    expect(reset.status, reset.body?.error).toBe(200);
    expect(reset.body.user.email).toBe(email);

    // session cookie from the reset response works
    const me = await ag.get('/api/auth/me');
    expect(me.body.user.email).toBe(email);

    // and the new password logs in from a fresh agent
    const login = await agent().post('/api/auth/login').send({ email, password: 'newpassword1' });
    expect(login.status).toBe(200);

    // old password no longer works
    const oldLogin = await agent().post('/api/auth/login').send({ email, password: 'password1' });
    expect(oldLogin.status).toBe(401);
  });

  it('rejects a missing, reused, or expired token', async () => {
    const bad = await request(app).post('/api/auth/reset').send({ token: 'not-a-real-token', password: 'newpassword1' });
    expect(bad.status).toBe(400);

    const email = `reset3-${crypto.randomUUID()}@example.com`;
    await signup(agent(), email);
    const { createPasswordResetToken } = await import('../lib/auth.js');
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    const token = createPasswordResetToken(user.id);

    const first = await request(app).post('/api/auth/reset').send({ token, password: 'newpassword1' });
    expect(first.status).toBe(200);
    const reused = await request(app).post('/api/auth/reset').send({ token, password: 'anotherpassword1' });
    expect(reused.status).toBe(400);

    const token2 = createPasswordResetToken(user.id);
    // order by rowid, not created_at (1-second SQLite resolution can tie
    // within a fast test run) — rowid reliably picks the just-inserted row.
    db.prepare('UPDATE password_reset_tokens SET expires_at = datetime(\'now\', \'-2 hours\') WHERE rowid IN (SELECT rowid FROM password_reset_tokens WHERE user_id = ? ORDER BY rowid DESC LIMIT 1)').run(user.id);
    const expired = await request(app).post('/api/auth/reset').send({ token: token2, password: 'yetanotherpw1' });
    expect(expired.status).toBe(400);
  });

  it('reset rejects a too-short password', async () => {
    const r = await request(app).post('/api/auth/reset').send({ token: 'whatever', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('a mailer failure never turns /forgot into a non-200', async () => {
    const email = `mailerfail-${crypto.randomUUID()}@example.com`;
    await signup(agent(), email);
    process.env.RESEND_API_KEY = 'test-key';
    process.env.MAIL_FROM = 'test@example.com';
    const spy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    try {
      const r = await request(app).post('/api/auth/forgot').send({ email });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
      delete process.env.RESEND_API_KEY;
      delete process.env.MAIL_FROM;
    }
  });
});
