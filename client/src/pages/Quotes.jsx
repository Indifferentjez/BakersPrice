import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isUnauthenticated } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Money, Err, PageHeader, EmptyState, SkeletonRows } from '../components.jsx';
import { IconReceipt } from '../icons.jsx';

export default function Quotes() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const { user, loading } = useAuth();

  const load = () => {
    setListLoading(true);
    return api.get('/api/quotes').then(setRows).catch((err) => {
      if (isUnauthenticated(err)) { setRows([]); setError(null); return; }
      setError(err);
    }).finally(() => setListLoading(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { setRows([]); setError(null); setListLoading(false); return; }
    load();
  }, [user, loading]);

  return (
    <>
      <PageHeader title="Saved quotes" subtitle="Every quote and price list you've built for a customer" />

      {!loading && !user && <AuthCta>Sign in to see quotes saved to your account.</AuthCta>}
      <Err error={error} />

      <div className="panel">
        {(loading || listLoading) && user && <SkeletonRows rows={4} />}

        {!listLoading && !loading && rows.length === 0 && (
          <EmptyState
            icon={<IconReceipt size={28} />}
            title="No quotes yet"
            action={<Link className="btn ghost" to="/">Go to recipes</Link>}
          >
            Finish a recipe through to the Breakdown step, then build your first customer quote.
          </EmptyState>
        )}

        {!listLoading && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table-stack">
              <thead><tr><th>Cake</th><th>Mode</th><th>Tier</th><th>Price</th><th>Created</th><th /></tr></thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Cake">{q.cake_name}</td>
                    <td data-label="Mode">{q.mode}{q.is_estimate ? <span className="badge REQUIRES_TESTING est-tag-inline">estimate</span> : ''}</td>
                    <td data-label="Tier">{q.tier || '—'}</td>
                    <td data-label="Price">{q.price != null ? <><Money amount={q.price} />{q.is_estimate && q.price_floor != null ? <span className="muted"> (floor <Money amount={q.price_floor} />)</span> : null}</> : '—'}</td>
                    <td data-label="Created" className="muted">{q.created_at?.slice(0, 10)}</td>
                    <td data-label="">
                      <div className="row-actions end">
                        <a className="btn ghost sm" href={`/q/${q.id}`} target="_blank" rel="noreferrer">Customer page</a>
                        <a className="btn ghost sm" href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                        <button className="btn danger sm" onClick={async () => { if (!confirm('Delete this quote?')) return; await api.del(`/api/quotes/${q.id}`); load(); }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
