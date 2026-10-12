# Lora Generation Billing Demo

A Lora-branded image, video, and 3D generation demo for hybrid self-serve and
Enterprise billing with Metronome and Stripe. Generation output is synthetic;
the billing integration uses sandbox/test APIs when credentials are configured.

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

Store secrets in `.env.local`; never commit them.

## Demo paths

- Self-serve: pricing → Free signup → two 50-credit jobs → Premium upgrade.
- Quickstart: prepared Enterprise customer → historical generation usage →
  dashboard, alerts, auto top-up, Stripe, and Metronome contract views.

## Validation

```bash
npm run lint
npm run build
```
