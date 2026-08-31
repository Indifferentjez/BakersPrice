import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';

export const COOKIE_NAME = 'bp_sid';
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 10;
export const MAX_PASSWORD_LEN = 200;
// A fixed bcrypt hash of a random string. Compared against on the
// user-not-found login branch so a missing email costs the same as a wrong
// password (no timing oracle for account enumeration).
export const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO1sT.dVQ0h1r5o1t7Yb3sQ2Yy8y0m1S';

const insertUser = db.prepare(`
  INSERT INTO users (id, email, name, password_hash, google_sub, created_at)
  VALUES (@id, @email, @name, @password_hash, @google_sub, datetime('now'))
`);
const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const getUserByGoogle = db.prepare('SELECT * FROM users WHERE google_sub = ?');
const countUsers = db.prepare('SELECT COUNT(*) AS n FROM users');
const setGoogleSub = db.prepare('UPDATE users SET google_sub = @google_sub WHERE id = @id AND google_sub IS NULL');
const setPasswordHash = db.prepare('UPDATE users SET password_hash = @password_hash WHERE id = @id');

const insertSession = db.prepare(`
  INSERT INTO sessions (id, user_id, expires_at, created_at)
  VALUES (@id, @user_id, @expires_at, datetime('now'))
`);
const getSession = db.prepare(`
  SELECT s.id AS session_id, s.expires_at, u.*
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`);
const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');
const touchSession = db.prepare(`UPDATE sessions SET expires_at = @expires_at WHERE id = @id`);
const purgeSessions = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");

export function deleteExpiredSessions() {
  try { return purgeSessions.run().changes; } catch { return 0; }
}

const claimRecipes = db.prepare('UPDATE recipes SET user_id = ? WHERE user_id IS NULL');
const claimQuotes = db.prepare('UPDATE quotes SET user_id = ? WHERE user_id IS NULL');
const claimCalcs = db.prepare('UPDATE calculations SET user_id = ? WHERE user_id IS NULL');

const templateDefaults = db.prepare('SELECT * FROM cost_defaults WHERE id = 1');
const getUserDefaults = db.prepare('SELECT * FROM user_cost_defaults WHERE user_id = ?');
const insertUserDefaults = db.prepare(`
  INSERT INTO user_cost_defaults (
    user_id, hourly_rate, energy_cost, packaging_cost, overhead_pct,
    margin_min_pct, margin_std_pct, margin_premium_pct, labour_minutes,
    currency, business_name, updated_at
  ) VALUES (
    @user_id, @hourly_rate, @energy_cost, @packaging_cost, @overhead_pct,
    @margin_min_pct, @margin_std_pct, @margin_premium_pct, @labour_minutes,
    @currency, @business_name, datetime('now')
  )
`);
const updateUserDefaults = db.prepare(`
  UPDATE user_cost_defaults SET
    hourly_rate=@hourly_rate, energy_cost=@energy_cost, packaging_cost=@packaging_cost,
    overhead_pct=@overhead_pct, margin_min_pct=@margin_min_pct, margin_std_pct=@margin_std_pct,
    margin_premium_pct=@margin_premium_pct, labour_minutes=@labour_minutes,
    currency=@currency, business_name=@business_name, updated_at=datetime('now')
  WHERE user_id=@user_id
`);

function useSignedCookies() {
  return Boolean(process.env.SESSION_SECRET);
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    signed: useSignedCookies(),
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function readSessionId(req) {
  if (useSignedCookies()) return req.signedCookies?.[COOKIE_NAME];
  return req.cookies?.[COOKIE_NAME];
}

function sessionExpiryIso() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name || null };
}

export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(String(plain), hash);
}

export function createUser({ email, name, password, googleSub }) {
  const first = countUsers.get().n === 0;
  const id = crypto.randomUUID();
  insertUser.run({
    id,
    email: normalizeEmail(email),
    name: name ? String(name).trim() : null,
    password_hash: password ? hashPassword(password) : null,
    google_sub: googleSub || null,
  });
  if (first) claimOrphans(id);
  ensureUserDefaults(id);
  return getUserById.get(id);
}

export function findUserByEmail(email) {
  return getUserByEmail.get(normalizeEmail(email));
}

export function findUserByGoogleSub(sub) {
  return getUserByGoogle.get(sub);
}

export function linkGoogleSub(userId, sub) {
  setGoogleSub.run({ id: userId, google_sub: sub });
  return getUserById.get(userId);
}

export function setUserPassword(userId, password) {
  setPasswordHash.run({ id: userId, password_hash: hashPassword(password) });
}

function claimOrphans(userId) {
  claimRecipes.run(userId);
  claimQuotes.run(userId);
  claimCalcs.run(userId);
}

export function createSession(userId, res) {
  const id = crypto.randomUUID();
  insertSession.run({ id, user_id: userId, expires_at: sessionExpiryIso() });
  res.cookie(COOKIE_NAME, id, cookieOpts());
  return id;
}

export function destroySession(req, res) {
  const sid = readSessionId(req);
  if (sid) deleteSession.run(sid);
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    signed: useSignedCookies(),
  });
}

export function attachUser(req, _res, next) {
  req.user = null;
  const sid = readSessionId(req);
  if (!sid) return next();
  const row = getSession.get(sid);
  if (!row) return next();
  if (new Date(String(row.expires_at).replace(' ', 'T') + (String(row.expires_at).endsWith('Z') ? '' : 'Z')).getTime() < Date.now()) {
    deleteSession.run(sid);
    return next();
  }
  touchSession.run({ id: sid, expires_at: sessionExpiryIso() });
  req.user = publicUser(row);
  req.sessionId = row.session_id;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHENTICATED' });
  }
  next();
}

export function defaultsTemplate() {
  const t = templateDefaults.get() || {};
  return {
    hourly_rate: t.hourly_rate ?? null,
    energy_cost: t.energy_cost ?? 0,
    packaging_cost: t.packaging_cost ?? 0,
    overhead_pct: t.overhead_pct ?? 0,
    margin_min_pct: t.margin_min_pct ?? 28,
    margin_std_pct: t.margin_std_pct ?? 50,
    margin_premium_pct: t.margin_premium_pct ?? 65,
    labour_minutes: t.labour_minutes ?? null,
    currency: t.currency || 'GBP',
    business_name: t.business_name || null,
  };
}

export function ensureUserDefaults(userId) {
  if (getUserDefaults.get(userId)) return;
  insertUserDefaults.run({ user_id: userId, ...defaultsTemplate() });
}

export function readUserDefaults(userId) {
  ensureUserDefaults(userId);
  const d = getUserDefaults.get(userId);
  return { ...d, needsHourlyRate: d.hourly_rate == null };
}

export function writeUserDefaults(userId, fields) {
  ensureUserDefaults(userId);
  updateUserDefaults.run({ user_id: userId, ...fields });
  return readUserDefaults(userId);
}

export function ownsRecipe(recipeId, userId) {
  return db.prepare('SELECT id FROM recipes WHERE id = ? AND user_id = ?').get(recipeId, userId) || null;
}
