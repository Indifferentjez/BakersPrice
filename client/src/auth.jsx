import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [limits, setLimits] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState(null);
  const [ephemeralStorage, setEphemeralStorage] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(false);

  // Single source of truth for "who's signed in + what can they do" — called on
  // mount and again after every auth action, so plan/limits/usage are always
  // fresh rather than trusting each POST's own response body.
  const refresh = async () => {
    const [me, cfg] = await Promise.all([
      api.get('/api/auth/me').catch(() => null),
      api.get('/api/auth/config').catch(() => null),
    ]);
    setUser(me?.user || null);
    setLimits(me?.limits || null);
    setUsage(me?.usage || null);
    setGoogleClientId(cfg?.googleClientId || null);
    setEphemeralStorage(!!cfg?.ephemeralStorage);
    setBillingConfigured(!!cfg?.billingConfigured);
    return me?.user || null;
  };

  useEffect(() => {
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    user,
    limits,
    usage,
    loading,
    googleClientId,
    ephemeralStorage,
    billingConfigured,
    refresh,
    async login(email, password) {
      await api.post('/api/auth/login', { email, password });
      return refresh();
    },
    async signup(email, password, name) {
      await api.post('/api/auth/signup', { email, password, name: name || undefined });
      return refresh();
    },
    async loginGoogle(credential) {
      await api.post('/api/auth/google', { credential });
      return refresh();
    },
    async logout() {
      await api.post('/api/auth/logout').catch(() => {});
      setUser(null);
      setLimits(null);
      setUsage(null);
      setBillingConfigured(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, limits, usage, loading, googleClientId, ephemeralStorage, billingConfigured]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function loginPath(next) {
  const n = next && next !== '/login' && next !== '/signup' ? next : '/';
  return `/login?next=${encodeURIComponent(n)}`;
}

export function AuthCta({ children }) {
  const loc = useLocation();
  return (
    <div className="infobox mb-3">
      <div>{children}</div>
      <div className="row-actions mt-2">
        <Link to={loginPath(loc.pathname)}>Log in</Link>
        <span className="muted">·</span>
        <Link to={`/signup?next=${encodeURIComponent(loc.pathname)}`}>Create an account</Link>
      </div>
    </div>
  );
}

// Shown when a signed-in user hits a Free-plan limit (recipes/quotes/parse) —
// an expected, actionable state, not an error box.
export function UpgradeCta({ children }) {
  return (
    <div className="warnbox mb-3">
      <div>{children}</div>
      <div className="row-actions mt-2">
        <Link to="/pricing">See Pro pricing</Link>
      </div>
    </div>
  );
}
