import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Err } from '../components.jsx';
import GoogleButton from './GoogleButton.jsx';

export default function Signup() {
  const { user, loading, signup, loginGoogle, googleClientId } = useAuth();
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
      <Err error={error} />
      <form className="stack" onSubmit={onSubmit}>
        <div>
          <label htmlFor="signup-email">Email</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="signup-password">Password</label>
          <input id="signup-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <small>At least 8 characters.</small>
        </div>
        <div>
          <label htmlFor="signup-confirm">Confirm password</label>
          <input id="signup-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </div>
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      {googleClientId && (
        <>
          <div className="auth-divider">or</div>
          <GoogleButton clientId={googleClientId} disabled={busy} onCredential={(c) => finish(() => loginGoogle(c))} />
        </>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
      </p>
    </div>
  );
}
