import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Err } from '../components.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post('/api/auth/forgot', { email });
      setSent(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="panel auth-panel">
      <h1>Reset your password</h1>
      {sent ? (
        <p>If an account exists for that email, a reset link is on its way — check your inbox.</p>
      ) : (
        <>
          <p className="muted">Enter your email and we&apos;ll send you a link to reset your password.</p>
          <Err error={error} />
          <form className="stack" method="post" onSubmit={submit}>
            <div>
              <label htmlFor="forgot-email">Email</label>
              <input id="forgot-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </form>
        </>
      )}
      <p className="muted mt-3"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
