# Unified Lora Billing Demo

A single Lora-branded presenter app with two monetization demos:

- AI Builder: input/output token billing for conversational app creation.
- Lora Generate: image, video, and 3D generation credits.

Both modes share one Metronome sandbox and Stripe test account while keeping
their customers, packages, usage schemas, and local state isolated.

Use:

- [product and billing requirements](docs/DEMO_REQUIREMENTS.md) for the current
  source of truth;
- [setup and test guide](docs/SETUP_AND_TEST_GUIDE.md) for account preparation
  and end-to-end validation;
- [regression checklist](docs/REGRESSION_CHECKLIST.md) before handing off
  shared billing changes; and
- [presenter runbook](docs/DEMO_RUNBOOK.md) for the live click path.

The older [implementation plan](docs/IMPLEMENTATION_PLAN.md) records the
original project direction and may contain superseded prices or names.

## Supported demo flows

- **Self-serve:** Free signup, metered usage, credit exhaustion, and Pro
  upgrade through Stripe Checkout.
- **Prepared customers:** deterministic Healthy, At-Risk, and Late-month Spike
  histories for Pro, Enterprise Quickstart, and negotiated five-seat B2B
  contracts.
- **Usage & Analytics:** contract-period pacing, project and product
  breakdowns, plan and top-up balances, invoice detail, and B2B seat usage.
- **Credit management:** invoice-gated credit purchase, Stripe Checkout credit
  purchase, 90-day credits, volume discounts, auto top-up, and payment-method
  replacement.
- **Admin tools:** previewable account setup, optional Stripe test billing,
  customer preparation, generated-email refresh, customer sorting, and
  namespace-scoped cleanup.
- **API learning:** a searchable inspector for supported browser and
  server-side Metronome and Stripe requests and responses.

Generation uses `1 Generation Credit = $0.01`: Free includes 100 credits, Pro
includes 2,000 credits for `$20/month`, and Enterprise Quickstart includes
110,000 credits for a `$1,000` twelve-month prepaid term. Checkout credit
purchases receive 5% off from 2,000 units and 10% off from 5,000 units in both
modes.

## Local setup

Use Node.js 24.11.1 and npm:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/en`.

Static pricing and playground views work without credentials. Metronome-backed
signup, contracts, and usage require `METRONOME_API_KEY`. Stripe Checkout and
payment flows also use the Stripe keys below; a delivery-method ID is needed
for Stripe-assisted provisioning when it cannot be resolved unambiguously:

```bash
METRONOME_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
METRONOME_DELIVERY_METHOD_ID= # optional unless selection is ambiguous
```

Store secrets in the ignored `.env` or `.env.local`; never commit them.

## Account starter

Settings → Demo → Open admin tools → Target account setup can prepare AI
Builder, Generation, or both on a target account. Nothing is selected by
default; selected modes are previewed and seeded independently, including
concurrent jobs when both are selected.
AI Builder uses `model × processing_tier`; Generation uses
`operation × quality × model × service_tier`.
Account setup/reset always uses explicit memory-only credentials. Demo customer
seeding and cleanup can instead deliberately select the configured demo
environment (Tools Panel override, then deployment environment) or explicit
credentials for another account.

The npm commands retain their Generation-only behavior and use the canonical
`config/metronome/starter-kit.json` manifest. Commands are dry-run by default:

```bash
npm run starter:plan
npm run starter:seed
npm run starter:reset
```

Seeding writes account-specific IDs to the ignored
`.metronome/starter/<account-scope>/state.json`. Reset targets only
starter-owned aliases and namespaced resources. Apply it after reviewing the
preview:

```bash
npm run starter:reset -- --confirm=metronome-starter
```

## Metronome Starter Kit

Use Target account setup under Admin tools or the CLI workflow.
Metronome-only is the default. The admin page can optionally use a matching
`sk_test_` key to create linked Stripe test customers, payment methods,
invoice routing, and payment while keeping credentials memory-only.

See [the Starter Kit guide](docs/METRONOME_STARTER.md) for credentials, preview,
seed, canonical pricing dimensions, and namespace-scoped reset commands.

## Billing experiments

Repeatable sandbox CLI experiments live under `scripts/experiments/`. They are
dry-run by default, use the ignored target credential file, and require
confirmed namespaced cleanup. See
[`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md).

## Demo paths

- Switch modes from the Demo tab in the left Tools panel.
- AI Builder: `/en/demos/ai-builder`
- Lora Generate: `/en/demos/generation`
- Self-serve: pricing → Free signup → two 50-credit jobs → Pro upgrade.
- Quickstart: prepared Enterprise customer → historical generation usage →
  dashboard, alerts, auto top-up, Stripe, and Metronome contract views.

## Validation

```bash
npx tsc --noEmit
npm run lint
npm run verify:seeding
npm run build
git diff --check
```
