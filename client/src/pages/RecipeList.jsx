import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isUnauthenticated } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Err, PageHeader, EmptyState, SkeletonRows } from '../components.jsx';
import { IconFile, IconPlus } from '../icons.jsx';

export default function RecipeList() {
  const [recipes, setRecipes] = useState([]);
  const [llm, setLlm] = useState(true);
  const [error, setError] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const nav = useNavigate();
  const { user, loading } = useAuth();

  const load = () => {
    setListLoading(true);
    return api.get('/api/recipes').then(setRecipes).catch((err) => {
      if (isUnauthenticated(err)) { setRecipes([]); setError(null); return; }
      setError(err);
    }).finally(() => setListLoading(false));
  };

  useEffect(() => {
    api.get('/api/parse/status').then((s) => setLlm(s.available)).catch(() => setLlm(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { setRecipes([]); setError(null); setListLoading(false); return; }
    load();
  }, [user, loading]);

  const remove = async (id) => {
    if (!confirm('Delete this recipe and its calibrations?')) return;
    await api.del(`/api/recipes/${id}`);
    load();
  };

  const newRecipeBtn = (
    <button onClick={() => nav('/new')}><IconPlus size={16} /> New recipe</button>
  );

  return (
    <>
      <PageHeader
        title="Recipes"
        subtitle="Your cakes, ready to scale and quote"
        action={newRecipeBtn}
      />

      {!llm && (
        <div className="infobox mb-3">
          Photo / PDF / paste auto-parsing is off (no <code>ANTHROPIC_API_KEY</code> on the server).
          You can still enter recipes by hand — everything else works.
        </div>
      )}
      {!loading && !user && (
        <AuthCta>Sign in to see recipes saved to your account. You can still start a new recipe without an account.</AuthCta>
      )}
      <Err error={error} />

      <div className="panel">
        {(loading || listLoading) && user && <SkeletonRows rows={4} />}

        {!listLoading && !loading && recipes.length === 0 && (
          <EmptyState
            icon={<IconFile size={28} />}
            title={user ? 'No recipes yet' : 'Nothing saved yet'}
            action={newRecipeBtn}
          >
            {user
              ? 'Add your first recipe to scale it to any tin and build a customer quote.'
              : 'Log in to keep recipes on your account — or start a new one now without saving.'}
          </EmptyState>
        )}

        {!listLoading && recipes.length > 0 && (
          <div className="table-wrap">
            <table className="table-stack">
              <thead>
                <tr><th>Name</th><th>Detected type</th><th>Calibration</th><th>Updated</th><th /></tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Name"><a className="linkish" onClick={() => nav(`/recipe/${r.id}`)}>{r.name}</a></td>
                    <td data-label="Detected type">{r.type_override || r.detected_type || '—'}{r.type_override && <span className="muted"> (override)</span>}</td>
                    <td data-label="Calibration">{r.default_k_per_ml ? `${r.default_k_per_ml.toFixed(3)} g/mL` : <span className="muted">generic</span>}</td>
                    <td data-label="Updated" className="muted">{r.updated_at?.slice(0, 10)}</td>
                    <td data-label="">
                      <button className="danger sm" onClick={() => remove(r.id)}>Delete</button>
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
