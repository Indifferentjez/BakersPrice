import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Err } from '../components.jsx';

export default function RecipeList() {
  const [recipes, setRecipes] = useState([]);
  const [llm, setLlm] = useState(true);
  const [error, setError] = useState(null);
  const nav = useNavigate();

  const load = () => api.get('/api/recipes').then(setRecipes).catch(setError);
  useEffect(() => {
    load();
    api.get('/api/parse/status').then((s) => setLlm(s.available)).catch(() => setLlm(false));
  }, []);

  const remove = async (id) => {
    if (!confirm('Delete this recipe and its calibrations?')) return;
    await api.del(`/api/recipes/${id}`);
    load();
  };

  return (
    <>
      <div className="panel">
        <h2>Recipes</h2>
        {!llm && (
          <div className="warnbox" style={{ marginBottom: 12 }}>
            Photo / PDF / paste auto-parsing is off (no <code>ANTHROPIC_API_KEY</code> set on the server).
            You can still enter recipes by hand — everything else works.
          </div>
        )}
        <Err error={error} />
        <button onClick={() => nav('/new')}>+ New recipe</button>
      </div>

      <div className="panel">
        {recipes.length === 0 && <p className="muted">No recipes yet.</p>}
        {recipes.length > 0 && (
          <table>
            <thead>
              <tr><th>Name</th><th>Detected type</th><th>Calibration</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id}>
                  <td><a onClick={() => nav(`/recipe/${r.id}`)} style={{ cursor: 'pointer' }}>{r.name}</a></td>
                  <td>{r.type_override || r.detected_type || '—'}{r.type_override && <span className="muted"> (override)</span>}</td>
                  <td>{r.default_k_per_ml ? `${r.default_k_per_ml.toFixed(3)} g/mL` : <span className="muted">generic</span>}</td>
                  <td className="muted">{r.updated_at?.slice(0, 10)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="subtle sm" onClick={() => remove(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
