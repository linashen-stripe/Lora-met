# Handoff — 2026-10-21

This branch contains a large, uncommitted update. Nothing described here has
been committed or pushed unless Git reports otherwise. Check `git status`
before changing that statement.

## Source-of-truth documents

- `docs/DEMO_REQUIREMENTS.md`
- `docs/REGRESSION_CHECKLIST.md`
- `docs/SETUP_AND_TEST_GUIDE.md`
- `docs/METRONOME_STARTER.md`
- `docs/DEMO_RUNBOOK.md`

`docs/IMPLEMENTATION_PLAN.md` is historical when it conflicts with the files
above.

## Current implementation

### Account setup

- AI Builder and Generation have independent preview, seed, resume, and reset
  state.
- Both modes can run concurrently and use their own catalog, packages,
  contracts, usage units, Stripe linkage, and ownership journal.
- Metronome-only provisioning is the default. Stripe-assisted provisioning is
  used only when an explicit valid Stripe test key and matching Metronome
  delivery method are available.
- Stripe-assisted setup creates a Stripe test customer in one request with
  `pm_card_us` as its default invoice payment method and a complete test billing
  address.
- Reset output is intentionally different by mode: Generation prints the
  detailed archived-resource summary and retains its shared custom pricing
  unit; AI Builder reports its package-oriented reset.
- Starter package ownership recovery recognizes saved IDs, aliases,
  uniqueness keys, and exact package names on the starter rate card, allowing a
  failed run to resume without treating its own resources as conflicts.

### Prepared customers

- Account Setup, Admin Demo Customers, checkout-created personas, and deferred
  B2B creation reuse the same mode-specific contract and usage seeders.
- Admin Demo Customers supports Metronome-only and optional Stripe-assisted
  direct provisioning. It does not redirect through Checkout.
- Login-created Pro and Quickstart customers retain the existing Checkout flow.
- Admin-prepared aliases use the `prepared-persona` namespace so Starter Reset
  cannot archive them.
- Customer emails can be regenerated before creating another prepared persona.
- Cleanup lists active Metronome and Stripe customers separately. Name and
  Created columns are sortable; Created defaults to newest first.

### Contract and usage behavior

- Pro and Quickstart contracts start 28 days ago at UTC midnight.
- B2B contracts, subscriptions, recurring seat credits, discounts, and annual
  commitments start together on the first day of the previous month. B2B
  usage is seeded only in the current month.
- AI Builder B2B interleaves all five seats. Generation Healthy/At-Risk has one
  spill seat; Late-month Spike has two post-discount spill seats.
- Healthy Pro consumes approximately 50% of the current monthly credit and
  does not trigger auto top-up. At-Risk can cross the threshold.
- Prepared flows poll for at least 98% of expected balance consumption before
  reporting completion. Ingest acceptance alone is not treated as settled
  usage.
- Generation keeps canonical `operation × quality × model × service_tier`
  pricing. AI Builder keeps canonical `model × processing_tier` pricing.

### Stripe billing

- Every Metronome billing-provider payload sends exactly one of
  `delivery_method_id` or `delivery_method`, preferring the resolved ID.
- Pro and Quickstart use Stripe `charge_automatically`.
- B2B uses Stripe `send_invoice` in Account Setup/Admin provisioning and in
  login-created AI Builder and Generation B2B flows.
- The due date for `send_invoice` is the Stripe integration-level Metronome
  setting. Metronome does not expose a per-contract `days_until_due` field.
- Stripe-backed Quickstart and B2B commitments remain non-payment-gated during
  contract creation. Metronome only accepts Stripe-gated commits through a
  post-contract edit.
- The reusable Pro package has no auto top-up. Only prepared Pro demo contracts
  receive the seeded threshold configuration.

## Repeatable verification

- Billing experiment CLIs live under `scripts/experiments/` and are documented
  in `docs/EXPERIMENTS.md`.
- Seeding invariants can be checked with `npm run verify:seeding`.
- Experiment commands use only `.env.metronome-target.local`; never overwrite
  or source the application's `.env` for target-account experiments.
- Use a fresh customer for attribution checks. Historical usage cannot prove a
  corrected contract transition.

## Latest checks

- Focused IDE lint checks pass for the latest edited files.
- `npx tsc --noEmit` passes.
- `git diff --check` passes.
- `npm run build` compiles and completes type/lint validation, then currently
  fails while prerendering `/404` with Next.js reporting that `<Html>` was
  imported outside `pages/_document`. This failure is not caused by the latest
  B2B collection-method or cleanup-table changes, but it remains unresolved.
- Rendered verification of the latest cleanup sorting change was blocked by
  the workspace browser-tool allowlist.

## Before committing

1. Recheck `git status`; the working tree contains many related modified and
   untracked files.
2. Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
3. Resolve or explicitly document the `/404` production-build failure.
4. Review staged files rather than using an unchecked blanket commit.
5. Keep credentials, generated experiment state, screenshots, and dated local
   investigation notes out of Git.

## Resume

```bash
npm install
npm run dev
```

Do not overwrite `.env`. Distinguish uncommitted work, local commits, GitHub
pushes, and tags in any subsequent handoff.
