import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Err, PageHeader } from '../components.jsx';

export default function Pricing() {
  const { user, billingConfigured } = useAuth();
  const loc = useLocation();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const goBilling = async (path) => {
    setBusy(true); setError(null);
    try {
      const data = await api.post(path);
      window.location.href = data.url;
    } catch (e) { setError(e); setBusy(false); }
  };

  const isPro = user?.plan === 'pro';

  return (
    <>
      <PageHeader title="Pricing" subtitle="One paid plan, no surprises" />
      <Err error={error} />

      <div className="grid2">
        <div className="panel">
          <h3>Free</h3>
          <p className="price-tag">£0</p>
          <ul className="feature-list">
            <li>3 saved recipes</li>
            <li>3 saved quotes</li>
            <li>Full costing &amp; pricing engine</li>
            <li>Shared ingredient price catalogue</li>
            <li>Manual recipe entry (no auto-parsing)</li>
          </ul>
          {!user && <Link to={`/signup?next=${encodeURIComponent(loc.pathname)}`}>Create a free account</Link>}
          {user && !isPro && <span className="muted">Your current plan</span>}
        </div>

        <div className="panel">
          <h3>Pro</h3>
          <p className="price-tag">£12<span className="muted fw-normal"> /mo</span></p>
          <ul className="feature-list">
            <li>Unlimited recipes</li>
            <li>Unlimited quotes</li>
            <li>Photo / PDF / paste auto-parsing — 40/month</li>
            <li>Everything in Free</li>
          </ul>

          {!user && <Link to={`/signup?next=${encodeURIComponent(loc.pathname)}`}>Sign up to subscribe</Link>}

          {user && !isPro && (
            <button
              disabled={!billingConfigured || busy}
              title={billingConfigured ? undefined : 'Billing not configured'}
              onClick={() => goBilling('/api/billing/checkout')}
            >
              {billingConfigured ? (busy ? 'Redirecting…' : 'Subscribe — £12/mo') : 'Billing not configured'}
            </button>
          )}

          {user && isPro && (
            <button
              disabled={!billingConfigured || busy}
              title={billingConfigured ? undefined : 'Billing not configured'}
              onClick={() => goBilling('/api/billing/portal')}
            >
              {billingConfigured ? (busy ? 'Redirecting…' : 'Manage billing') : 'Billing not configured'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
