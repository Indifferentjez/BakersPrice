# Bakers Price

Upload any cake recipe → convert to grams → classify the cake type from its own
ratios → scale to any pan → cost it (ingredients + labour + energy + packaging +
overhead + margin) → generate a clean customer quote that **never** shows cost or
margin.

Single baker, single user, local-first. React + Vite client, Express + SQLite
server. Recipe photo/PDF/paste parsing uses the Claude API; everything else works
without a key.

## Run it

```bash
npm install
npm run seed     # optional: adds one sample recipe
npm run dev      # server on :3001, client on :5173
```

Open http://localhost:5173.

To enable photo / PDF / paste auto-parsing, copy `.env.example` to `.env` and set
`ANTHROPIC_API_KEY`. Without it, use **Enter manually** — the rest of the app is
unaffected.

```bash
npm test         # engine unit + regression suite (58 tests)
npm run build && npm start   # production: server serves the built client
```

## How it works

| Stage | Where | Notes |
|---|---|---|
| Parse recipe | `server/anthropic.js`, `routes/parse.js` | LLM → structured `{name, quantity, unit}`. Baker confirms every row. |
| Grams | `server/lib/conversions.js` | Ingredient-specific density table from the brief. Grams you type always win. Anything not in the table is **flagged**, never guessed. |
| Classify | `server/lib/classify.js` | Fat/sugar/egg/liquid/cocoa ratios vs the dry base (flour, + oats when co-structural). Scores all 9 types, shows the triggering ratios, dropdown override. |
| Scale | `server/lib/calcEngine.js` | Pan volume → batter weight **range** → baked weight **range** → scaling factor → scaled ingredient list. Loaf tins fall back to width = 0.5·L, depth = 0.3·L (shown, not hidden). |
| Calibrate | `routes/calibrations.js` | Enter a real bake (pans + actual batter weight) → back-solves the recipe's true `g batter / mL of pan volume` and saves it as that recipe's default, replacing the generic fill table. |
| Cost | `server/lib/cost.js` | Ingredient cost scales with size. **Labour, energy, packaging are flat per bake — never scaled.** `price = (cost × (1+overhead)) ÷ (1 − margin)` for Minimum / Standard / Premium. **Incomplete price lists are allowed:** you get a firm *floor* (unpriced items = £0) and an *estimate* (unpriced items proxied at the priced items' average £/g), plus the margin for error (± amount, % of weight unpriced). The quote is then flagged an **estimate** — badged REQUIRES TESTING for the baker, and shown on the customer doc as "Estimated price" with a plain "final price confirmed on order" note (no cost maths). Add the missing prices for a firm quote. |
| Audit | `server/lib/audit.js` | Every calc: batter-density sanity, 0.25×–4× safe scaling range, fractional-egg guidance, monotonic price tiers. |
| Accuracy | `server/lib/accuracy.js` | Every number the baker sees is tagged KNOWN / CALCULATED / ESTIMATED / REQUIRES TESTING. |
| Customer doc | `routes/quotes.js`, `client/src/pages/CustomerPage.jsx`, `server/lib/quotePdf.js` | Whitelisted DTO built server-side — no cost/margin/overhead field is ever serialised. Shareable page at `/q/:id` + downloadable PDF. Single-quote or 2–3 size menu. |

## Data

SQLite at `server/data/app.db` (created on first run). Tables: `recipes`,
`ingredient_prices`, `cost_defaults` (singleton), `calibrations`, `calculations`,
`quotes`. Delete the file to reset.
