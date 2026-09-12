# Bakers Price

Upload any cake recipe → convert to grams → classify the cake type from its own
ratios → scale to any pan → cost it (ingredients + labour + energy + packaging +
overhead + margin) → generate a clean customer quote that **never** shows cost or
margin.

Sign-in required to save. React + Vite client, Express + SQLite server with
session cookies. You can walk through the wizard and preview a calculation
without an account. Signing in (email/password or optional Google) is required
to: save recipes / quotes / calibrations / cost defaults, and use LLM recipe
parsing (photo / PDF / paste — it spends API credits, so it's gated,
rate-limited, and Pro-only — see "Plans, billing, and admin" below). Editing the
shared ingredient catalogue additionally requires the `ADMIN_EMAIL` account —
everyone else, signed in or not, can only read it. Manual ingredient entry
needs no key. Customer quote pages `/q/:id` stay public.

Plain-language product guide (for people and AIs): **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)**.

## Run it

```bash
npm install
npm run seed     # optional: adds one sample recipe (claimed by the first signup)
npm run dev      # server on :3001, client on :5173
```

Open http://localhost:5173. Create an account (or log in) to persist baker data.
Customer quote pages at `/q/:id` stay public.

To enable photo / PDF / paste auto-parsing, copy `.env.example` to `.env` and set
`ANTHROPIC_API_KEY`. Without it, use **Enter manually** — the rest of the app is
unaffected.

Auth env (also in `.env.example`):

- `SESSION_SECRET` — required in production (signed session cookie).
- `GOOGLE_CLIENT_ID` — optional; omit to hide the Google button. In Google Cloud
  Console create an OAuth **Web application** client and add JavaScript origins
  `http://localhost:5173` plus your production origin. Client ID only.
- `CLIENT_ORIGIN` — default `http://localhost:5173` (Vite). Same-origin production
  deploys do not need a separate API origin.

### Plans, billing, and admin

Every account is on the **Free** plan (3 recipes, 3 quotes, no AI parsing) unless
upgraded to **Pro** (£12/mo — unlimited recipes/quotes, 40 AI parses/month). All
of the following are optional — leave them unset and the app runs exactly as
before, just with billing/admin/reset features showing a clear "not configured"
state instead of failing.

- `ADMIN_EMAIL` — the one signed-in email (case-insensitive) allowed to
  add/edit/delete ingredient prices or bulk-import them on **/ingredients**.
  Everyone can still *read* the catalogue. **Leave this unset and no one — not
  even a signed-in baker — can write to the shared catalogue**, since there's no
  email to match against.
- `RESEND_API_KEY` / `MAIL_FROM` — used by **/forgot** to email a password reset
  link via [Resend](https://resend.com). Without both set, `/forgot` still
  returns success (so it can never be used to check which emails have
  accounts), but only *logs* the reset link to the server console, and only
  when `NODE_ENV` isn't `production`. **In production with no Resend key, reset
  emails are never sent** — set these two before you rely on password reset for
  real users.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` — Stripe
  Checkout + Billing Portal + webhook for the Pro subscription. Leave any of
  them unset and `/pricing`'s Subscribe button shows "Billing not configured"
  instead of erroring. The webhook (`POST /api/billing/webhook`) needs to be
  registered in the Stripe dashboard pointing at your deployed URL, subscribed
  to `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, and `invoice.payment_failed`.

```bash
npm test         # engine unit + regression suite (includes auth ownership)
npm run build && npm start   # production: server serves the built client on $PORT (default 3001)
npm run backup   # copies the live SQLite DB into server/data/backups/ — see caveat below
```

**`npm run backup` is not the same as persistence.** It makes an online-safe
copy of `DB_PATH` (or `server/data/app.db`) using better-sqlite3's own backup
API (safe under WAL, unlike a plain file copy) into `server/data/backups/`. On
Render's free tier that backup file lives on the *same* ephemeral filesystem as
the database it copied — it gets wiped on the next sleep/redeploy right along
with everything else. It's genuinely useful (a) on your own machine, or (b)
once the service is on `plan: starter` with the `disk:` block uncommented —
run it against that mounted disk and copy the result off-box yourself
afterwards; the script does not upload anywhere on its own.

## Deploy (Render)

`render.yaml` is a Render Blueprint. In the Render dashboard: **New + → Blueprint →**
pick this repo → **Apply**. First deploy takes ~3–5 min and gives you a
`*.onrender.com` URL.

- **Free tier, so:** the service sleeps after ~15 min idle and its disk is wiped
  on every sleep/redeploy — the SQLite DB does **not** persist (accounts,
  recipes, quotes, catalogue prices, and any Stripe subscription link are all
  lost). The start command is just `npm start` — it does **not** run
  `npm run seed` on boot, so a fresh deploy starts completely empty rather than
  with the sample recipe. For real persistence, switch `plan: free` →
  `plan: starter` in `render.yaml` and uncomment the `disk:` + `DB_PATH` blocks
  (see "Plans, billing, and admin" above for why `npm run backup` alone doesn't
  fix this).
- **Auth:** email/password (and optional Google) session cookies. Set
  `SESSION_SECRET` (the blueprint generates one). Set `GOOGLE_CLIENT_ID` if you
  want the Google button; add your `*.onrender.com` origin in Google Cloud
  Console. Customer quote pages `/q/:id` stay public. `ANTHROPIC_API_KEY` still
  spends your credits for anyone who is signed in — leave it unset or set a
  spend cap.
- Runtime config: `PORT` (Render sets it), `DB_PATH`, `SESSION_SECRET`,
  `GOOGLE_CLIENT_ID`, `CLIENT_ORIGIN`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL` (blueprint defaults to `claude-sonnet-5`), plus the optional
  `ADMIN_EMAIL` / `RESEND_API_KEY` / `MAIL_FROM` / `STRIPE_*` vars above.

Any Node host with a persistent disk works the same way — build `npm install
--include=dev && npm run build`, start `npm start`, point `DB_PATH` at the disk.

## How it works

| Stage | Where | Notes |
|---|---|---|
| Master catalogue | `server/lib/masterIngredients.js`, `server/data/master-ingredients.json`, `routes/masterIngredients.js` | One central ingredient list: name + aliases, **measurement type** (weight / volume / count), density (g/cup) or count weight **range** (g per item), category, and a default **price** (basis: Aldi). Seeded once from JSON; edited at **/ingredients** (inline price edit, add ingredient, bulk price import). Legacy `ingredient_prices` rows are folded in on first run. |
| Parse recipe | `server/anthropic.js`, `routes/parse.js` | LLM → structured `{name, quantity, unit}`. Baker confirms every row. |
| Measure | `server/lib/measure.js` | **The original measurement is preserved.** `500 g flour` stays weight; `2 cups flour` converts with *that ingredient's* density; `6 bananas` / `4 large eggs` stay a **count** and gain an estimated weight *range* (e.g. 6 bananas ≈ 600–720 g). A gram value the baker types always wins over the unit. Anything not in the catalogue is **flagged**, never guessed. |
| Classify | `server/lib/classify.js` | Fat/sugar/egg/liquid/cocoa ratios vs the dry base (flour, + oats when co-structural). Scores all 9 types, shows the triggering ratios, dropdown override. |
| Scale | `server/lib/calcEngine.js` | Pan volume → batter weight **range** → baked weight **range** → scaling factor. Weight/volume rows scale by grams; **count rows scale to a whole number** and re-show the estimated weight range, with rounding advice (`countAdvice`). |
| Calibrate | `routes/calibrations.js` | Enter a real bake (pans + actual batter weight) → back-solves the recipe's true `g batter / mL of pan volume` and saves it as that recipe's default. |
| Cost | `server/lib/cost.js` | Ingredient prices come from the master catalogue, **optionally overridden per recipe** (an override never changes the master unless you push it). Count rows priced per-each; weight/volume rows per gram (kg/litre/cup converted with density). Ingredient cost scales with size; **labour / energy / packaging are flat per bake**. `price = (cost × (1+overhead)) ÷ (1 − margin)` for three tiers. Incomplete prices → firm *floor* + weight-proxy *estimate* + margin for error; the quote is flagged an estimate. |
| Audit | `server/lib/audit.js` | Batter-density sanity, 0.25×–4× safe scaling range, fractional-count guidance (per count ingredient), monotonic price tiers. |
| Accuracy | `server/lib/accuracy.js` | Every number the baker sees is tagged KNOWN / CALCULATED / ESTIMATED / REQUIRES TESTING. |
| Customer doc | `routes/quotes.js`, `client/src/pages/CustomerPage.jsx`, `server/lib/quotePdf.js` | Whitelisted DTO built server-side — no cost / margin / overhead / override field is ever serialised. Shareable page at `/q/:id` + downloadable PDF. |

## Data

SQLite at `server/data/app.db` (created on first run). Tables: `users`,
`sessions`, `user_cost_defaults`, `master_ingredients` (the catalogue),
`recipes` (incl. per-recipe `ingredient_overrides_json` and `user_id`),
`cost_defaults` (template for new accounts), `calibrations`, `calculations`,
`quotes`, and the legacy `ingredient_prices` (migrated, then unused). Delete the
file to reset.
