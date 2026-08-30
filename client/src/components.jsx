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

import { Fragment } from 'react';

export function RatioBars({ ratios }) {
  const keys = ['fat', 'sugar', 'egg', 'liquid', 'cocoa'];
  const max = Math.max(150, ...keys.map((k) => ratios?.[k] || 0));
  return (
    <div className="ratiobars">
      {keys.map((k) => (
        <Fragment key={k}>
          <div style={{ textTransform: 'capitalize' }}>{k} : base</div>
          <div className="track">
            <div className="fill" style={{ width: `${Math.min(100, ((ratios?.[k] || 0) / max) * 100)}%` }} />
          </div>
          <div style={{ textAlign: 'right' }}>{ratios?.[k] ?? 0}%</div>
        </Fragment>
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
  return <div className="errbox">{typeof error === 'string' ? error : error.message}</div>;
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
    <div className="warnbox" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        ⚠ This is an ESTIMATE, not a firm price <span className="badge REQUIRES_TESTING" style={{ marginLeft: 6 }}>{e.accuracy?.replace('_', ' ')}</span>
      </div>
      {e.missingIngredientPrices?.length > 0 && (
        <div>
          {e.unpricedWeightPct}% of the ingredient weight has no saved price
          ({e.unpricedGrams} g of {e.totalIngredientGrams} g): <em>{e.missingIngredientPrices.join(', ')}</em>.
        </div>
      )}
      {e.missingLabour && <div>Hourly rate / labour minutes not set — labour counted as £0.</div>}
      {e.method && <div className="muted" style={{ fontSize: '.85rem', marginTop: 2 }}>{e.method}</div>}
      {price.pricesEstimated && (
        <div style={{ marginTop: 6 }}>
          Standard tier: firm floor <strong>{f(price.pricesFloor.standard)}</strong>,
          likely <strong>{f(price.pricesEstimated.standard)}</strong>
          {gap != null && <> — the estimate is about <strong>+{gap}%</strong> ({f(std[1] - std[0])}) above the floor.</>}
        </div>
      )}
      <div style={{ marginTop: 4 }}>Add the missing prices on the <strong>Price list</strong> page for a firm quote.</div>
    </div>
  );
}
