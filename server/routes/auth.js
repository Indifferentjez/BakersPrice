import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  createUser, findUserByEmail, findUserByGoogleSub, linkGoogleSub,
  verifyPassword, createSession, destroySession, publicUser, normalizeEmail,
} from '../lib/auth.js';

const router = Router();

function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  return id ? new OAuth2Client(id) : null;
}

router.get('/config', (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

router.post('/signup', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const name = req.body?.name ? String(req.body.name).trim() : null;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  const user = createUser({ email, name, password });
  createSession(user.id, res);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  createSession(user.id, res);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.post('/google', async (req, res) => {
  const client = googleClient();
  if (!client) {
    return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
  }
  const credential = req.body?.credential || req.body?.idToken;
  if (!credential) {
    return res.status(400).json({ error: 'Missing Google credential.' });
  }
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed. Try again.' });
  }
  if (!payload?.sub || !payload.email) {
    return res.status(401).json({ error: 'Google sign-in failed. Try again.' });
  }
  const email = normalizeEmail(payload.email);
  let user = findUserByGoogleSub(payload.sub);
  if (!user) {
    user = findUserByEmail(email);
    if (user) {
      user = linkGoogleSub(user.id, payload.sub);
    } else {
      user = createUser({
        email,
        name: payload.name || null,
        googleSub: payload.sub,
      });
    }
  }
  createSession(user.id, res);
  res.json({ user: publicUser(user) });
});

export default router;
