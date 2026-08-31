import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Err } from '../components.jsx';

const FIELDS = [
  ['business_name', 'Business name', 'text', 'Shown on customer documents'],
  ['hourly_rate', 'Hourly labour rate (£)', 'number', 'Asked, never assumed — set this before pricing'],
  ['labour_minutes', 'Typical minutes per bake', 'number', 'Remembered default, editable per bake'],
  ['energy_cost', 'Energy per bake (£)', 'number', 'Flat per bake — not scaled by size'],
  ['packaging_cost', 'Packaging per bake (£)', 'number', 'Flat per bake — not scaled by size'],
  ['overhead_pct', 'Overhead (%)', 'number', 'Added to total cost before margin'],
  ['margin_min_pct', 'Minimum margin (%)', 'number', 'Default 28'],
  ['margin_std_pct', 'Standard margin (%)', 'number', 'Default 50'],
  ['margin_premium_pct', 'Premium margin (%)', 'number', 'Default 65'],
];

export default function Defaults() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const { user } = useAuth();

  useEffect(() => { api.get('/api/defaults').then(setD).catch(setError); }, []);

  const save = async (e) => {
    e.preventDefault();
    setError(null); setSaved(false);
    try { const r = await api.put('/api/defaults', d); setD(r); setSaved(true); }
    catch (err) { setError(err); }
  };

  if (!d) return <div className="panel"><Err error={error} />Loading…</div>;

  return (
    <form className="panel" onSubmit={save}>
      <h2>Cost defaults <span className="sub">{user ? 'yours — every bake starts from these, override per bake' : 'starting values — sign in to save your own'}</span></h2>
      {!user && <AuthCta>Sign in to save cost defaults to your account.</AuthCta>}
      <Err error={error} />
      {d.needsHourlyRate && (
        <div className="warnbox" style={{ marginBottom: 14 }}>
          No hourly rate set yet. Prices can’t be finalised until you enter one.
        </div>
      )}
      <div className="grid2">
        {FIELDS.map(([key, label, type, hint]) => (
          <div key={key}>
            <label>{label}</label>
            <input
              type={type}
              step={type === 'number' ? '0.01' : undefined}
              value={d[key] ?? ''}
              onChange={(e) => setD({ ...d, [key]: e.target.value === '' ? null : (type === 'number' ? e.target.value : e.target.value) })}
            />
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="submit" disabled={!user}>{user ? 'Save defaults' : 'Sign in to save'}</button>
        {saved && <span className="pill" style={{ marginLeft: 10 }}>Saved</span>}
      </div>
    </form>
  );
}
