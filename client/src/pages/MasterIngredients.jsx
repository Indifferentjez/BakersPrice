import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Err, PageHeader, SkeletonRows } from '../components.jsx';
import { IconSearch } from '../icons.jsx';

const blankNew = { display_name: '', measurement_type: 'weight', category: 'other', aliases: '', density_g_per_cup: '', grams_per_unit_min: '', grams_per_unit_max: '', count_noun: '', price: '', price_unit: 'kg' };

export default function MasterIngredients() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState(['kg', 'litre', 'each']);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [priceDraft, setPriceDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankNew);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState(null);
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const load = () => {
    setLoading(true);
    return api.get('/api/master-ingredients')
      .then((d) => { setItems(d.items); setUnits(d.priceUnits || units); setPriceDraft({}); })
      .catch(setError)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return !s ? items : items.filter((it) => (it.displayName + ' ' + (it.aliases || []).join(' ')).toLowerCase().includes(s));
  }, [items, q]);

  const priced = items.filter((i) => i.price != null).length;

  const savePrice = async (it) => {
    const d = priceDraft[it.key];
    if (!d) return;
    setError(null);
    try {
      await api.put(`/api/master-ingredients/${it.key}`, { price: d.price === '' ? null : Number(d.price), priceUnit: d.priceUnit || it.priceUnit });
      load();
    } catch (e) { setError(e); }
  };

  const addIngredient = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/master-ingredients', {
        ...form,
        aliases: form.aliases.split(',').map((s) => s.trim()).filter(Boolean),
        density_g_per_cup: form.density_g_per_cup === '' ? null : Number(form.density_g_per_cup),
        grams_per_unit_min: form.grams_per_unit_min === '' ? null : Number(form.grams_per_unit_min),
        grams_per_unit_max: form.grams_per_unit_max === '' ? null : Number(form.grams_per_unit_max),
        price: form.price === '' ? null : Number(form.price),
      });
      setForm(blankNew); setAdding(false); load();
    } catch (e2) { setError(e2); }
  };

  const runImport = async () => {
    setError(null); setImportMsg(null);
    try {
      const r = await api.post('/api/master-ingredients/import', { text: importText });
      const bits = [`Updated ${r.updated.length}`];
      if (r.skipped?.length) bits.push(`skipped ${r.skipped.length} negative`);
      if (r.unmatched.length) bits.push(`unmatched: ${r.unmatched.join(', ')}`);
      setImportMsg(bits.join(' · '));
      setImportText(''); load();
    } catch (e) { setError(e); }
  };

  const convInfo = (it) => {
    if (it.measurementType === 'count') return `${it.gramsPerUnit ? `${it.gramsPerUnit[0]}–${it.gramsPerUnit[1]} g each` : 'count'}${it.countNoun ? ` · "${it.countNoun}"` : ''}`;
    if (it.gPerTsp) return `${it.gPerTsp[0]}–${it.gPerTsp[1]} g/tsp`;
    if (it.densityGPerCup != null) return `${it.densityGPerCup} g/cup`;
    return '—';
  };

  return (
    <>
      <PageHeader
        title="Ingredients"
        subtitle={`Catalogue prices, matched to recipes automatically · ${priced}/${items.length} priced · basis: Aldi`}
      />

      <Err error={error} />
      {!user && (
        <AuthCta>The catalogue is shared. Only the site admin can edit prices, so guests cannot overwrite them.</AuthCta>
      )}
      {user && !isAdmin && (
        <div className="infobox mb-3">Only the site admin can edit the shared catalogue. You can still read prices here.</div>
      )}

      <div className="panel">
        <div className="row-actions toolbar">
          <div className="search-wrap">
            <label htmlFor="ing-search">Search ingredients</label>
            <div className="search-field">
              <span className="search-field__icon">
                <IconSearch size={16} />
              </span>
              <input id="ing-search" placeholder="flour, eggs…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <button className="ghost" disabled={!isAdmin} onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : 'New ingredient'}</button>
        </div>
        <p className="caption mt-2">
          Prices default to Aldi. Recipes use these automatically; a per-recipe override never changes them unless you push it here.
        </p>

        {adding && (
          <form onSubmit={addIngredient} className="add-form mt-3">
            <div className="span-2"><label>Name</label><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required /></div>
            <div><label>Type</label>
              <select value={form.measurement_type} onChange={(e) => setForm({ ...form, measurement_type: e.target.value })}>
                <option value="weight">weight</option><option value="volume">volume</option><option value="count">count</option>
              </select>
            </div>
            <div><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div className="span-2"><label>Aliases (comma sep)</label><input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></div>
            {form.measurement_type === 'volume' && <div><label>g / cup</label><input type="number" value={form.density_g_per_cup} onChange={(e) => setForm({ ...form, density_g_per_cup: e.target.value })} /></div>}
            {form.measurement_type === 'count' && <>
              <div><label>g/unit min</label><input type="number" value={form.grams_per_unit_min} onChange={(e) => setForm({ ...form, grams_per_unit_min: e.target.value })} /></div>
              <div><label>g/unit max</label><input type="number" value={form.grams_per_unit_max} onChange={(e) => setForm({ ...form, grams_per_unit_max: e.target.value })} /></div>
              <div><label>count noun</label><input value={form.count_noun} onChange={(e) => setForm({ ...form, count_noun: e.target.value })} /></div>
            </>}
            <div><label>Price £</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label>per</label><select value={form.price_unit} onChange={(e) => setForm({ ...form, price_unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select></div>
            <div><button type="submit">Add</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        {loading && <SkeletonRows rows={6} />}
        {!loading && (
          <div className="table-wrap">
            <table className="table-stack">
              <thead><tr><th>Ingredient</th><th>Type</th><th>Conversion</th><th>Price</th><th>Basis</th><th /></tr></thead>
              <tbody>
                {shown.map((it) => {
                  const d = priceDraft[it.key] || { price: it.price ?? '', priceUnit: it.priceUnit };
                  const dirty = String(d.price) !== String(it.price ?? '') || d.priceUnit !== it.priceUnit;
                  return (
                    <tr key={it.key} className={it.price == null ? 'flagged' : ''}>
                      <td data-label="Ingredient">
                        <span>
                          {it.displayName}
                          <span className="caption d-block">{(it.aliases || []).slice(0, 4).join(', ')}</span>
                        </span>
                      </td>
                      <td data-label="Type">{it.measurementType}</td>
                      <td data-label="Conversion" className="muted caption">{convInfo(it)}</td>
                      <td data-label="Price">
                        <div className="cell-inline">
                          £<input type="number" step="0.01"
                            value={d.price} onChange={(e) => setPriceDraft({ ...priceDraft, [it.key]: { ...d, price: e.target.value } })} />
                          <select value={d.priceUnit} onChange={(e) => setPriceDraft({ ...priceDraft, [it.key]: { ...d, priceUnit: e.target.value } })}>
                            {units.map((u) => <option key={u}>{u}</option>)}
                          </select>
                          {dirty && isAdmin && <button className="sm" onClick={() => savePrice(it)}>Save</button>}
                        </div>
                      </td>
                      <td data-label="Basis" className="muted">{it.priceBasis}</td>
                      <td data-label="">
                        {isAdmin && <button className="danger sm" onClick={async () => { if (!confirm(`Delete ${it.displayName} from the catalogue?`)) return; await api.del(`/api/master-ingredients/${it.key}`); load(); }}>Delete</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Bulk price import <span className="sub">paste your Aldi list — one per line: <code>name, unit, price</code> (or <code>name, price</code>)</span></h3>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'plain flour, kg, 1.09\ncaster sugar, kg, 0.89\nlarge eggs, each, 0.22\nbutter, kg, 1.79'} className="import-textarea" />
        <div className="row-actions mt-2">
          <button onClick={runImport} disabled={!isAdmin || !importText.trim()}>Import prices</button>
          {importMsg && <span className="muted">{importMsg}</span>}
        </div>
      </div>
    </>
  );
}
