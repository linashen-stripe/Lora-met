# Setup and test guide

Use this guide to prepare a clean demo account and validate changes before
sharing it. Product requirements live in `docs/DEMO_REQUIREMENTS.md`; starter
internals live in `docs/METRONOME_STARTER.md`.

## 1. Local setup

Requirements:

- Node.js `24.11.1`
- npm
- A Metronome sandbox API key
- Optional Stripe **test-mode** secret key
- For Stripe-assisted setup, a Metronome delivery method connected to the same
  Stripe test account

Install and start on the default port:

```bash
npm install
PORT=3000 npm run dev
```

The application may read demo credentials from `.env`, but implementation and
verification work must never rewrite that file.

For the standalone account starter, create the ignored target file:

```dotenv
# .env.metronome-target.local
METRONOME_API_KEY=...
STRIPE_SECRET_KEY=sk_test_...              # optional
METRONOME_DELIVERY_METHOD_ID=...           # required with Stripe when ambiguous
```

## 2. Choose the provisioning path

### Admin UI

Open **Settings → Admin: seed a new account**.

1. Explicitly select AI Builder, Generation, or both; nothing is selected by
   default.
2. Enter the target Metronome API key.
3. Optionally enter a Stripe test key and delivery method for full billing.
4. Review and preview each selected mode. With both selected, complete AI
   Builder before Generation unlocks.
5. Keep the generic prefixes `Build` and `Generate` unless the target account
   needs another explicit namespace.
6. Leave the optional custom pricing property disabled unless the target is
   specifically demonstrating event-property pricing.
7. Seed each selected mode and save its generated state result for later
   scoped reset.

Keys entered in Admin are memory-only and are not written to browser storage or
`.env`.

### CLI

```bash
# Read-only plan
npm run starter:plan

# Apply the plan
npm run starter:seed

# Preview reset
npm run starter:reset

# Apply scoped reset
npm run starter:reset -- --confirm=metronome-starter
```

Do not run reset against a shared account until the preview contains only
starter-owned resources.

## 3. Expected seeded resources

Generation:

- One `Generation Credits` pricing unit.
- Image, video, and 3D billable metrics and products.
- Free, Pro, and Enterprise Quickstart packages.
- Enterprise Quickstart, Pro, and B2B Power User personas.
- The B2B persona uses a direct contract, five seats, per-seat recurring
  credits, shared annual commitment, and 15% rate discount.

Stripe-assisted mode additionally creates one recorded Stripe test customer
and default test card per persona, links billing configurations, enables the
Pro invoice-gated threshold, and finalizes/pays available test invoices.

AI Builder:

- Six input/output token metrics and products across Code Assist, Chat, and
  Voice.
- Canonical `model × processing_tier` USD-cent rates.
- Free, Pro, and Enterprise Quickstart packages.
- Pro, Enterprise Quickstart, and direct-contract five-seat B2B personas.

When the optional custom pricing property is enabled, confirm that the
selected metrics, products, rate variants, and starter usage events all carry
the configured property. The live app intentionally does not emit arbitrary
starter properties.

## 4. Clean-account smoke test

After seeding:

1. Open pricing in each mode from the Tools panel.
2. Confirm no Generation products appear in AI Builder.
3. Confirm Generation includes image, video, and 3D with Standard/Priority
   costs.
4. Load each seeded persona and confirm it lands on Plans & Billing.
5. Confirm balances, invoice units, package name, contract dates, and credit
   type match the selected mode.
6. For Stripe-assisted seeds, confirm Metronome and Stripe customer links point
   to the expected test accounts.
7. Open the API Inspector and perform one simple operation before using reset
   as the first tracing test.

## 5. AI Builder Free → Pro test

Use a fresh email/customer. Existing events cannot be moved to a corrected
contract.

1. Select AI Builder.
2. Start from the home Free action or Free pricing card.
3. Complete signup and confirm an `AI Builder Free` contract and `$5.00`
   available credit.
4. Run prompt 1 and prompt 2.
5. Confirm local availability reaches `$0.00` immediately and does not bounce
   upward while Metronome catches up.
6. Confirm the Pro upgrade prompt appears.
7. Complete setup Checkout and upgrade.
8. Confirm the active contract is `AI Builder Pro`, `$20/month`, with `$20`
   recurring credit.
9. Run prompt 3.
10. Confirm the Pro upcoming invoice contains only:
    - `0.3M` input tokens;
    - `0.2M` output tokens; and
    - `$3.90` usage.
11. Confirm `$16.10` remains and the upgrade prompt is absent.
12. Reload Plans & Billing and confirm the same values after reconciliation.

Failure signals:

- Free usage appears on the Pro invoice.
- Pro starts in the future or reports `active soon`.
- Balance returns to `$20` after local deduction.
- Quantity is the cumulative three-prompt usage.
- A Generation Credits label appears anywhere in the AI flow.

## 6. Generation Free → Pro test

Use a fresh email/customer.

1. Select Generation.
2. Start Free from home or pricing.
3. Confirm 100 Generation Credits and no fiat balance label.
4. Run two 50-credit jobs, or an equivalent batch.
5. Confirm `100 → 50 → 0` immediately without a stale restoration.
6. Confirm the Generation Pro upgrade prompt appears.
7. Complete setup Checkout and upgrade.
8. Confirm `Generate Pro`, `$20/month`, and 1,000 monthly Generation Credits.
9. Run one Standard and one Priority job.
10. Confirm `service_tier`, model, quality, operation, workspace, project, and
    user dimensions in usage.
11. Confirm Free usage did not reduce the new 1,000-credit Pro pool.
12. Confirm the upcoming invoice separates USD subscription charges from
    Generation Credit usage/adjustments.

Failure signals:

- The new Pro balance starts at 900.
- Custom credits are shown as `$` or cents.
- The invoice reports unit prices instead of Generation Credit quantities.
- The product filter contains a monthly-credit adjustment.
- Image/video/3D or Standard/Priority selection is missing.

## 7. Purchase and auto top-up test

### AI Builder

1. On an active AI Builder Pro customer, configure `$5 → $15`.
2. Confirm the contract reflects the threshold.
3. Cancel it and confirm the contract refreshes.
4. Verify API errors remain visible in the modal.

### Generation

1. Use a true custom-credit Pro contract.
2. Purchase at least 500 credits.
3. Confirm the commit/invoice flow and refreshed custom-credit balance.
4. For a prepared seeded Pro, burn below 500 and confirm recharge to 1,500.
5. Confirm the resulting Stripe-assisted top-up uses invoice payment when
   Stripe is connected.

Also load a legacy Generation contract using `USD (cents)` if one remains. Its
purchase/top-up controls must use fiat semantics, not Generation Credit
semantics.

## 8. Enterprise persona test

### Enterprise Quickstart

- Twelve-month term from contract start.
- `$1,000` prepaid invoice.
- 100,000 Generation Credits.
- No subscription and no transition from Free.
- Seeded usage is large enough to produce a representative burndown.

### B2B Power User

- One direct contract, not a package-created contract.
- `$10,000` / 1,000,000-credit annual commitment.
- Five assigned seats.
- `$1,000/month` and 10,000 monthly credits per seat.
- Per-seat credits consume before shared commitment.
- One seat spills into shared commitment; other seats have distinct remaining
  balances.
- Invoice/usage applies the `0.85` multiplier.

## 9. Admin and reset test

1. Preview target account setup without writing.
2. Interrupt/retry a seed and confirm it resumes or reuses valid resources.
3. Confirm a rerun does not create duplicate active contracts.
4. Preview reset and verify every item is starter-owned.
5. Apply reset.
6. Confirm customer ingest aliases are removed before archival.
7. Confirm starter Metronome customers/contracts/catalog resources are
   archived.
8. With the matching Stripe key, confirm only state-recorded Stripe test
   customers are deleted.
9. Reseed and confirm no alias or uniqueness-key collision.

## 10. Final engineering checks

Do not use old customers as proof that a package or attribution change works.
Create a fresh customer for each end-to-end flow.

```bash
npx tsc --noEmit
npm run lint
npm run build
git diff --check
git status --short
```

Before handoff, record separately:

- checks that passed;
- live flows actually exercised;
- flows not exercised because credentials/browser access were unavailable;
- working-tree modifications;
- local commit SHA, if any;
- GitHub push and tag status, if any.
