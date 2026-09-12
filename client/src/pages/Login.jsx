import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Err, PasswordField } from '../components.jsx';
import GoogleButton from './GoogleButton.jsx';

export default function Login() {
  const { user, loading, login, loginGoogle, googleClientId, ephemeralStorage } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={next} replace />;

  const finish = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); nav(next, { replace: true }); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel auth-panel">
      <h1>Log in</h1>
      <p className="muted">Save this work to your account — recipes, quotes, and cost defaults.</p>
      {ephemeralStorage && (
        <div className="infobox mb-3">
          This hosted demo forgets accounts when the site sleeps (about 15 minutes idle). After a break, create the account again. On your own computer, logins stay saved.
        </div>
      )}
      <Err error={error} />
      <form className="stack" method="post" onSubmit={(e) => { e.preventDefault(); finish(() => login(email, password)); }}>
        <div>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="login-password">Password</label>
          <PasswordField id="login-password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <small><Link to="/forgot">Forgot password?</Link></small>
        </div>
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
      {googleClientId && (
        <>
          <div className="auth-divider">or</div>
          <GoogleButton clientId={googleClientId} disabled={busy} onCredential={(c) => finish(() => loginGoogle(c))} />
        </>
      )}
      <p className="muted mt-3">
        No account? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create one</Link>
      </p>
    </div>
  );
}
