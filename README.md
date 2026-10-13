# Unified Lora Billing Demo

A single Lora-branded presenter app with two monetization demos:

- AI Builder: input/output token billing for conversational app creation.
- Lora Generate: image, video, and 3D generation credits.

Both modes share one Metronome sandbox and Stripe test account while keeping
their customers, packages, usage schemas, and local state isolated.

See [the implementation plan](docs/IMPLEMENTATION_PLAN.md) for the complete demo
story and scope. Use [the presenter runbook](docs/DEMO_RUNBOOK.md) for setup and
the live click path.

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

## Generation catalog

The desired Metronome catalog is declared in
`config/metronome/generation-catalog.json`. Commands are dry-run by default:

```bash
npm run metronome:generation:plan
npm run metronome:generation:seed
npm run metronome:generation:cleanup
```

Seeding is idempotent and writes account-specific IDs to the ignored
`.metronome/generation-state.json`. Cleanup only targets namespaced Lora Generate
resources. To apply cleanup after reviewing the preview:

```bash
npm run metronome:generation:cleanup -- --apply --confirm=lora-generate
```

Add `--include-customers` to preview or archive customers whose name starts with
`[Lora Generate]` or whose ingest alias starts with `generate:`.

## Metronome Starter Kit

To prepare a separate Metronome account as a generic starting point, use the
Starter Seed page under Settings or the isolated CLI workflow. It creates a
Metronome-only Generation catalog, Quickstart, Pro, and B2B example customers,
contracts, and representative usage without requiring Stripe.

See [the Starter Kit guide](docs/METRONOME_STARTER.md) for credentials, preview,
seed, optional peak/off-peak pricing, and namespace-scoped reset commands.

## Demo paths

- Switch modes from the Demo tab in the left Tools panel.
- AI Builder: `/en/demos/ai-builder`
- Lora Generate: `/en/demos/generation`
- Self-serve: pricing → Free signup → two 50-credit jobs → Premium upgrade.
- Quickstart: prepared Enterprise customer → historical generation usage →
  dashboard, alerts, auto top-up, Stripe, and Metronome contract views.

## Validation

```bash
npm run lint
npm run build
```
