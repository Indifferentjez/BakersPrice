import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import {
  createUser, findUserByEmail, findUserByGoogleSub, linkGoogleSub,
  verifyPassword, createSession, destroySession, publicUser, normalizeEmail,
  MAX_PASSWORD_LEN, DUMMY_HASH,
} from '../lib/auth.js';

const router = Router();

// Throttle the credential endpoints. Skipped under Vitest so the suite isn't
// rate-limited by its own rapid signups/logins.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.VITEST === 'true',
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});
router.use(['/login', '/signup', '/google'], authLimiter);

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
  if (password.length < 8 || password.length > MAX_PASSWORD_LEN) {
    return res.status(400).json({ error: `Password must be 8 to ${MAX_PASSWORD_LEN} characters.` });
  }
  if (findUserByEmail(email)) {
    // Enumeration tradeoff: without email verification there's no clean way to
    // hide this. Kept explicit so the UX is usable.
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
  // Always run a bcrypt compare so a missing email costs the same as a wrong
  // password (no timing oracle). DUMMY_HASH never matches.
  const ok = user
    ? verifyPassword(password, user.password_hash)
    : (verifyPassword(password, DUMMY_HASH), false);
  if (!user || !ok) {
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
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return res.status(401).json({ error: 'Google sign-in failed. Try again.' });
  }
  const email = normalizeEmail(payload.email);
  let user = findUserByGoogleSub(payload.sub);
  if (!user) {
    const existing = findUserByEmail(email);
    if (existing) {
      const isSelf = req.user && req.user.id === existing.id;
      // Never let a logged-out Google sign-in adopt an account that has its own
      // password (the local account's email was never verified). The owner must
      // sign in with their password first, then connect Google.
      if (existing.password_hash && !isSelf) {
        return res.status(409).json({
          error: 'This email already has a password login. Sign in with your password first, then connect Google.',
          code: 'PASSWORD_ACCOUNT_EXISTS',
        });
      }
      if (existing.google_sub && existing.google_sub !== payload.sub) {
        return res.status(409).json({ error: 'This email is already linked to a different Google account.' });
      }
      user = linkGoogleSub(existing.id, payload.sub);
      if (!user) return res.status(409).json({ error: 'Could not link this Google account.' });
    } else {
      user = createUser({ email, name: payload.name || null, googleSub: payload.sub });
    }
  }
  createSession(user.id, res);
  res.json({ user: publicUser(user) });
});

export default router;
