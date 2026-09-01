import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, isUnauthenticated } from '../api.js';
import { AuthCta, loginPath, useAuth } from '../auth.jsx';
import { Badge, Range, Money, RatioBars, Checks, Err, EstimateBanner } from '../components.jsx';
import { IconClose, IconPlus } from '../icons.jsx';

const STEPS = [
  ['upload', 'Recipe'],
  ['confirm', 'Confirm weights'],
  ['classify', 'Cake type'],
  ['pan', 'Pan & cost'],
  ['result', 'Breakdown'],
  ['quote', 'Customer quote'],
];

const emptyBake = {
  labourMinutes: '', hourlyRate: '', energyCost: '', packagingCost: '',
  overheadPct: '', marginMinPct: '', marginStdPct: '', marginPremiumPct: '',
};

const DRAFT_KEY = 'bp_wizard_draft';
const RETRY_SAVE_KEY = 'bp_retry_save';

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); }
  catch { return null; }
}
function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
  sessionStorage.removeItem(RETRY_SAVE_KEY);
}

export default function Wizard() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const restored = useRef(false);

  const [step, setStep] = useState('upload');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [recipeId, setRecipeId] = useState(id || null);
  const [name, setName] = useState('');
  const [allergens, setAllergens] = useState('');
  const [notes, setNotes] = useState('');
  const [rawKind, setRawKind] = useState('manual');
  const [rawInput, setRawInput] = useState('');

  const [rows, setRows] = useState([]);            // [{name,quantity,unit,notes,grams?}]
  const [resolved, setResolved] = useState(null);  // {master,classification,unresolved,totalMasterGrams}
  const [typeOverride, setTypeOverride] = useState('');
  const [meta, setMeta] = useState({ cakeTypes: [], panShapes: [], units: ['in', 'cm'] });
  const [calibrations, setCalibrations] = useState([]);

  const [pan, setPan] = useState({ shape: 'round', unit: 'in', diameter: '', side: '', length: '', width: '', depth: '', deep: false });
  const [useCalibration, setUseCalibration] = useState(true);
  const [fillOverride, setFillOverride] = useState('');
  const [bake, setBake] = useState(emptyBake);
  const [defaults, setDefaults] = useState(null);

  const [calc, setCalc] = useState(null);
  const [ingredientOverrides, setIngredientOverrides] = useState({});
  const [menuItems, setMenuItems] = useState([]);
  const [quote, setQuote] = useState(null);
  const [llm, setLlm] = useState(true);

  const persistDraft = () => {
    if (id) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      step, name, allergens, notes, rawKind, rawInput, rows, typeOverride,
      ingredientOverrides, pan, bake, fillOverride, useCalibration, resolved,
    }));
  };

  const goLoginToSave = () => {
    persistDraft();
    sessionStorage.setItem(RETRY_SAVE_KEY, '1');
    nav(loginPath('/new'));
  };

  // ---- load meta + defaults + existing recipe ----
  useEffect(() => {
    api.get('/api/calc/meta').then(setMeta).catch(() => {});
    api.get('/api/parse/status').then((s) => setLlm(s.available)).catch(() => setLlm(false));
    api.get('/api/defaults').then((d) => {
      setDefaults(d);
      setBake((b) => ({
        ...b,
        labourMinutes: d.labour_minutes ?? '',
        hourlyRate: d.hourly_rate ?? '',
        energyCost: d.energy_cost ?? '',
        packagingCost: d.packaging_cost ?? '',
        overheadPct: d.overhead_pct ?? '',
        marginMinPct: d.margin_min_pct ?? '',
        marginStdPct: d.margin_std_pct ?? '',
        marginPremiumPct: d.margin_premium_pct ?? '',
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setBusy(true);
    api.get(`/api/recipes/${id}`).then((r) => {
      setRecipeId(r.id);
      setName(r.name || '');
      setAllergens(r.allergens || '');
      setNotes(r.notes || '');
      setRawKind(r.raw_kind || 'manual');
      setRawInput(r.raw_input || '');
      setRows((r.parsed && r.parsed.length ? r.parsed : r.master).map(norm));
      setTypeOverride(r.type_override || '');
      setIngredientOverrides(r.ingredientOverrides || {});
      setCalibrations(r.calibrations || []);
      return api.post('/api/parse/resolve', { ingredients: (r.parsed && r.parsed.length ? r.parsed : r.master) });
    }).then((res) => { setResolved(res); setStep('confirm'); })
      .catch((err) => {
        if (isUnauthenticated(err)) nav(loginPath(`/recipe/${id}`));
        else setError(err);
      }).finally(() => setBusy(false));
  }, [id]);

  useEffect(() => {
    if (id || restored.current) return;
    const draft = loadDraft();
    if (!draft) return;
    restored.current = true;
    setStep(draft.step && draft.step !== 'result' && draft.step !== 'quote' ? draft.step : (draft.resolved ? 'pan' : 'confirm'));
    setName(draft.name || '');
    setAllergens(draft.allergens || '');
    setNotes(draft.notes || '');
    setRawKind(draft.rawKind || 'manual');
    setRawInput(draft.rawInput || '');
    setRows(Array.isArray(draft.rows) ? draft.rows : []);
    setTypeOverride(draft.typeOverride || '');
    setIngredientOverrides(draft.ingredientOverrides || {});
    if (draft.pan) setPan(draft.pan);
    if (draft.bake) setBake(draft.bake);
    if (draft.fillOverride != null) setFillOverride(draft.fillOverride);
    if (draft.useCalibration != null) setUseCalibration(draft.useCalibration);
    if (draft.resolved) setResolved(draft.resolved);
  }, [id]);

  useEffect(() => {
    if (id) return;
    if (step === 'upload' && !rows.length) return;
    persistDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, name, allergens, notes, rawKind, rawInput, rows, typeOverride, ingredientOverrides, pan, bake, fillOverride, useCalibration, resolved]);

  useEffect(() => {
    if (id || !user || !restored.current) return;
    if (sessionStorage.getItem(RETRY_SAVE_KEY) !== '1') return;
    sessionStorage.removeItem(RETRY_SAVE_KEY);
    const t = setTimeout(() => { saveRecipe().catch(() => {}); }, 0);
    return () => clearTimeout(t);
    // saveRecipe is defined below; retry once after draft restore + login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const stepIndex = STEPS.findIndex((s) => s[0] === step);
  const go = (s) => { setError(null); setStep(s); };

  // ================= UPLOAD =================
  const doParseText = async () => {
    setBusy(true); setError(null);
    try {
      const d = await api.post('/api/parse', { text: rawInput });
      setRows((d.parsed.ingredients || []).map(norm));
      setName((n) => n || d.parsed.name || '');
      setNotes((x) => x || d.parsed.notes || '');
      setRawKind('text');
      setResolved(d.preview ? { master: d.preview.master, classification: d.preview.classification, unresolved: d.preview.unresolved, totalMasterGrams: d.preview.totalMasterGrams } : null);
      go('confirm');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const doParseFile = async (file) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const d = await api.parseFile(file);
      setRows((d.parsed.ingredients || []).map(norm));
      setName((n) => n || d.parsed.name || file.name.replace(/\.[^.]+$/, ''));
      setNotes((x) => x || d.parsed.notes || '');
      setRawKind(d.kind);
      setResolved(d.preview ? { master: d.preview.master, classification: d.preview.classification, unresolved: d.preview.unresolved, totalMasterGrams: d.preview.totalMasterGrams } : null);
      go('confirm');
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const startManual = () => {
    if (rows.length === 0) setRows([blankRow(), blankRow(), blankRow()]);
    setRawKind('manual');
    go('confirm');
  };

  // ================= CONFIRM =================
  const recheck = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.post('/api/parse/resolve', { ingredients: rows.map(clean) });
      setResolved(res);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const saveRecipe = async () => {
    setBusy(true); setError(null);
    try {
      const payload = {
        name: name || 'Untitled recipe',
        allergens, notes, raw_kind: rawKind, raw_input: rawInput || null,
        parsed: rows.map(clean),
        type_override: typeOverride || null,
      };
      const r = recipeId
        ? await api.put(`/api/recipes/${recipeId}`, payload)
        : await api.post('/api/recipes', payload);
      setRecipeId(r.id);
      setResolved({ master: r.master, classification: r.classification, unresolved: [], totalMasterGrams: r.master.reduce((a, x) => a + (x.grams || 0), 0) });
      setCalibrations(r.calibrations || []);
      if (!recipeId) {
        window.history.replaceState(null, '', `/recipe/${r.id}`);
        clearDraft();
      }
      return r;
    } catch (err) {
      if (isUnauthenticated(err)) {
        goLoginToSave();
        return null;
      }
      setError(err);
      throw err;
    } finally { setBusy(false); }
  };

  // ================= CLASSIFY =================
  const saveTypeOverride = async (val) => {
    setTypeOverride(val);
    if (recipeId) {
      await api.put(`/api/recipes/${recipeId}`, { onlyTypeOverride: true, type_override: val || null }).catch(setError);
    }
  };

  // ================= PAN / CALC =================
  const calcBody = (rid, ovr) => {
    const body = {
      pan: cleanPan(pan),
      cakeTypeKey: typeOverride || resolved?.classification?.detected || undefined,
      useCalibration,
      fillPctOverride: fillOverride ? Number(fillOverride) : null,
      bake: numBake(bake),
      ingredientOverrides: ovr ?? ingredientOverrides,
    };
    if (rid) body.recipeId = rid;
    else if (resolved?.master?.length) body.master = resolved.master;
    return body;
  };

  const runCalc = async () => {
    setBusy(true); setError(null);
    try {
      let rid = recipeId;
      if (!rid && user) {
        const r = await saveRecipe();
        rid = r?.id || null;
      }
      const d = await api.post('/api/calc', calcBody(rid));
      setCalc(d);
      go('result');
    } catch (err) {
      if (isUnauthenticated(err)) goLoginToSave();
      else setError(err);
    } finally { setBusy(false); }
  };

  // re-price with a changed set of per-recipe ingredient overrides (from the pricing panel)
  const recalcWithOverrides = async (ovr) => {
    setIngredientOverrides(ovr);
    setBusy(true); setError(null);
    try {
      const d = await api.post('/api/calc', calcBody(recipeId, ovr));
      setCalc(d);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const saveOverridesToRecipe = async (ovr) => {
    if (!recipeId) return;
    await api.put(`/api/recipes/${recipeId}`, { onlyTypeOverride: false, ingredientOverrides: ovr, parsed: rows.map(clean), name, allergens, notes, type_override: typeOverride || null }).catch(setError);
  };

  const value = { step, stepIndex };

  const currentStepLabel = STEPS[stepIndex] ? `${stepIndex + 1}. ${STEPS[stepIndex][1]}` : '';

  return (
    <>
      <div className="steps">
        {STEPS.map(([key, label], i) => (
          <button
            key={key}
            className={key === step ? 'active' : (i < stepIndex ? 'done' : '')}
            onClick={() => { if (i <= stepIndex || (key === 'confirm' && rows.length)) go(key); }}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <div className="step-current">{currentStepLabel}</div>
      <Err error={error} />
      {busy && <div className="progressbar" role="status" aria-label="Working" />}

      {step === 'upload' && (
        <UploadStep {...{ llm, rawInput, setRawInput, doParseText, doParseFile, startManual, busy }} />
      )}

      {step === 'confirm' && (
        <ConfirmStep {...{
          rows, setRows, resolved, recheck, name, setName, allergens, setAllergens,
          notes, setNotes, saveRecipe, recipeId, busy, user, goLoginToSave,
          onNext: () => go('classify'),
        }} />
      )}

      {step === 'classify' && resolved && (
        <ClassifyStep {...{
          classification: resolved.classification, meta, typeOverride,
          onOverride: saveTypeOverride, onNext: () => go('pan'),
        }} />
      )}

      {step === 'pan' && (
        <PanStep {...{
          meta, pan, setPan, useCalibration, setUseCalibration, calibrations, setCalibrations,
          recipeId, fillOverride, setFillOverride, bake, setBake, defaults, runCalc, busy,
        }} />
      )}

      {step === 'result' && calc && (
        <ResultStep {...{
          calc, onQuote: () => go('quote'), onBack: () => go('pan'),
          menuItems, setMenuItems, pan,
          ingredientOverrides, recalcWithOverrides, saveOverridesToRecipe, busy,
        }} />
      )}

      {step === 'quote' && calc && (
        <QuoteStep {...{
          calc, name, allergens, defaults, menuItems, setMenuItems, quote, setQuote,
          user, goLoginToSave,
          onDone: () => nav('/quotes'),
        }} />
      )}
    </>
  );
}

// -------------------- helpers --------------------
function blankRow() { return { name: '', quantity: '', unit: '', notes: '' }; }
function norm(r) {
  return {
    name: r.name || '',
    quantity: r.quantity ?? r.qty ?? '',
    unit: r.unit ?? '',
    notes: r.notes ?? r.note ?? '',
    grams: r.grams ?? '',
  };
}
function clean(r) {
  // send the quantity as the RAW string — the server's parseQty is the only
  // parser (handles "1 1/2", "½", "2-3"). A baker-typed gram value is an override.
  const o = {
    name: (r.name || '').trim(),
    quantity: r.quantity === '' || r.quantity == null ? null : String(r.quantity).trim(),
    unit: r.unit || null,
    notes: r.notes || null,
  };
  if (r.grams !== '' && r.grams != null) o.grams = Number(r.grams);
  return o;
}
function cleanPan(p) {
  const o = { shape: p.shape, unit: p.unit, deep: !!p.deep };
  for (const k of ['diameter', 'side', 'length', 'width', 'depth']) if (p[k] !== '' && p[k] != null) o[k] = Number(p[k]);
  return o;
}
function numBake(b) {
  const o = {};
  for (const [k, v] of Object.entries(b)) o[k] = (v === '' || v == null) ? null : Number(v);
  return o;
}

// ==================== STEP COMPONENTS ====================

function UploadStep({ llm, rawInput, setRawInput, doParseText, doParseFile, startManual, busy }) {
  return (
    <div className="panel stack">
      <h2>Add a recipe</h2>
      {!llm && <div className="warnbox">Auto-parsing is off (no API key on the server). Use “Enter manually”.</div>}
      <div className="grid2">
        <div className="stack">
          <label>Paste the recipe (any format — grams, cups, mixed)</label>
          <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder={'2 cups plain flour\n200g caster sugar\n3 large eggs\n...'} style={{ minHeight: 220 }} />
          <button disabled={!llm || busy || !rawInput.trim()} onClick={doParseText}>Parse pasted text</button>
        </div>
        <div className="stack">
          <label>…or upload a photo / PDF of the recipe card</label>
          <input type="file" accept="image/*,application/pdf" disabled={!llm || busy} onChange={(e) => doParseFile(e.target.files[0])} />
          <p className="muted" style={{ fontSize: '.85rem' }}>
            The image or PDF is sent to the Claude API for transcription. You confirm every row before anything is used.
          </p>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
          <button className="ghost" onClick={startManual}>Enter manually instead</button>
        </div>
      </div>
    </div>
  );
}

function gramsApprox(g) { return g == null ? '' : (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`); }

function MeasuredCell({ info }) {
  if (!info) return <span className="muted">…</span>;
  if (info.grams == null) return <span style={{ color: 'var(--fail)' }}>{info.note || 'needs a weight'}</span>;
  const est = info.gramsRange
    ? `${Math.round(info.gramsRange.min)}–${Math.round(info.gramsRange.max)} g`
    : `~${gramsApprox(info.grams)}`;
  if (info.measurementType === 'count' && info.count != null) {
    return (
      <>
        <strong>{info.count} {info.countNoun || 'x'}{info.count === 1 ? '' : 's'}</strong>
        <span className="muted"> · {info.gramsSource === 'manual' ? `weight set to ${gramsApprox(info.grams)}` : `≈ ${est} est.`}</span>
      </>
    );
  }
  if (info.gramsSource === 'given-weight') return <><strong>{gramsApprox(info.grams)}</strong> <span className="muted">· as written</span></>;
  if (info.gramsSource === 'manual') return <><strong>{gramsApprox(info.grams)}</strong> <span className="muted">· your weight</span></>;
  return <><span className="muted">{info.quantity} {info.unit} → </span><strong>{gramsApprox(info.grams)}</strong></>;
}

function ConfirmStep({ rows, setRows, resolved, recheck, name, setName, allergens, setAllergens, notes, setNotes, saveRecipe, recipeId, busy, onNext, user, goLoginToSave }) {
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => setRows([...rows, blankRow()]);
  const del = (i) => setRows(rows.filter((_, j) => j !== i));

  const byIndex = useMemo(() => {
    const m = {};
    (resolved?.master || []).forEach((x, i) => { m[i] = x; });
    return m;
  }, [resolved]);

  const unresolvedCount = (resolved?.master || []).filter((x) => x.needsConfirm || x.grams == null).length;

  return (
    <>
      <div className="panel">
        <h2>Confirm the ingredients <span className="sub">the original measurement is kept — grams are added, not substituted</span></h2>
        <div className="table-wrap">
        <table className="table-stack">
          <thead>
            <tr><th>Ingredient</th><th style={{ width: 64 }}>Qty</th><th style={{ width: 84 }}>Unit</th><th>Measured as</th><th style={{ width: 130 }}>Override wt (g)</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const info = byIndex[i];
              const flagged = info && (info.needsConfirm || info.grams == null);
              return (
                <tr key={i} className={flagged ? 'flagged' : ''}>
                  <td data-label="Ingredient"><input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} /></td>
                  <td data-label="Qty"><input value={r.quantity} onChange={(e) => set(i, 'quantity', e.target.value)} /></td>
                  <td data-label="Unit"><input value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder="g / cup / each" /></td>
                  <td data-label="Measured as" style={{ fontSize: '.85rem' }}><span><MeasuredCell info={info} /></span></td>
                  <td data-label="Override wt (g)">
                    <input value={r.grams ?? ''} onChange={(e) => set(i, 'grams', e.target.value)}
                      placeholder={info?.grams != null ? 'optional' : 'enter g'} />
                  </td>
                  <td data-label="" style={{ textAlign: 'right' }}><button className="subtle sm" aria-label="Remove row" onClick={() => del(i)}><IconClose size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="row-actions" style={{ marginTop: 10 }}>
          <button className="ghost sm" onClick={add}><IconPlus size={14} /> Row</button>
          <button className="sm" onClick={recheck} disabled={busy}>Re-check weights</button>
          {resolved && (
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '.88rem' }}>
              Total master batter ≈ {Math.round(resolved.totalMasterGrams || 0)} g
              {unresolvedCount > 0 && <> · <span style={{ color: 'var(--fail)' }}>{unresolvedCount} row(s) need a weight</span></>}
            </span>
          )}
        </div>
      </div>

      <div className="panel grid2">
        <div>
          <label>Recipe name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nana’s lemon drizzle" />
          <label style={{ marginTop: 10 }}>Allergen info (free text — shown to customers if you enter it)</label>
          <textarea value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="Contains: wheat, egg, milk. May contain nuts." />
        </div>
        <div>
          <label>Notes (baker-only)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 120 }} />
        </div>
      </div>

      {!user && (
        <AuthCta>Sign in to save this recipe to your account.</AuthCta>
      )}
      <div className="panel actionbar-sticky" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {user ? (
          <>
            <button onClick={saveRecipe} disabled={busy} className="ghost">{recipeId ? 'Update recipe' : 'Save recipe'}</button>
            <button onClick={async () => { const r = await saveRecipe(); if (r) onNext(); }} disabled={busy || unresolvedCount > 0}>Save &amp; continue →</button>
          </>
        ) : (
          <>
            <button type="button" className="ghost" onClick={goLoginToSave}>Sign in to save</button>
            <button type="button" onClick={onNext} disabled={busy || unresolvedCount > 0}>Continue without saving →</button>
          </>
        )}
        {unresolvedCount > 0 && <span className="muted" style={{ alignSelf: 'center' }}>Enter a weight for every flagged row first.</span>}
      </div>
    </>
  );
}

function ClassifyStep({ classification, meta, typeOverride, onOverride, onNext }) {
  const c = classification;
  return (
    <>
      <div className="panel">
        <h2>Detected cake type</h2>
        <p>
          <span className="pill" style={{ fontSize: '1rem' }}>{c.label}</span>{' '}
          <span className="muted">confidence {Math.round((c.confidence || 0) * 100)}%</span>
        </p>
        <p className="muted">{c.base?.note} Dry base ≈ {c.base?.grams} g.</p>
        <div style={{ maxWidth: 460, margin: '14px 0' }}><RatioBars ratios={c.ratios} /></div>
        <h3>Why</h3>
        <ul>{(c.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
        {c.alternatives?.length > 0 && (
          <p className="muted">Other candidates: {c.alternatives.map((a) => `${a.label} (${Math.round(a.confidence * 100)}%)`).join(', ')}</p>
        )}
      </div>

      <div className="panel">
        <label>Override the type (used for fill %, moisture loss and scaling tables)</label>
        <select value={typeOverride} onChange={(e) => onOverride(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Use detected — {c.label}</option>
          {meta.cakeTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div style={{ marginTop: 16 }}><button onClick={onNext}>Continue →</button></div>
      </div>
    </>
  );
}

function PanStep({ meta, pan, setPan, useCalibration, setUseCalibration, calibrations, setCalibrations, recipeId, fillOverride, setFillOverride, bake, setBake, defaults, runCalc, busy }) {
  const sp = (k, v) => setPan({ ...pan, [k]: v });
  const sb = (k, v) => setBake({ ...bake, [k]: v });
  const dimFields = {
    round: ['diameter', 'depth'], bundt: ['diameter', 'depth'],
    square: ['side', 'depth'], rectangular: ['length', 'width', 'depth'], loaf: ['length', 'width', 'depth'],
  }[pan.shape] || ['diameter', 'depth'];
  const requiredDims = {
    round: ['diameter'], bundt: ['diameter'], square: ['side'],
    rectangular: ['length', 'width'], loaf: ['length'],
  }[pan.shape] || ['diameter'];
  const panReady = requiredDims.every((f) => Number(pan[f]) > 0);
  const defaultK = calibrations.find((c) => c.is_recipe_default)?.k_per_ml;

  return (
    <>
      <div className="panel">
        <h2>Pan</h2>
        <div className="row">
          <div><label>Shape</label>
            <select value={pan.shape} onChange={(e) => sp('shape', e.target.value)}>
              {meta.panShapes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label>Units</label>
            <select value={pan.unit} onChange={(e) => sp('unit', e.target.value)}>
              {meta.units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {dimFields.map((f) => (
            <div key={f}><label>{f}{f === 'depth' ? ' (optional)' : ''}</label>
              <input type="number" min="0.1" step="0.1" value={pan[f]} onChange={(e) => sp(f, e.target.value)} />
            </div>
          ))}
        </div>
        <label style={{ marginTop: 10 }}>
          <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={pan.deep} onChange={(e) => sp('deep', e.target.checked)} />
          Deep / bundt pan (forces 55–65% fill regardless of type)
        </label>
        {pan.shape === 'loaf' && <p className="muted" style={{ fontSize: '.85rem' }}>If you only give length, width = 0.5 × length and depth = 0.3 × length are assumed (shown in the result).</p>}
      </div>

      <div className="panel">
        <h2>Batter density</h2>
        {defaultK
          ? (
            <label>
              <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={useCalibration} onChange={(e) => setUseCalibration(e.target.checked)} />
              Use this recipe’s calibrated yield: <strong>{defaultK.toFixed(3)} g batter / mL</strong> (from a real bake). Uncheck to use the generic fill table.
            </label>
          )
          : <p className="muted">No calibration saved for this recipe yet — the generic fill-% table will be used. Add a real bake below to lock in the true yield.</p>}
        <details style={{ marginTop: 10 }}>
          <summary>Calibrate from a real bake</summary>
          <Calibrator recipeId={recipeId} onSaved={(list) => setCalibrations(list)} />
        </details>
        <details style={{ marginTop: 10 }}>
          <summary>Advanced: manual fill % override</summary>
          <div style={{ marginTop: 8, maxWidth: 200 }}>
            <label>Fill % (single number)</label>
            <input type="number" value={fillOverride} onChange={(e) => setFillOverride(e.target.value)} placeholder="e.g. 70" />
          </div>
        </details>
      </div>

      <div className="panel">
        <h2>This bake’s costs <span className="sub">labour / energy / packaging are flat per bake — never scaled by size</span></h2>
        {defaults?.needsHourlyRate && !bake.hourlyRate && (
          <div className="warnbox" style={{ marginBottom: 12 }}>No hourly rate on file. Enter one here (save it on the Defaults page to reuse).</div>
        )}
        <div className="grid2">
          {[
            ['labourMinutes', 'Minutes on this bake'],
            ['hourlyRate', 'Hourly rate (£)'],
            ['energyCost', 'Energy this bake (£)'],
            ['packagingCost', 'Packaging (£)'],
            ['overheadPct', 'Overhead (%)'],
            ['marginMinPct', 'Minimum margin (%)'],
            ['marginStdPct', 'Standard margin (%)'],
            ['marginPremiumPct', 'Premium margin (%)'],
          ].map(([k, label]) => (
            <div key={k}><label>{label}</label>
              <input type="number" step="0.01" value={bake[k]} onChange={(e) => sb(k, e.target.value)} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={runCalc} disabled={busy || !panReady}>Calculate →</button>
          {!panReady && <p className="muted" style={{ marginTop: 8 }}>Enter the required pan dimensions first.</p>}
        </div>
      </div>
    </>
  );
}

function Calibrator({ recipeId, onSaved }) {
  const [pans, setPans] = useState([{ shape: 'round', unit: 'in', diameter: '', depth: '' }]);
  const [batter, setBatter] = useState('');
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);

  const setP = (i, k, v) => setPans(pans.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const cleanPans = () => pans.map((p) => {
    const o = { shape: p.shape, unit: p.unit };
    for (const k of ['diameter', 'side', 'length', 'width', 'depth']) if (p[k] !== '' && p[k] != null) o[k] = Number(p[k]);
    return o;
  });

  const doPreview = async () => {
    setErr(null);
    try { setPreview(await api.post('/api/calibrations/preview', { pans: cleanPans(), actualBatterG: Number(batter) })); }
    catch (e) { setErr(e); }
  };
  const save = async () => {
    setErr(null);
    try {
      const r = await api.post('/api/calibrations', { recipeId, pans: cleanPans(), actualBatterG: Number(batter), makeDefault: true });
      onSaved(r.calibrations);
      setPreview(r);
    } catch (e) { setErr(e); }
  };

  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <Err error={err} />
      {pans.map((p, i) => (
        <div className="row" key={i}>
          <div><label>Shape</label><select value={p.shape} onChange={(e) => setP(i, 'shape', e.target.value)}>
            {['round', 'square', 'rectangular', 'loaf', 'bundt'].map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label>Units</label><select value={p.unit} onChange={(e) => setP(i, 'unit', e.target.value)}><option>in</option><option>cm</option></select></div>
          <div><label>diameter/side/length</label><input value={p.diameter || p.side || p.length || ''} onChange={(e) => setP(i, p.shape === 'round' || p.shape === 'bundt' ? 'diameter' : p.shape === 'square' ? 'side' : 'length', e.target.value)} /></div>
          <div><label>width</label><input value={p.width || ''} onChange={(e) => setP(i, 'width', e.target.value)} /></div>
          <div><label>depth</label><input value={p.depth || ''} onChange={(e) => setP(i, 'depth', e.target.value)} /></div>
        </div>
      ))}
      <div>
        <button className="ghost sm" onClick={() => setPans([...pans, { shape: 'round', unit: 'in', diameter: '', depth: '' }])}>+ another tin</button>
      </div>
      <div style={{ maxWidth: 240 }}>
        <label>Total batter weight actually made (g)</label>
        <input type="number" value={batter} onChange={(e) => setBatter(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="sm" onClick={doPreview}>Preview yield</button>
        <button className="sm" onClick={save} disabled={!recipeId}>Save as this recipe’s default</button>
      </div>
      {preview && !preview.error && (
        <div className="okbox">
          Real yield ≈ <strong>{preview.kPerMl} g batter / mL</strong> of pan volume
          (total pan volume {preview.totalVolumeMl} mL; implied fill {preview.impliedFillPctAtDensity1}%).
        </div>
      )}
    </div>
  );
}

function IngredientPricePanel({ price, cur, ingredientOverrides, recalcWithOverrides, saveOverridesToRecipe, busy }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(ingredientOverrides || {})));
  const [pushMsg, setPushMsg] = useState(null);
  const lines = price.lines || [];
  const setOv = (key, patch) => setDraft((d) => ({ ...d, [key]: { ...(d[key] || {}), ...patch } }));
  const clearOv = (key) => setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
  const dirty = JSON.stringify(draft) !== JSON.stringify(ingredientOverrides || {});

  return (
    <div className="panel">
      <h3>Ingredient prices <span className="muted" style={{ fontWeight: 400 }}>— from the master catalogue; override for this recipe only</span></h3>
      <div className="table-wrap">
      <table>
        <thead><tr><th>Ingredient</th><th>Amount</th><th>Source</th><th>Unit £</th><th>Line £</th><th>Override for this recipe</th></tr></thead>
        <tbody>
          {lines.map((l) => {
            const key = l.key;
            const ov = key ? draft[key] : null;
            return (
              <tr key={l.name} className={l.basis === 'missing' ? 'flagged' : ''}>
                <td>{l.name}{key ? '' : <span className="muted"> · not in catalogue</span>}</td>
                <td className="muted">{l.count != null ? `${l.count}×` : `${Math.round(l.grams)} g`}</td>
                <td>{l.basis === 'override' ? <span className="pill">recipe override</span>
                  : l.basis === 'master' ? <span className="muted">master</span>
                  : <span style={{ color: 'var(--fail)' }}>no price</span>}</td>
                <td className="muted">{l.unitPrice != null ? `£${l.unitPrice.toFixed(l.unit === '/each' ? 3 : 5)}${l.unit}` : '—'}</td>
                <td>{l.cost != null ? <Money amount={l.cost} currency={cur} /> : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {key ? (
                    <>
                      <input style={{ width: 70, padding: '3px 6px' }} type="number" step="0.01" placeholder="£"
                        value={ov?.price ?? ''} onChange={(e) => setOv(key, { price: e.target.value })} />
                      <select style={{ width: 74, padding: '3px 4px', marginLeft: 4 }}
                        value={ov?.priceUnit ?? 'kg'} onChange={(e) => setOv(key, { priceUnit: e.target.value })}>
                        {['kg', 'litre', 'each', 'g', 'ml'].map((u) => <option key={u}>{u}</option>)}
                      </select>
                      {ov && <button className="subtle sm" aria-label="Clear override" style={{ marginLeft: 4 }} onClick={() => clearOv(key)}><IconClose size={14} /></button>}
                    </>
                  ) : <span className="muted">add it under Ingredients</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="sm" disabled={busy || !dirty} onClick={() => recalcWithOverrides(cleanOverrides(draft))}>Apply overrides &amp; re-price</button>
        <button className="ghost sm" disabled={busy} onClick={async () => { await saveOverridesToRecipe(cleanOverrides(draft)); setPushMsg('Saved to recipe.'); }}>Save overrides to this recipe</button>
        <button className="subtle sm" disabled={busy || !Object.keys(draft).length}
          onClick={async () => {
            const r = await pushToMaster(draft, price.lines);
            setPushMsg(r);
          }}>Push overrides to master catalogue</button>
        {pushMsg && <span className="muted">{pushMsg}</span>}
      </div>
    </div>
  );
}
function cleanOverrides(d) {
  const out = {};
  for (const [k, v] of Object.entries(d || {})) {
    if (v && v.price !== '' && v.price != null && Number.isFinite(Number(v.price))) {
      out[k] = { price: Number(v.price), priceUnit: v.priceUnit || 'kg' };
    }
  }
  return out;
}
async function pushToMaster(draft, lines) {
  const clean = cleanOverrides(draft);
  const keys = Object.keys(clean);
  if (!keys.length) return 'No numeric overrides to push.';
  let n = 0;
  for (const key of keys) {
    try { await api.put(`/api/master-ingredients/${key}`, { price: clean[key].price, priceUnit: clean[key].priceUnit }); n += 1; } catch { /* ignore */ }
  }
  return `Updated ${n} master price(s).`;
}

function ResultStep({ calc, onQuote, onBack, menuItems, setMenuItems, pan, ingredientOverrides, recalcWithOverrides, saveOverridesToRecipe, busy }) {
  const { calc: c, price, audit, densitySource, cakeTypeKey } = calc;
  const cur = price.currency;
  const addToMenu = () => {
    const label = prompt('Size label for the menu (e.g. "8-inch round, serves 12")');
    if (!label) return;
    setMenuItems([...menuItems, {
      calculationId: calc.calculationId, tier: 'standard', sizeLabel: label,
      weightLabel: `approx. ${Math.round(c.bakedWeight.min)}–${Math.round(c.bakedWeight.max)} g`,
    }]);
  };

  return (
    <>
      <div className="panel">
        <h2>Calculated size &amp; weight <span className="sub">baker-only view — every figure is labelled</span></h2>
        <div className="table-wrap">
        <table>
          <tbody>
            <tr><td>Cake type used</td><td>{cakeTypeKey}</td><td><Badge accuracy={typeof calc.classification?.confidence === 'number' && calc.classification.detected !== 'unclassified' ? 'ESTIMATED' : 'REQUIRES_TESTING'} /></td></tr>
            <tr><td>Pan volume</td><td>{c.pan.volumeMl} mL {c.pan.assumptions.length > 0 && <span className="muted">({c.pan.assumptions.join('; ')})</span>}</td><td><Badge accuracy={c.pan.assumptions.length ? 'ESTIMATED' : 'CALCULATED'} /></td></tr>
            <tr><td>Fill level</td><td>{c.fill.pct[0]}–{c.fill.pct[1]}% {c.fill.note && <span className="muted">· {c.fill.note}</span>}</td><td><Badge accuracy={c.fill.accuracy} /></td></tr>
            <tr><td>Density basis</td><td>{c.batter.basis} <span className="muted">({densitySource})</span></td><td><Badge accuracy={c.batter.accuracy} /></td></tr>
            <tr><td><strong>Batter weight</strong></td><td><strong><Range v={c.batter} /></strong></td><td><Badge accuracy={c.batter.accuracy} /></td></tr>
            <tr><td>Scaling factor from master</td><td><Range v={c.scalingFactor} unit="×" dp={2} /> <span className="muted">(master batter {c.master.batterG} g)</span></td><td><Badge accuracy={c.scalingFactor.accuracy} /></td></tr>
            <tr><td><strong>Baked weight</strong></td><td><strong><Range v={c.bakedWeight} /></strong> <span className="muted">· retention {c.bakedWeight.retentionPct[0]}–{c.bakedWeight.retentionPct[1]}%</span></td><td><Badge accuracy={c.bakedWeight.accuracy} /></td></tr>
            <tr><td>Implied batter density</td><td>{c.impliedDensity} g/mL</td><td><Badge accuracy="CALCULATED" /></td></tr>
          </tbody>
        </table>
        </div>
        {(c.countAdvice || []).map((a, i) => (
          <div key={i} className={a.warnRounding ? 'warnbox' : 'okbox'} style={{ marginTop: 12 }}>
            <strong style={{ textTransform: 'capitalize' }}>{a.noun}s:</strong> {a.guidance} {a.note || ''}
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Scaled ingredient list (target size)</h3>
        <div className="table-wrap">
        <table>
          <thead><tr><th>Ingredient</th><th>Master recipe</th><th>Scaled</th></tr></thead>
          <tbody>
            {c.scaledIngredients.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className="muted">
                  {r.measurementType === 'count' && r.masterCount != null
                    ? `${r.masterCount} ${r.countNoun || 'x'}${r.masterCount === 1 ? '' : 's'}`
                    : `${r.masterGrams} g`}
                </td>
                <td>
                  {r.measurementType === 'count' && r.count != null
                    ? <><strong>{r.count} {r.countNoun || 'x'}{r.count === 1 ? '' : 's'}</strong>
                        {r.gramsRange && <span className="muted"> (~{Math.round(r.gramsRange.min)}–{Math.round(r.gramsRange.max)} g)</span>}</>
                    : `${r.grams} g`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="muted" style={{ fontSize: '.82rem' }}>Weight rows scale by the mid factor; count rows scale to a whole number and show the estimated weight range. <Badge accuracy="CALCULATED" /></p>
      </div>

      <IngredientPricePanel {...{ price, cur, ingredientOverrides, recalcWithOverrides, saveOverridesToRecipe, busy }} />

      <div className="panel">
        <h3>Cost &amp; price <span className="muted" style={{ fontWeight: 400 }}>— baker-only, never shown to customers</span></h3>
        <EstimateBanner price={price} cur={cur} />
        <div className="table-wrap">
        <table>
          <tbody>
            <tr>
              <td>Ingredient cost (scales with size)</td>
              <td>
                <Money amount={price.breakdown.ingredientCost.value} currency={cur} />
                {price.breakdown.ingredientCost.estimatedValue != null && (
                  <span className="muted"> → est. <Money amount={price.breakdown.ingredientCost.estimatedValue} currency={cur} /></span>
                )}
              </td>
              <td><Badge accuracy={price.breakdown.ingredientCost.accuracy} /></td>
            </tr>
            <tr><td>Labour {price.breakdown.labourCost.value == null ? '(not set — counted as £0)' : `(${calc.bakeUsed.labourMinutes} min @ £${calc.bakeUsed.hourlyRate}/h)`} — fixed</td><td><Money amount={price.breakdown.labourCost.value} currency={cur} /></td><td><Badge accuracy={price.breakdown.labourCost.accuracy} /></td></tr>
            <tr><td>Energy — fixed</td><td><Money amount={price.breakdown.energyCost.value} currency={cur} /></td><td><Badge accuracy={price.breakdown.energyCost.accuracy} /></td></tr>
            <tr><td>Packaging — fixed</td><td><Money amount={price.breakdown.packagingCost.value} currency={cur} /></td><td><Badge accuracy={price.breakdown.packagingCost.accuracy} /></td></tr>
            <tr>
              <td><strong>Total cost</strong></td>
              <td>
                <strong><Money amount={price.breakdown.totalCost.value} currency={cur} /></strong>
                {price.breakdown.totalCost.estimatedValue != null && (
                  <span className="muted"> → est. <Money amount={price.breakdown.totalCost.estimatedValue} currency={cur} /></span>
                )}
              </td>
              <td><Badge accuracy={price.breakdown.totalCost.accuracy} /></td>
            </tr>
            <tr>
              <td>+ Overhead {price.breakdown.overheadPct.value}%</td>
              <td>
                <Money amount={price.breakdown.costPlusOverhead.value} currency={cur} />
                {price.breakdown.costPlusOverhead.estimatedValue != null && (
                  <span className="muted"> → est. <Money amount={price.breakdown.costPlusOverhead.estimatedValue} currency={cur} /></span>
                )}
              </td>
              <td><Badge accuracy={price.breakdown.costPlusOverhead.accuracy} /></td>
            </tr>
          </tbody>
        </table>
        </div>
        <div className="tierbtns" style={{ marginTop: 14 }}>
          {['minimum', 'standard', 'premium'].map((t) => {
            const est = price.estimate?.isEstimate;
            const floor = price.pricesFloor ? price.pricesFloor[t] : price.prices[t];
            const lead = price.prices[t];
            return (
              <div className="tier" key={t}>
                <div style={{ textTransform: 'capitalize' }}>{t} <span className="muted">({price.margins[t]}%)</span></div>
                {est && price.pricesEstimated
                  ? (
                    <>
                      <div className="amt"><Money amount={floor} currency={cur} />–<Money amount={lead} currency={cur} /></div>
                      <small>floor – estimate <Badge accuracy={price.estimate.accuracy} /></small>
                    </>
                  )
                  : <div className="amt"><Money amount={lead} currency={cur} /></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h3>Self-audit</h3>
        <Checks audit={audit} />
        <p style={{ marginTop: 8 }}>Overall: <Badge accuracy={audit.overallAccuracy} /></p>
      </div>

      <div className="panel actionbar-sticky" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="ghost" onClick={onBack}>← Change pan / cost</button>
        <button className="subtle" onClick={addToMenu}>Add this size to a price-list menu</button>
        <button onClick={onQuote} style={{ marginLeft: 'auto' }}>Build customer quote →</button>
        {menuItems.length > 0 && <span className="pill">{menuItems.length} in menu</span>}
      </div>
    </>
  );
}

function QuoteStep({ calc, name, allergens, defaults, menuItems, setMenuItems, quote, setQuote, onDone, user, goLoginToSave }) {
  const price = calc.price;
  const [mode, setMode] = useState(menuItems.length > 0 ? 'menu' : 'single');
  const [tier, setTier] = useState('standard');
  const [form, setForm] = useState({
    cakeName: name || 'Celebration cake',
    description: '',
    businessName: defaults?.business_name || '',
    allergens: allergens || '',
    note: '',
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const sf = (k, v) => setForm({ ...form, [k]: v });

  const submit = async () => {
    if (!user || !calc.calculationId) {
      goLoginToSave();
      return;
    }
    setBusy(true); setErr(null);
    try {
      let body;
      if (mode === 'menu') {
        body = { mode: 'menu', ...form, items: menuItems.map((m) => ({ calculationId: m.calculationId, tier: m.tier, sizeLabel: m.sizeLabel, weightLabel: m.weightLabel })) };
      } else {
        body = { calculationId: calc.calculationId, tier, ...form };
      }
      const q = await api.post('/api/quotes', body);
      setQuote(q);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (quote) {
    return (
      <div className="panel stack">
        <h2>Quote ready{quote.isEstimate ? ' (estimate)' : ''}</h2>
        {quote.isEstimate && (
          <div className="warnbox">
            This quote is an <strong>estimate</strong> — some ingredient prices were missing. The customer
            page shows “{`estimate — final price confirmed on order`}”. Fill in the remaining prices and
            regenerate for a firm quote.
          </div>
        )}
        <div className="okbox">
          Customer page: <a href={`/q/${quote.id}`} target="_blank" rel="noreferrer">{location.origin}/q/{quote.id}</a>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`/q/${quote.id}`} target="_blank" rel="noreferrer"><button className="ghost">Open customer page</button></a>
          <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer"><button className="ghost">Download PDF</button></a>
          <button onClick={onDone} style={{ marginLeft: 'auto' }}>Done</button>
        </div>
        <p className="muted" style={{ fontSize: '.85rem' }}>The customer page and PDF contain no cost, margin, or internal maths — only what you see on this card.</p>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <h2>Build the customer quote</h2>
      <Err error={err} />
      {(!user || !calc.calculationId) && (
        <AuthCta>Sign in to save this quote to your account. After you log in, save the recipe and re-run the calculation so the quote can be stored.</AuthCta>
      )}
      <div className="tierbtns">
        <button className={`tier ${mode === 'single' ? 'sel' : ''}`} onClick={() => setMode('single')}>Single quote (one size &amp; price)</button>
        <button className={`tier ${mode === 'menu' ? 'sel' : ''}`} onClick={() => setMode('menu')}>Price-list menu (2–3 sizes){menuItems.length ? ` · ${menuItems.length} added` : ''}</button>
      </div>

      {mode === 'single' && (
        <div>
          <label>Price tier to show</label>
          <div className="tierbtns">
            {['minimum', 'standard', 'premium'].map((t) => (
              <div key={t} className={`tier ${tier === t ? 'sel' : ''}`} onClick={() => setTier(t)}>
                <div style={{ textTransform: 'capitalize' }}>{t}</div>
                <div className="amt"><Money amount={price.prices[t]} currency={price.currency} /></div>
                {price.estimate?.isEstimate && price.pricesFloor && (
                  <small>est. · floor <Money amount={price.pricesFloor[t]} currency={price.currency} /></small>
                )}
              </div>
            ))}
          </div>
          {price.estimate?.isEstimate && (
            <div className="warnbox" style={{ marginTop: 8 }}>
              Saved as an <strong>estimate</strong> ({price.estimate.unpricedWeightPct}% of ingredients unpriced). The
              customer page/PDF will show the estimated price with a plain
              “estimate — final price confirmed on order” note. No cost breakdown is shown to the customer.
            </div>
          )}
        </div>
      )}

      {mode === 'menu' && (
        <div>
          {menuItems.length === 0 && <div className="warnbox">Go back to a Breakdown screen and “Add this size to a price-list menu” for each size you want to offer.</div>}
          {menuItems.map((m, i) => (
            <div className="row" key={i} style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 3 }}><label>Size label</label>
                <input value={m.sizeLabel} onChange={(e) => setMenuItems(menuItems.map((x, j) => (j === i ? { ...x, sizeLabel: e.target.value } : x)))} /></div>
              <div><label>Tier</label>
                <select value={m.tier} onChange={(e) => setMenuItems(menuItems.map((x, j) => (j === i ? { ...x, tier: e.target.value } : x)))}>
                  <option>minimum</option><option>standard</option><option>premium</option>
                </select></div>
              <div style={{ flex: '0 0 auto' }}><button className="subtle sm" onClick={() => setMenuItems(menuItems.filter((_, j) => j !== i))}>Remove</button></div>
            </div>
          ))}
        </div>
      )}

      <div className="grid2">
        <div><label>Cake name</label><input value={form.cakeName} onChange={(e) => sf('cakeName', e.target.value)} /></div>
        <div><label>Business name</label><input value={form.businessName} onChange={(e) => sf('businessName', e.target.value)} /></div>
      </div>
      <div><label>Description (customer-facing)</label><textarea value={form.description} onChange={(e) => sf('description', e.target.value)} placeholder="Three layers of vanilla sponge with raspberry buttercream…" /></div>
      <div className="grid2">
        <div><label>Allergen info</label><textarea value={form.allergens} onChange={(e) => sf('allergens', e.target.value)} /></div>
        <div><label>Note / personalisation</label><textarea value={form.note} onChange={(e) => sf('note', e.target.value)} placeholder="“Happy Birthday” piping included." /></div>
      </div>

      <div>
        <button onClick={submit} disabled={busy || !user || !calc.calculationId || (mode === 'menu' && menuItems.length === 0)}>
          {user ? `Generate ${mode === 'menu' ? 'price list' : 'quote'}` : 'Sign in to save a quote'}
        </button>
      </div>
    </div>
  );
}
