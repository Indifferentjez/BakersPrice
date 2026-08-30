import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Money } from '../components.jsx';

// Customer-facing. Fetches only the whitelisted DTO — no cost data ever reaches here.
export default function CustomerPage() {
  const { id } = useParams();
  const [dto, setDto] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`/api/quotes/${id}/customer`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Quote not found'))))
      .then(setDto)
      .catch(setErr);
  }, [id]);

  if (err) return <div className="customer">Sorry — this quote link is not valid.</div>;
  if (!dto) return <div className="customer">Loading…</div>;

  return (
    <>
      <div className="customer">
        <div className="biz">{dto.businessName || 'Bakery'}</div>
        <div className="kind">{dto.mode === 'menu' ? 'Cake price list' : 'Quotation'}</div>
        <hr />
        <div className="cake">{dto.cakeName}</div>
        {dto.description && <p>{dto.description}</p>}

        {dto.mode === 'menu' ? (
          <div style={{ marginTop: 16 }}>
            {dto.menu.map((m, i) => (
              <div className="final" key={i} style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: 10 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{m.sizeLabel}</div>
                  {m.weightLabel && <small>{m.weightLabel}</small>}
                </div>
                <div className="amt"><Money amount={m.price} currency={dto.currency} />{m.estimated && <small style={{ display: 'block', textAlign: 'right' }}>est.</small>}</div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="line"><span>Size</span><span>{dto.sizeLabel}</span></div>
            <div className="line"><span>Approximate weight</span><span>{dto.weightLabel}</span></div>
            <hr />
            <div className="final"><span style={{ fontWeight: 600 }}>{dto.estimated ? 'Estimated price' : 'Price'}</span>
              <span className="amt"><Money amount={dto.price} currency={dto.currency} /></span>
            </div>
          </>
        )}

        {dto.priceNote && <div className="allergen" style={{ marginTop: 10 }}>{dto.priceNote}</div>}
        {dto.note && <div className="note">{dto.note}</div>}
        {dto.allergens && <div className="allergen"><strong>Allergens:</strong> {dto.allergens}</div>}
        <div className="foot">{dto.businessName ? `${dto.businessName} · ` : ''}Prepared {new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div className="printbar">
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer"><button className="ghost">Download PDF</button></a>
      </div>
    </>
  );
}
