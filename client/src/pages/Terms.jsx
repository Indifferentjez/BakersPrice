import { PageHeader } from '../components.jsx';

export default function Terms() {
  return (
    <>
      <PageHeader title="Terms" />
      <div className="panel stack">
        <p>
          Bakers Price is a tool to help you cost and price your own bakes. All weights, costs, and
          prices it shows are <strong>estimates</strong> calculated from the information you enter and
          from general reference tables (typical tin fill, moisture loss, ingredient density, and so
          on) — not a guarantee. Every figure is labelled KNOWN, CALCULATED, ESTIMATED, or REQUIRES
          TESTING so you can judge how far to trust it; treat ESTIMATED and REQUIRES TESTING figures
          as a starting point to confirm with a real bake before relying on them commercially.
        </p>
        <p>
          Allergen text shown on a customer quote is whatever you type in — Bakers Price does not
          detect or verify allergens itself. You are responsible for checking your ingredients and
          confirming allergen information directly with your customer before they order.
        </p>
        <p>
          You are responsible for the accuracy of the recipes, prices, and quotes you create and
          share, and for agreeing final price and delivery terms with your own customers.
        </p>
        <p className="muted">This is a plain-language summary, not a formal legal policy.</p>
      </div>
    </>
  );
}
