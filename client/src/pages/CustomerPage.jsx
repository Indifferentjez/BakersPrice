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

  if (err) {
    return (
      <div className="customer">
        <div className="biz">Quote unavailable</div>
        <p className="muted">This link is no longer valid. Please ask for an up-to-date quote link.</p>
      </div>
    );
  }
  if (!dto) {
    return (
      <div className="customer">
        <div className="customer-skel" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="customer">
        <div className="biz">{dto.businessName || 'Bakery'}</div>
        <div className="kind">{dto.mode === 'menu' ? 'Cake price list' : 'Quotation'}</div>
        <hr />
        <div className="cake">{dto.cakeName}</div>
        {dto.description && <p>{dto.description}</p>}

        {dto.mode === 'menu' ? (
          <div className="mt-3">
            {dto.menu.map((m, i) => (
              <div className="final menu-item" key={i}>
                <div>
                  <div className="price-label">{m.sizeLabel}</div>
                  {m.weightLabel && <small>{m.weightLabel}</small>}
                </div>
                <div className="amt"><Money amount={m.price} currency={dto.currency} />{m.estimated && <small className="est-tag">est.</small>}</div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="line"><span>Size</span><span>{dto.sizeLabel}</span></div>
            <div className="line"><span>Approximate weight</span><span>{dto.weightLabel}</span></div>
            <hr />
            <div className="final"><span className="price-label">{dto.estimated ? 'Estimated price' : 'Price'}</span>
              <span className="amt"><Money amount={dto.price} currency={dto.currency} /></span>
            </div>
          </>
        )}

        {dto.priceNote && <div className="allergen mt-3">{dto.priceNote}</div>}
        {dto.note && <div className="note">{dto.note}</div>}
        {dto.allergens && <div className="allergen"><strong>Allergens:</strong> {dto.allergens}</div>}
        <div className="foot">{dto.businessName ? `${dto.businessName} · ` : ''}Prepared {new Date().toLocaleDateString('en-GB')}</div>
      </div>
      <div className="printbar">
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <a className="btn ghost" href={`/api/quotes/${id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
      </div>
    </>
  );
}
