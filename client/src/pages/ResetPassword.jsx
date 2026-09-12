import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Err, PasswordField } from '../components.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true); setError(null);
    try {
      await api.post('/api/auth/reset', { token, password });
      // Full reload so AuthProvider re-fetches /me with the new session cookie.
      window.location.href = '/';
    } catch (err) { setError(err); setBusy(false); }
  };

  if (!token) {
    return (
      <div className="panel auth-panel">
        <h1>Reset your password</h1>
        <div className="errbox">This reset link is missing its token.</div>
        <p className="muted mt-3"><Link to="/forgot">Request a new reset link</Link></p>
      </div>
    );
  }

  return (
    <div className="panel auth-panel">
      <h1>Choose a new password</h1>
      <Err error={error} />
      <form className="stack" method="post" onSubmit={submit}>
        <div>
          <label htmlFor="reset-password">New password</label>
          <PasswordField id="reset-password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <small>At least 8 characters.</small>
        </div>
        <div>
          <label htmlFor="reset-confirm">Confirm new password</label>
          <PasswordField id="reset-confirm" name="password-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        </div>
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
      </form>
      <p className="muted mt-3"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
