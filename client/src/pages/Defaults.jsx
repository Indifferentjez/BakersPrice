import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Err, PageHeader, SkeletonRows } from '../components.jsx';

const GROUPS = [
  ['Business', [
    ['business_name', 'Business name', 'text', 'Shown on customer documents'],
  ]],
  ['Labour', [
    ['hourly_rate', 'Hourly labour rate (£)', 'number', 'Asked, never assumed — set this before pricing'],
    ['labour_minutes', 'Typical minutes per bake', 'number', 'Remembered default, editable per bake'],
  ]],
  ['Bake costs', [
    ['energy_cost', 'Energy per bake (£)', 'number', 'Flat per bake — not scaled by size'],
    ['packaging_cost', 'Packaging per bake (£)', 'number', 'Flat per bake — not scaled by size'],
    ['overhead_pct', 'Overhead (%)', 'number', 'Added to total cost before margin'],
  ]],
  ['Margins', [
    ['margin_min_pct', 'Minimum margin (%)', 'number', 'Default 28'],
    ['margin_std_pct', 'Standard margin (%)', 'number', 'Default 50'],
    ['margin_premium_pct', 'Premium margin (%)', 'number', 'Default 65'],
  ]],
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

  return (
    <>
      <PageHeader
        title="Cost defaults"
        subtitle={user ? 'Every bake starts from these — override per bake' : 'Starting values — sign in to save your own'}
      />

      {!user && <AuthCta>Sign in to save cost defaults to your account.</AuthCta>}
      <Err error={error} />

      {!d && <div className="panel"><SkeletonRows rows={6} /></div>}

      {d && (
        <form className="panel" onSubmit={save}>
          {d.needsHourlyRate && (
            <div className="warnbox mb-3">
              No hourly rate set yet. Prices can’t be finalised until you enter one.
            </div>
          )}

          {GROUPS.map(([heading, fields]) => (
            <section key={heading} className="section-block">
              <h3 className="section-label">{heading}</h3>
              <div className="grid2">
                {fields.map(([key, label, type, hint]) => (
                  <div key={key}>
                    <label htmlFor={`d-${key}`}>{label}</label>
                    <input
                      id={`d-${key}`}
                      type={type}
                      step={type === 'number' ? '0.01' : undefined}
                      value={d[key] ?? ''}
                      onChange={(e) => setD({ ...d, [key]: e.target.value === '' ? null : e.target.value })}
                    />
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="form-footer">
            <button type="submit" disabled={!user}>{user ? 'Save defaults' : 'Sign in to save'}</button>
            {saved && <span className="pill">Saved</span>}
          </div>
        </form>
      )}
    </>
  );
}
