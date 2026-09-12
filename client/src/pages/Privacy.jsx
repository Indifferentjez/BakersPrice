import { PageHeader } from '../components.jsx';

export default function Privacy() {
  return (
    <>
      <PageHeader title="Privacy" />
      <div className="panel stack">
        <p>
          Bakers Price stores the account, recipe, quote, and ingredient-price data you enter so it
          can be shown back to you when you sign in. Customer quote pages (<code>/q/:id</code>) show
          only the cake name, size, weight, price, allergen text, and note you choose to include —
          never your costs, margins, or overhead.
        </p>
        <p>
          If photo/PDF/paste recipe parsing is enabled, the image, PDF, or text you submit is sent to
          Anthropic&apos;s Claude API for transcription. It is not used for anything else.
        </p>
        <p>
          If billing is enabled, subscription and payment details are handled entirely by Stripe —
          Bakers Price never sees or stores your card details.
        </p>
        <p className="muted">This is a plain-language summary, not a formal legal policy.</p>
      </div>
    </>
  );
}
