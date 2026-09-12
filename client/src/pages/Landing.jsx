import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <>
      <div className="panel hero">
        <h1>Turn any recipe into a fair price.</h1>
        <p className="muted">
          Paste a recipe, photograph the card, or type it in. Bakers Price converts it to grams,
          works out what kind of cake it is, scales it to any tin, costs it properly — ingredients,
          labour, energy, packaging, overhead and margin — and hands you a clean quote to send a
          customer. No spreadsheets, no guessing.
        </p>
        <div className="row-actions mt-3">
          <Link className="btn" to="/new">Try the wizard</Link>
          <Link className="btn ghost" to="/signup">Create a free account</Link>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Free <span className="pill">no card needed</span></h3>
          <ul className="feature-list">
            <li>3 saved recipes</li>
            <li>3 saved quotes</li>
            <li>Full costing &amp; pricing engine</li>
            <li>Shared ingredient price catalogue</li>
            <li>Photo / PDF / paste auto-parsing — 5/month</li>
          </ul>
          <Link to="/signup">Start free</Link>
        </div>
        <div className="panel">
          <h3>Pro <span className="pill">£12/mo</span></h3>
          <ul className="feature-list">
            <li>Unlimited recipes</li>
            <li>Unlimited quotes</li>
            <li>Unlimited photo / PDF / paste auto-parsing</li>
            <li>Everything in Free</li>
          </ul>
          <Link to="/pricing">See pricing</Link>
        </div>
      </div>

      <div className="panel">
        <h3>How it works</h3>
        <p className="muted">
          Recipe → confirm weights → agree the cake type → choose the tin and this bake&apos;s costs →
          read the baker-only breakdown → build a customer quote. Every number is labelled KNOWN,
          CALCULATED, ESTIMATED or REQUIRES TESTING, so you always know how much to trust it.
        </p>
      </div>
    </>
  );
}
