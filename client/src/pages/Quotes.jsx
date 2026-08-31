import { useEffect, useState } from 'react';
import { api, isUnauthenticated } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Money, Err } from '../components.jsx';

export default function Quotes() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const { user, loading } = useAuth();

  const load = () => api.get('/api/quotes').then(setRows).catch((err) => {
    if (isUnauthenticated(err)) { setRows([]); setError(null); return; }
    setError(err);
  });

  useEffect(() => {
    if (loading) return;
    if (!user) { setRows([]); setError(null); return; }
    load();
  }, [user, loading]);

  return (
    <div className="panel">
      <h2>Saved quotes</h2>
      {!loading && !user && (
        <AuthCta>Sign in to see quotes saved to your account.</AuthCta>
      )}
      <Err error={error} />
      {rows.length === 0 && <p className="muted">{user ? 'No quotes yet — build one at the end of a recipe.' : 'No quotes to show until you log in.'}</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Cake</th><th>Mode</th><th>Tier</th><th>Price</th><th>Created</th><th /></tr></thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td>{q.cake_name}</td>
                <td>{q.mode}{q.is_estimate ? <span className="badge REQUIRES_TESTING" style={{ marginLeft: 6 }}>estimate</span> : ''}</td>
                <td>{q.tier || '—'}</td>
                <td>{q.price != null ? <><Money amount={q.price} />{q.is_estimate && q.price_floor != null ? <span className="muted"> (floor <Money amount={q.price_floor} />)</span> : null}</> : '—'}</td>
                <td className="muted">{q.created_at?.slice(0, 10)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <a href={`/q/${q.id}`} target="_blank" rel="noreferrer">Customer page</a>{' · '}
                  <a href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>{' · '}
                  <button className="subtle sm" onClick={async () => { await api.del(`/api/quotes/${q.id}`); load(); }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
