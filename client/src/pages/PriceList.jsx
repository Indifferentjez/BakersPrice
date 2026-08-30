import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Err } from '../components.jsx';

const blank = { name: '', unit: 'kg', price: '', note: '' };

export default function PriceList() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState(['kg', 'litre', 'egg']);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.get('/api/ingredients').then((d) => { setItems(d.items); setUnits(d.units); }).catch(setError);
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) await api.put(`/api/ingredients/${editing}`, form);
      else await api.post('/api/ingredients', form);
      setForm(blank); setEditing(null); load();
    } catch (err) { setError(err); }
  };

  const edit = (it) => { setEditing(it.id); setForm({ name: it.name, unit: it.unit, price: it.price, note: it.note || '' }); };
  const remove = async (id) => { await api.del(`/api/ingredients/${id}`); if (editing === id) { setForm(blank); setEditing(null); } load(); };

  return (
    <>
      <div className="panel">
        <h2>Ingredient price list <span className="sub">reused across every recipe · £ per unit as you buy it</span></h2>
        <Err error={error} />
        <form onSubmit={submit} className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Ingredient</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. unsalted butter" required />
          </div>
          <div>
            <label>Priced per</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label>Price (£)</label>
            <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          </div>
          <div style={{ flex: 2 }}>
            <label>Note (optional)</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="brand, shop..." />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button type="submit">{editing ? 'Save' : 'Add'}</button>
            {editing && <button type="button" className="subtle" style={{ marginLeft: 6 }} onClick={() => { setForm(blank); setEditing(null); }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="panel">
        {items.length === 0 && <p className="muted">No prices yet. Add the ingredients you buy regularly.</p>}
        {items.length > 0 && (
          <table>
            <thead><tr><th>Ingredient</th><th>As entered</th><th>Per gram</th><th>Per egg</th><th>Note</th><th /></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}</td>
                  <td>£{Number(it.price).toFixed(2)} / {it.unit}</td>
                  <td>{it.price_per_g != null ? `£${it.price_per_g.toFixed(5)}` : '—'}</td>
                  <td>{it.price_per_egg != null ? `£${it.price_per_egg.toFixed(3)}` : '—'}</td>
                  <td className="muted">{it.note || ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="ghost sm" onClick={() => edit(it)}>Edit</button>{' '}
                    <button className="subtle sm" onClick={() => remove(it.id)}>Delete</button>
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
