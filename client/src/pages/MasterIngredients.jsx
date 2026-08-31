import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { AuthCta, useAuth } from '../auth.jsx';
import { Err } from '../components.jsx';

const blankNew = { display_name: '', measurement_type: 'weight', category: 'other', aliases: '', density_g_per_cup: '', grams_per_unit_min: '', grams_per_unit_max: '', count_noun: '', price: '', price_unit: 'kg' };

export default function MasterIngredients() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState(['kg', 'litre', 'each']);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [priceDraft, setPriceDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankNew);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState(null);
  const { user } = useAuth();

  const load = () => api.get('/api/master-ingredients')
    .then((d) => { setItems(d.items); setUnits(d.priceUnits || units); setPriceDraft({}); })
    .catch(setError);
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
      <div className="panel">
        <h2>Ingredient catalogue <span className="sub">measurement + conversion data and a default price · {priced}/{items.length} priced · basis: Aldi</span></h2>
        <Err error={error} />
        {!user && (
          <AuthCta>The catalogue is shared. Sign in to edit prices so guests cannot overwrite them.</AuthCta>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="ghost sm" disabled={!user} onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : '+ New ingredient'}</button>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: '.85rem' }}>
            Prices default to Aldi. Recipes use these automatically; a per-recipe override never changes them unless you push it here.
          </span>
        </div>
        {adding && (
          <form onSubmit={addIngredient} className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ flex: 2 }}><label>Name</label><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required /></div>
            <div><label>Type</label>
              <select value={form.measurement_type} onChange={(e) => setForm({ ...form, measurement_type: e.target.value })}>
                <option value="weight">weight</option><option value="volume">volume</option><option value="count">count</option>
              </select>
            </div>
            <div><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div style={{ flex: 2 }}><label>Aliases (comma sep)</label><input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></div>
            {form.measurement_type === 'volume' && <div><label>g / cup</label><input type="number" value={form.density_g_per_cup} onChange={(e) => setForm({ ...form, density_g_per_cup: e.target.value })} /></div>}
            {form.measurement_type === 'count' && <>
              <div><label>g/unit min</label><input type="number" value={form.grams_per_unit_min} onChange={(e) => setForm({ ...form, grams_per_unit_min: e.target.value })} /></div>
              <div><label>g/unit max</label><input type="number" value={form.grams_per_unit_max} onChange={(e) => setForm({ ...form, grams_per_unit_max: e.target.value })} /></div>
              <div><label>count noun</label><input value={form.count_noun} onChange={(e) => setForm({ ...form, count_noun: e.target.value })} /></div>
            </>}
            <div><label>Price £</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label>per</label><select value={form.price_unit} onChange={(e) => setForm({ ...form, price_unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select></div>
            <div style={{ flex: '0 0 auto' }}><button type="submit">Add</button></div>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="table-wrap">
        <table>
          <thead><tr><th>Ingredient</th><th>Type</th><th>Conversion</th><th>Price</th><th>Basis</th><th /></tr></thead>
          <tbody>
            {shown.map((it) => {
              const d = priceDraft[it.key] || { price: it.price ?? '', priceUnit: it.priceUnit };
              const dirty = String(d.price) !== String(it.price ?? '') || d.priceUnit !== it.priceUnit;
              return (
                <tr key={it.key} className={it.price == null ? 'flagged' : ''}>
                  <td>{it.displayName}<div className="muted" style={{ fontSize: '.78rem' }}>{(it.aliases || []).slice(0, 4).join(', ')}</div></td>
                  <td>{it.measurementType}</td>
                  <td className="muted" style={{ fontSize: '.85rem' }}>{convInfo(it)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    £<input style={{ width: 66, padding: '3px 6px' }} type="number" step="0.01"
                      value={d.price} onChange={(e) => setPriceDraft({ ...priceDraft, [it.key]: { ...d, price: e.target.value } })} />
                    <select style={{ width: 72, padding: '3px 4px', marginLeft: 4 }}
                      value={d.priceUnit} onChange={(e) => setPriceDraft({ ...priceDraft, [it.key]: { ...d, priceUnit: e.target.value } })}>
                      {units.map((u) => <option key={u}>{u}</option>)}
                    </select>
                    {dirty && user && <button className="sm" style={{ marginLeft: 4 }} onClick={() => savePrice(it)}>Save</button>}
                  </td>
                  <td className="muted">{it.priceBasis}</td>
                  <td style={{ textAlign: 'right' }}>
                    {user && <button className="subtle sm" onClick={async () => { await api.del(`/api/master-ingredients/${it.key}`); load(); }}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="panel">
        <h3>Bulk price import <span className="sub">paste your Aldi list — one per line: <code>name, unit, price</code> (or <code>name, price</code>)</span></h3>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'plain flour, kg, 1.09\ncaster sugar, kg, 0.89\nlarge eggs, each, 0.22\nbutter, kg, 1.79'} style={{ minHeight: 120 }} />
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={runImport} disabled={!user || !importText.trim()}>Import prices</button>
          {importMsg && <span className="muted">{importMsg}</span>}
        </div>
      </div>
    </>
  );
}
