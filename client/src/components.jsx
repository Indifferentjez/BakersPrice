import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconEye, IconEyeOff } from './icons.jsx';

// Standard page-top block: title + one-line purpose + optional primary action.
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="page-header__action">{action}</div>}
    </div>
  );
}

export function PasswordField({ id, name, autoComplete, value, onChange, ...rest }) {
  const [shown, setShown] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const form = wrapRef.current?.closest('form');
    if (!form) return undefined;
    const hide = () => {
      if (inputRef.current) inputRef.current.type = 'password';
      setShown(false);
    };
    form.addEventListener('submit', hide, true);
    return () => form.removeEventListener('submit', hide, true);
  }, []);

  return (
    <div className="password-field" ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        {...rest}
      />
      <button
        type="button"
        className="password-field__toggle"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

export function Badge({ accuracy }) {
  if (!accuracy) return null;
  const label = accuracy.replace('_', ' ');
  return <span className={`badge ${accuracy}`} title={hint(accuracy)}>{label}</span>;
}
function hint(a) {
  return {
    KNOWN: 'You entered this value.',
    CALCULATED: 'Pure arithmetic from known/calculated inputs.',
    ESTIMATED: 'From the generic tables in the brief — verify with a real bake.',
    REQUIRES_TESTING: 'Do not rely on this commercially until a real bake confirms it.',
  }[a] || '';
}

export function Range({ v, unit = 'g', dp = 0 }) {
  if (!v) return <span className="muted">—</span>;
  if (v.min == null && v.value == null) return <span className="muted">—</span>;
  const f = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
  if (v.value != null) return <span>{f(v.value)} {unit}</span>;
  if (Math.abs(v.max - v.min) < (dp ? 0.01 : 1)) return <span>{f(v.min)} {unit}</span>;
  return <span>{f(v.min)}–{f(v.max)} {unit}</span>;
}

export function Money({ amount, currency = 'GBP' }) {
  if (amount == null) return <span className="muted">—</span>;
  let s;
  try { s = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount); }
  catch { s = `${currency} ${Number(amount).toFixed(2)}`; }
  return <span>{s}</span>;
}

export function RatioBars({ ratios }) {
  const keys = ['fat', 'sugar', 'egg', 'liquid', 'cocoa'];
  const max = Math.max(150, ...keys.map((k) => ratios?.[k] || 0));
  return (
    <div className="ratiobars">
      {keys.map((k) => (
        <div className="ratiobar" key={k}>
          <div className="ratiobar__label">{k} : base</div>
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(100, ((ratios?.[k] || 0) / max) * 100)}%` }} />
          </div>
          <div className="ratiobar__val">{ratios?.[k] ?? 0}%</div>
        </div>
      ))}
    </div>
  );
}

export function Checks({ audit }) {
  if (!audit) return null;
  return (
    <ul className="checks">
      {audit.checks.map((c, i) => (
        <li key={i}>
          <span className={`dot ${c.level}`} />
          <span><strong>{c.title}.</strong> {c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function Err({ error }) {
  if (!error) return null;
  const msg = typeof error === 'string' ? error : error.message;
  const unauth = error?.status === 401 || error?.data?.code === 'UNAUTHENTICATED';
  return (
    <div className="errbox">
      <div>{msg}</div>
      {unauth && <div className="caption mt-2">Sign in and try again — your work on this page is not lost.</div>}
    </div>
  );
}

// Prominent "this price is an estimate" banner with the margin for error.
export function EstimateBanner({ price, cur = 'GBP' }) {
  const e = price?.estimate;
  if (!e || !e.isEstimate) return null;
  const f = (n) => <Money amount={n} currency={cur} />;
  const std = e.priceRange?.standard || [];
  // gap = how far the estimate sits ABOVE the firm floor, as a % of the floor
  const gap = (std[0] != null && std[1] != null && std[0] > 0) ? Math.round(((std[1] - std[0]) / std[0]) * 100) : null;
  return (
    <div className="warnbox mb-3">
      <div className="estimate-head">
        <IconAlert size={16} />
        This is an ESTIMATE, not a firm price
        <span className="badge REQUIRES_TESTING">{e.accuracy?.replace('_', ' ')}</span>
      </div>
      {e.missingIngredientPrices?.length > 0 && (
        <div>
          {e.unpricedWeightPct}% of the ingredient weight has no saved price
          ({e.unpricedGrams} g of {e.totalIngredientGrams} g): <em>{e.missingIngredientPrices.join(', ')}</em>.
        </div>
      )}
      {e.missingLabour && <div>Hourly rate / labour minutes not set — labour counted as £0.</div>}
      {e.method && <div className="caption mt-2">{e.method}</div>}
      {price.pricesEstimated && (
        <div className="mt-2">
          Standard tier: firm floor <strong>{f(price.pricesFloor.standard)}</strong>,
          likely <strong>{f(price.pricesEstimated.standard)}</strong>
          {gap != null && <> — the estimate is about <strong>+{gap}%</strong> ({f(std[1] - std[0])}) above the floor.</>}
        </div>
      )}
      <div className="mt-2">Add the missing prices on the <strong>Ingredients</strong> page for a firm quote.</div>
    </div>
  );
}
