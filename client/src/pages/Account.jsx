import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { loginPath, useAuth } from '../auth.jsx';
import { Err, PageHeader } from '../components.jsx';

function UsageLine({ label, used, limit }) {
  return <div>{label}: <strong>{used}</strong>{limit == null ? ' (unlimited)' : ` / ${limit}`}</div>;
}

export default function Account() {
  const { user, loading, limits, usage, billingConfigured, logout, refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && !user) return <Navigate to={loginPath('/account')} replace />;
  if (loading || !user) return null;

  const isPro = user.plan === 'pro';

  const goBilling = async (path) => {
    setBusy(true); setError(null);
    try {
      const data = await api.post(path);
      window.location.href = data.url;
    } catch (e) { setError(e); setBusy(false); }
  };

  const onLogout = async () => {
    await logout();
    nav('/');
  };

  return (
    <>
      <PageHeader title="Account" />
      <Err error={error} />
      <div className="panel stack">
        <div><strong>{user.email}</strong>{user.isAdmin && <span className="pill ml-2">admin</span>}</div>
        <div>Plan: <span className="pill">{isPro ? 'Pro' : 'Free'}</span></div>

        {limits && usage && (
          <div className="stack">
            <UsageLine label="Recipes" used={usage.recipes} limit={limits.recipes} />
            <UsageLine label="Quotes" used={usage.quotes} limit={limits.quotes} />
            <UsageLine label="AI parses this month" used={usage.parseThisMonth} limit={limits.parseMonthly} />
          </div>
        )}

        <div className="row-actions mt-2">
          {!isPro && (
            <button
              disabled={!billingConfigured || busy}
              title={billingConfigured ? undefined : 'Billing not configured'}
              onClick={() => goBilling('/api/billing/checkout')}
            >
              {billingConfigured ? (busy ? 'Redirecting…' : 'Upgrade to Pro') : 'Billing not configured'}
            </button>
          )}
          {isPro && (
            <button
              disabled={!billingConfigured || busy}
              title={billingConfigured ? undefined : 'Billing not configured'}
              onClick={() => goBilling('/api/billing/portal')}
            >
              {billingConfigured ? (busy ? 'Redirecting…' : 'Manage billing') : 'Billing not configured'}
            </button>
          )}
          <button className="subtle" onClick={onLogout}>Log out</button>
        </div>
        <p className="caption mt-2">
          <a href="#" onClick={(e) => { e.preventDefault(); refresh(); }}>Refresh usage</a>
        </p>
      </div>
    </>
  );
}
