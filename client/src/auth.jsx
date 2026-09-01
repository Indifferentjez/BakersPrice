import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [googleClientId, setGoogleClientId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/api/auth/me').then((d) => d.user).catch(() => null),
      api.get('/api/auth/config').then((d) => d.googleClientId || null).catch(() => null),
    ]).then(([u, gid]) => {
      if (cancelled) return;
      setUser(u);
      setGoogleClientId(gid);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    googleClientId,
    async login(email, password) {
      const d = await api.post('/api/auth/login', { email, password });
      setUser(d.user);
      return d.user;
    },
    async signup(email, password, name) {
      const d = await api.post('/api/auth/signup', { email, password, name: name || undefined });
      setUser(d.user);
      return d.user;
    },
    async loginGoogle(credential) {
      const d = await api.post('/api/auth/google', { credential });
      setUser(d.user);
      return d.user;
    },
    async logout() {
      await api.post('/api/auth/logout').catch(() => {});
      setUser(null);
    },
  }), [user, loading, googleClientId]);

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
    <div className="infobox" style={{ marginBottom: 12 }}>
      <div>{children}</div>
      <div className="row-actions" style={{ marginTop: 8 }}>
        <Link to={loginPath(loc.pathname)}>Log in</Link>
        <span className="muted">·</span>
        <Link to={`/signup?next=${encodeURIComponent(loc.pathname)}`}>Create an account</Link>
      </div>
    </div>
  );
}
