import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Err, PasswordField } from '../components.jsx';
import GoogleButton from './GoogleButton.jsx';

export default function Signup() {
  const { user, loading, signup, loginGoogle, googleClientId, ephemeralStorage } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={next} replace />;

  const finish = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); nav(next, { replace: true }); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    finish(() => signup(email, password));
  };

  return (
    <div className="panel auth-panel">
      <h1>Create an account</h1>
      <p className="muted">Recipes and quotes you save stay on this account.</p>
      {ephemeralStorage && (
        <div className="infobox mb-3">
          This hosted demo forgets accounts when the site sleeps (about 15 minutes idle). After a break, create the account again. On your own computer, logins stay saved.
        </div>
      )}
      <Err error={error} />
      <form className="stack" method="post" onSubmit={onSubmit}>
        <div>
          <label htmlFor="signup-email">Email</label>
          <input id="signup-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="signup-password">Password</label>
          <PasswordField id="signup-password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <small>At least 8 characters.</small>
        </div>
        <div>
          <label htmlFor="signup-confirm">Confirm password</label>
          <PasswordField id="signup-confirm" name="password-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </div>
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      {googleClientId && (
        <>
          <div className="auth-divider">or</div>
          <GoogleButton clientId={googleClientId} disabled={busy} onCredential={(c) => finish(() => loginGoogle(c))} />
        </>
      )}
      <p className="muted mt-3">
        Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
      </p>
    </div>
  );
}
