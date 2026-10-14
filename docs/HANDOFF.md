# Handoff — 2026-10-13

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
  customers, payment methods, billing configurations, Pro invoice-gated
  auto-top-up, invoice settlement, tracing, and state-owned cleanup.
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
- Generation pricing shows detailed credit and USD list value for every
  product/service-tier combination. Invoice pacing can filter quality and
  service tier independently, and manual usage seeding mixes both tiers.
- Sample-customer login shortcuts were considered and intentionally omitted;
  the normal login flow remains unchanged.
- The connected demo account was successfully seeded in Stripe-assisted mode:
  three linked personas/contracts, 1,009 deterministic usage events, and three
  finalized/paid Stripe test invoices. Stripe tax was unavailable, so the
  existing supported fallback linked billing without `tax_provider`.

## Completed

- Unified AI Builder and Generation demo flows.
- Exact-time Metronome contract transitions are attempted for both modes, with an hour-boundary fallback for accounts that still enforce the legacy restriction.
- Fixed AI Builder Free-credit reporting so an exhausted `$5.00` grant displays `$0.00` rather than treating zero as a missing balance.
- Verified the Free-credit progression with real usage: `$5.00 → $2.60 → $0.00`; test customers were cleaned up.
- Generation account pages now consistently present custom `Generation Credits`, including balances, usage, invoice line items, purchases, and auto top-up.
- Draft current-period Metronome invoices remain in Upcoming Invoice and are excluded from invoice history.
- Upcoming Invoice groups subtotals, applied credits, and totals by credit type; USD and Generation Credits are never arithmetically combined.
- Generation catalog v8 provides demo-sized plans: Free (`$0`, 100 credits), Pro (`$20/month`, 1,000 credits), and Enterprise (`$1,000` prepaid for 100,000 credits).
- The corrected Pro subscription uses a separate product so it cannot inherit the legacy `$99` rate.
- Credit purchases use a 500-credit minimum and presets of 1,000 credits for `$10` or 2,500 for `$25`.
- The Generation playground supports 1×, 5×, and 10× event batches so usage and auto top-up can be demonstrated quickly.
- Generation now reserves credits locally before work, rolls the reservation back when ingestion fails, and reconciles against Metronome after accepted batches.
- Accepted local usage remains marked as pending until Metronome catches up, preventing a stale reconciliation read from restoring already-burned Free credits.
- Background Metronome balance/invoice polling was reduced from 10 seconds to 60 seconds; webhook events produce reconciliation signals checked on tab focus/visibility.
- Legacy hour-boundary fallback now recognizes both contract start and contract end errors, including `Contract ending before is required to be on an hour boundary`.
- Legacy fallback floors to the current hour instead of scheduling at the next hour, so paid contracts activate and invoice immediately.
- Generation upgrade auto-selection matches configured Pro package names rather than searching only for `premium`.
- Future Pro contracts left by the old fallback are archived and safely replaced on retry.
- Generation Quickstart seeding scales to the active credit pool: healthy targets 42%, burst 65%, and at-risk 82%, with an optional `spendCap` override.
- A single bulk batch that exhausts the Free balance now opens the Pro upgrade prompt.
- The left Settings panel now links to the shared admin cleanup and power-user wizard.
- Admin cleanup safely lists demo customers from both modes while excluding unrelated customers.
- Power-user creation has an explicit Lora Generate / AI Builder selector; it does not depend on the currently selected demo mode.
- AI Builder power users retain the original B2B contract structure.
- Generation power users use the same B2B structure with Generation-specific primitives: a 12-month 1,000,000 Generation Credit prepaid commitment (`$10,000` invoice), five `$1,000/month` seats, 10,000 recurring monthly credits per seat, a 0.85 usage multiplier, and deterministic multi-user/project Generation usage.
- Power-user usage is intentionally uneven across seats and targets 5% of the total pool so high-usage seats can reach pooled commitment while lower-usage seats retain visible balances.
- Added and seeded the `Lora Generate - Enterprise Seat` subscription product and its monthly rate. Existing packages and rate card IDs were retained.
- TypeScript and focused lint checks pass.
- The production build passes with only the existing repository warnings.
- Clean local checkpoints: `41c0716` (shared mode-aware admin flow) and `5f69075` (correct Generation B2B power-user contract).

## Next task

- Create a fresh Generation power user from `/en/admin/cleanup-environment` and verify its Metronome contract, Stripe invoice delivery, five seats, recurring seat credits, 0.85 override, and seeded usage. A customer created before the 2026-10-13 pricing correction retains its original contract and should be cleaned up rather than treated as the expected result.
- Visually verify the Generation pricing page shows Free, Pro, and Enterprise correctly.
- Test a fresh Generation customer through Free → Pro; existing legacy customers retain their old 8,000-credit contracts.
- Consider blocking auto top-up for legacy Generation contracts because their old rate card used the incorrect conversion.
- GitHub push is still pending: the local repository has no remote because GitHub authentication was not completed. Intended destination: `https://github.com/linashen-stripe/Lora-met.git`.

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

Do not overwrite `.env`; it contains the user's restored credentials.

The working tree was clean before this handoff update. Commit `docs/HANDOFF.md`
after restart if a fully clean checkpoint is desired.
