# Handoff — 2026-10-14

Durable references:

- `docs/DEMO_REQUIREMENTS.md`
- `docs/SETUP_AND_TEST_GUIDE.md`
- `docs/REGRESSION_CHECKLIST.md`
- `docs/METRONOME_STARTER.md`
- `docs/DEMO_RUNBOOK.md`

## Latest seeding performance update

- AI Builder and Generation persona seeders now aggregate representative
  higher-quantity usage into at most roughly 145 events for a five-seat,
  29-day history (one or two Metronome batches), while preserving coverage for
  product/model, pricing tier, project, user/seat, and date dimensions.
- The same shared seeders serve checkout-created personas, Admin → Demo
  customers, and manual reseeding. The standalone AI Builder B2B seeder already
  emits 100 events in one batch.
- Generation B2B weighting targets exactly one seat above its 10,000-credit
  allocation; the remaining four retain varied, nonzero balances.
- Plans & Billing checks background seed completion every two seconds only
  while seeding. Completion includes a six-second aggregation grace period so
  "ready" does not refresh against an empty draft invoice. Ordinary dashboard
  refresh remains every 60 seconds.
- AI Builder carries accepted-but-not-yet-aggregated local spend from the
  playground to Plans & Billing. Each accepted chat ingestion schedules one
  contract reconciliation after two seconds; Plans & Billing keeps its normal
  60-second safety refresh rather than starting a polling loop. Resetting the
  story preserves pending spend because reset cannot undo ingested usage.
- Seed status is process-local on `globalThis` so separately bundled local
  route handlers share completion state. A distributed deployment still needs
  durable shared state.
- TypeScript and focused lint pass. A fresh Admin seed should be timed against
  the target Metronome account to confirm the expected roughly 10-second
  end-to-end behavior.

## Consolidated billing-flow regression pass

- Canonical `AI Builder Free` now wins over legacy `Free` for new signups.
- AI Builder chat state and optimistic balances are customer-scoped; new demo
  customers never inherit another customer's story.
- AI Builder and Generation attempt an exact transition first. Until the target
  account supports millisecond boundaries, Free contracts and synthetic Free
  usage use the prior-hour compatibility fallback.
- Expected AI Builder transition: two Free prompts consume `$5.25`; after
  upgrading, the third prompt alone contributes `0.3M` input and `0.2M` output
  tokens and leaves `$16.10` of the `$20` Pro credit.
- Dashboard balances now reconcile from explicit draft usage lines as soon as
  the Upcoming Invoice updates, with live net balance and contract balance as
  fallbacks. Subscription-only invoices no longer reduce the displayed credit.
- Contract schedule totals are no longer double-counted with manual ledger
  entries after credit purchases.
- AI Builder auto top-up defaults to `$5 → $15`, enforces Metronome's `$5`
  threshold and `$10` minimum recharge gap, refreshes contract state after
  setup/cancel, and surfaces cancellation errors. Generation applies the same
  fiat-equivalent limits in custom-credit units.
- Credit purchases refresh the Metronome contract immediately and display API
  failures in the modal. Reusing an existing seeded persona no longer seeds
  another batch of usage.
- TypeScript, repository lint (existing warnings only), and an isolated
  production build pass. A final fresh-customer live verification is still
  required because already-ingested usage cannot be reassigned between
  contracts.

## AI Builder parity and admin update

- Local `master` is five commits ahead of GitHub before this update; a clean
  working tree means changes are committed locally, not necessarily pushed.
- The existing AI Builder rate card, metrics, products, and rates remain
  unchanged. Canonical `AI Builder Free`, `AI Builder Pro`, and
  `AI Builder Enterprise Quickstart` packages were created from the legacy
  Free/Premium/Enterprise terms.
- AI Builder Quickstart is a `$2,500` prepaid, 12-month commitment. Existing
  legacy packages remain available for contracts already using them.
- AI Builder is presented as Free, Pro, Enterprise Quickstart, and custom
  Enterprise. Canonical packages are preferred when legacy names coexist.
- Login and Admin → Demo customers can prepare Pro, Quickstart, and B2B
  personas for either demo mode. AI Builder Pro/Quickstart now seed
  representative usage after checkout.
- New checkout-created personas show **Loading demo usage…** on Plans &
  Billing while background historical usage is ingested, then refresh the page
  automatically. No ingestion status is shown in the playgrounds.
- Login-created Pro and Quickstart personas now use the same embedded
  Setup-mode Checkout modal and package summary as pricing-page upgrades.
  Admin-only preparation retains hosted Checkout as a deliberate fallback.
- Only AI Builder Pro customers created through the seeded-demo path receive
  the `$5 → $15` Stripe invoice-gated auto top-up example. The reusable Pro
  package does not enable it for ordinary customers.
- Settings now links to one Admin hub separating Account setup, Demo customers,
  and Customer cleanup. Power-user creation moved out of cleanup.
- Account setup uses explicit memory-only target keys. Starter reset requires
  the target key plus typed `metronome-starter` confirmation and remains scoped
  to state-owned resources.
- Stripe customer cleanup now searches for scoped demo customers instead of
  auto-paging the entire shared account.

## Latest unified starter update

- Pre-migration checkpoint `caa079b` is pushed and tagged
  `pre-generic-demo-migration-2026-10-14`.
- `config/metronome/starter-kit.json` is now the single canonical Generation
  manifest used by both the app and account starter; the duplicate generation
  manifest/script were removed.
- Generic seeded resource names use a configurable prefix that defaults to
  `Generate`; neutral pricing model IDs are `vision-2`, `motion-1`, and
  `mesh-3`.
- The starter CLI and admin route share the in-process engine in
  `src/server/metronomeStarter/`.
- Metronome-only remains the default. The admin page optionally accepts a
  memory-only `sk_test_` key and delivery method ID for linked Stripe test
  customers, payment methods, billing configurations, invoice settlement,
  tracing, and state-owned cleanup.
- The reusable Pro package does not enable auto top-up. Only the starter-seeded
  Pro demonstration contract receives the manifest's threshold and target;
  ordinary Free → Pro customers can opt into auto top-up through settings.
- State now records billing mode, prefix, Stripe account/delivery method,
  Stripe customer IDs, billing configurations, and recovery checkpoints—never
  credentials.
- Canonical migration checkpoint: `5b43c82`.
- Configuration validation, TypeScript, focused ESLint, IDE diagnostics, and
  production build pass. Browser verification was blocked by the workspace MCP
  allowlist; no target-account seed was run automatically.
- Next: use the temporary account from **Settings → Admin: seed a new account**
  to preview, reset its prior starter seed if needed, then exercise fresh
  Metronome-only and optional Stripe-assisted seed/reset before seeding the
  account intended for sharing.
- The Generation playground and legacy `/chat` simulation now emit the
  canonical `service_tier` dimension, price Standard/Priority jobs from manifest
  multipliers, and use neutral model IDs.
- Generation pricing shows detailed credit cost for every product/service-tier
  combination without exposing the USD conversion. Invoice pacing can filter quality and
  service tier independently, and manual usage seeding mixes both tiers.
- Login includes explicit seeded Quickstart, Pro, and B2B persona shortcuts.
- The connected demo account was successfully seeded in Stripe-assisted mode:
  three linked personas/contracts, 1,009 deterministic usage events, and three
  finalized/paid Stripe test invoices. Stripe tax was unavailable, so the
  existing supported fallback linked billing without `tax_provider`.

## Completed

- Unified AI Builder and Generation demo flows.
- Exact-time Metronome contract transitions are attempted first for both modes,
  with a temporary hour-boundary fallback for accounts that still reject them.
- Fixed AI Builder Free-credit reporting so an exhausted `$5.00` grant displays `$0.00` rather than treating zero as a missing balance.
- Verified the Free-credit progression with real usage: `$5.00 → $2.60 → $0.00`; test customers were cleaned up.
- Generation account pages now consistently present custom `Generation Credits`, including balances, usage, invoice line items, purchases, and auto top-up.
- Draft current-period Metronome invoices remain in Upcoming Invoice and are excluded from invoice history.
- Upcoming Invoice groups subtotals, applied credits, and totals by credit type; USD and Generation Credits are never arithmetically combined.
- Generation catalog v10 provides demo-sized plans: Free (`$0`, 100 credits), Pro (`$20/month`, 1,000 credits), and Enterprise Quickstart (`$1,000` prepaid for 100,000 credits).
- The corrected Pro subscription uses a separate product so it cannot inherit the legacy `$99` rate.
- Credit purchases use a 500-credit minimum and presets of 1,000 credits for `$10` or 2,500 for `$25`.
- The Generation playground supports 1×, 5×, and 10× event batches so usage and auto top-up can be demonstrated quickly.
- Generation now reserves credits locally before work, rolls the reservation back when ingestion fails, and reconciles against Metronome after accepted batches.
- Accepted local usage remains marked as pending until Metronome catches up, preventing a stale reconciliation read from restoring already-burned Free credits.
- Background Metronome balance/invoice polling was reduced from 10 seconds to 60 seconds; webhook events produce reconciliation signals checked on tab focus/visibility.
- The temporary fallback recognizes both contract-start and contract-end
  hour-boundary errors and floors Pro to the current hour.
- Generation upgrade auto-selection matches configured Pro package names rather than searching only for `premium`.
- Future Pro contracts left by the old fallback are archived and safely replaced on retry.
- Generation Quickstart seeding scales to the active credit pool: healthy targets 42%, burst 65%, and at-risk 82%, with an optional `spendCap` override.
- A single bulk batch that exhausts the Free balance now opens the Pro upgrade prompt.
- The left Settings panel now links to the Admin hub; power-user creation lives
  under Demo customers and cleanup is destructive-only.
- Admin cleanup safely lists demo customers from both modes while excluding unrelated customers.
- Power-user creation has an explicit Lora Generate / AI Builder selector; it does not depend on the currently selected demo mode.
- AI Builder power users retain the original B2B contract structure.
- Generation power users use the same B2B structure with Generation-specific primitives: a 12-month 1,000,000 Generation Credit prepaid commitment (`$10,000` invoice), five `$1,000/month` seats, 10,000 recurring monthly credits per seat, a 0.85 usage multiplier, and deterministic multi-user/project Generation usage.
- Power-user usage is intentionally uneven across seats and targets 5% of the total pool so high-usage seats can reach pooled commitment while lower-usage seats retain visible balances.
- Added and seeded the `Lora Generate - Enterprise Seat` subscription product and its monthly rate. Existing packages and rate card IDs were retained.
- TypeScript and focused lint checks pass.
- The production build passes with only the existing repository warnings.
- Clean local checkpoints: `41c0716` (shared mode-aware admin flow) and `5f69075` (correct Generation B2B power-user contract).

## Consolidated billing regression checkpoint

- AI Builder Free usage is isolated from Pro usage through an exact boundary
  where available, or the temporary prior-hour fallback where required.
- AI Builder balances now keep local usage deductions until Metronome catches up; stale balance reads cannot restore spent credit. Generation uses the same reconciliation rule.
- Dashboard availability uses the selected contract's own balance and may only
  be lowered by explicit draft usage lines. Customer-level invoice breakdowns
  are not subtracted from a new contract. Subscription-only invoice lines do
  not consume credits.
- Free package lookup is mode-specific and ordered. Pricing retains a configured legacy Free package when canonical paid packages exist, and sign-up returns `409` instead of attaching an unrelated shared-account Free package.
- Sign-up and logged-in Free package selection backdate Free one hour for the
  temporary compatibility path. Upgrades attempt exact time first and fall back
  to the current hour only when Metronome rejects the exact boundary.
- Auto top-up and credit purchase behavior now follows the contract credit type, not only the selected demo mode. Legacy Generation USD wallets keep fiat semantics; true Generation custom-credit wallets keep Generation Credit semantics.
- Auto top-up reports a visible error when no Metronome customer exists. AI seeded Pro customers use one seat and one project consistently from both login and Admin.
- Expected fresh AI Builder flow: two Free prompts consume `$5.25`; after upgrading, the next prompt produces only `0.3M` input and `0.2M` output on the Pro invoice (`$3.90`), leaving `$16.10`.
- TypeScript, lint, and the isolated production build pass. Lint output contains only the repository's existing warnings.

## Next task

- Start from clean commit `7e343f6`, pushed to `origin/master` and tagged
  `checkpoint-generation-starter-2026-10-15`. This is the fallback before the
  multi-mode Account Setup redesign.
- Follow the approved plan at
  `/Users/linashen/.cursor/plans/multi-mode_starter_redesign_2f4eccaf.plan.md`.
- Implement only Phase 1 first:
  1. preserve the existing Generation starter behind a mode-runner contract;
  2. add an independently owned AI Builder starter for a blank target account;
  3. build the no-default, sequential AI Builder → Generation setup wizard;
  4. seed each selected mode's primitives, packages, Pro/Quickstart/B2B
     customers, contracts, usage, and optional Stripe linkage;
  5. add mode-scoped preview, retry state, and reset.
- Keep AI Builder USD cents and Generation Credits completely isolated.
  `processing_tier` remains a canonical AI Builder dimension.
- Do not add the optional custom pricing property during Phase 1. After a fresh
  account verifies both modes and a new checkpoint is created, implement Phase
  2 with the property unchecked by default. The starter-only example is
  `time_band: off_peak 0.8× | standard 1× | peak 1.25×`; it does not change the
  live playground, pricing page, or dashboard.
- Preserve the separate Admin concerns: target-account setup must use the keys
  entered on that page and must not call app-key demo-customer or cleanup
  routes.

## Current catalog

- Rate card: `ace1038e-e6be-4130-a28f-b8ec6d88af70`
- Free package: `22733ea2-e8bf-4147-98a2-52fd79d26387`
- Pro package: `5957532b-016f-466e-9c16-2835dfe5a469`
- Enterprise package: `5ce33189-876c-4251-bb36-011ed45e023a`
- Generation credit type: `7178a268-9978-4714-b56c-fd239e4d978b`
- Generation Enterprise Seat product: `0d9d1f08-d26d-487f-9043-cae89f030ab3`

Do not automatically migrate the existing legacy customer or pay its old prorated Stripe draft invoice.

The webhook reconciliation signal is intentionally in-memory for this single-process demo. A production deployment needs signature verification plus a durable shared cache or queue.

## Resume

```bash
npm install
npm run dev
```

Do not overwrite `.env`; it contains the user's restored credentials. The
checkpoint above was clean and synchronized with GitHub before this handoff
note was updated. Recheck `git status` before describing the current tree as
clean.
