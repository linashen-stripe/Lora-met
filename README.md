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

## Local setup

Use Node.js 24.11.1 and npm:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/en`.

The static generation and pricing experiences work without credentials. Live
signup, contracts, usage ingestion, and checkout require:

```bash
METRONOME_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
METRONOME_DELIVERY_METHOD_ID=
```

Store secrets in the ignored `.env` or `.env.local`; never commit them.

## Account starter

Settings → Admin → Account setup can prepare AI Builder, Generation, or both
on a target account. Nothing is selected by default; selected modes are
previewed and seeded sequentially with independent ownership and reset state.
An optional custom pricing property is disabled by default and affects only
starter-created rates and sample usage.

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

Use the Starter Seed page under Settings or the CLI workflow. Metronome-only is
the default. The admin page can optionally use a matching `sk_test_` key to
create linked Stripe test customers, payment methods, invoice routing, and
payment while keeping credentials memory-only.

See [the Starter Kit guide](docs/METRONOME_STARTER.md) for credentials, preview,
seed, optional custom pricing properties, and namespace-scoped reset commands.

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
npm run build
git diff --check
```
