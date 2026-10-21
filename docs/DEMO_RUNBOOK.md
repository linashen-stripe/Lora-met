# Unified Demo Runbook

Before preparing a new account, read:

- `docs/DEMO_REQUIREMENTS.md` — product and billing source of truth
- `docs/SETUP_AND_TEST_GUIDE.md` — account setup and end-to-end validation
- `docs/REGRESSION_CHECKLIST.md` — required change-safety matrix
- `docs/METRONOME_STARTER.md` — starter implementation and reset details

## Before the presentation

1. Configure Metronome sandbox and Stripe test credentials in `.env` or
   the Tools panel.
2. Confirm the Metronome Stripe integration and delivery method.
3. Preview and, when needed, provision the Generation catalog:
   `npm run starter:plan` then `npm run starter:seed`.
4. Open these tabs:
   - `/en/demos/ai-builder`
   - `/en/demos/generation`
   - `/en/pricing?demoMode=generation`
   - `/en/admin/customers`
   - `/en/dashboard/usage`
   - The matching Stripe test customer
   - The matching Metronome customer and contract
5. In `/en/admin/customers`, load `bufo-studios@example.com` and seed the
   **Healthy growth** story.

## Demo switcher — two monetization models

Use the Demo tab in the left Tools panel to switch between:

- **AI Builder:** conversational app creation billed by input/output tokens.
- **Lora Generate:** image, video, and 3D jobs billed in generation credits.

Both modes use one Metronome and Stripe account pair, while package names,
customer aliases, stored sessions, seeders, and dashboard dimensions remain
isolated by mode.

Run two AI Builder prompts to exhaust the $5 trial credit and show its
mode-specific Pro upgrade. After upgrading, run the third prompt and verify
that only its 300,000 input and 200,000 output tokens appear on Pro, leaving
$16.10 of the $20 monthly credit.

## Chapter 1 — Launch

Explain that Lora launched Free, Pro, and Enterprise packages quickly using one
generation-credit unit across image, video, and 3D products.

Start the live product story on `/en/pricing?demoMode=generation`.

## Chapter 2 — Hybrid self-serve

1. Select **Free**.
2. Complete signup to create linked Metronome and Stripe customers.
3. Open Lora Generate.
4. Run an **Ultra 3D production bundle** for 50 credits.
5. Run a second 50-credit image, video, or 3D bundle.
6. Confirm the balance moves from 100 → 50 → 0.
7. Select **Upgrade to Pro**.
8. Add a Stripe test payment method through setup Checkout.
9. Confirm the Pro contract and its 1,000 monthly Generation Credits.

The upgrade first attempts one exact transition timestamp. Until the target
account has the millisecond-boundary capability, the temporary fallback places
synthetic Free usage in the preceding hour and starts Pro at the current hour
boundary so Free usage cannot reduce the new Pro allowance.

## Chapter 3 — Enterprise Quickstart

1. Open `/en/admin/customers`.
2. Load `bufo-studios@example.com`.
3. If it is new, complete setup Checkout once to prepare the Enterprise
   contract. Otherwise the prepared customer loads directly.
4. Seed **Healthy growth**, **At risk**, or **Late-month spike** usage.
5. Open the usage dashboard and filter by generation product, model, quality,
   service tier, project, and user.
6. Open the Stripe customer delivered through Metronome.
7. Open the Metronome contract and explain the predefined 12-month `$1,000`
   prepaid commitment for 100,000 Generation Credits.

Quickstart never creates or transitions from a Free contract.

## Chapter 4 — Negotiated B2B

1. Load or seed the B2B Power User from Admin.
2. Explain that it is a direct negotiated contract, not a reusable package.
3. Show the 1,000,000 Generation Credit / `$10,000` annual commitment.
4. Show five `$1,000/month` seats with 10,000 recurring monthly credits each.
5. Compare per-seat usage: Healthy and At-Risk spill one seat into shared
   commitment; Late-month Spike spills two. The other seats retain different
   nonzero balances.
6. Show the 15% negotiated usage discount.

## Reset and fallback

- Reset the local Free wallet from Lora Generate.
- Reseed usage safely; deterministic transaction IDs prevent duplicate jobs.
- Use `/en/admin/cleanup-environment` to archive selected Metronome demo
  customers before deleting matching Stripe test customers.
- Preview starter cleanup with `npm run starter:reset`. Apply it only after
  review with `npm run starter:reset -- --confirm=metronome-starter`.
- If account APIs are unavailable, the pricing page and generation playground
  remain usable with static local data.

## Expected local verification

```bash
npm run lint
npm run build
```

Do a fresh-customer Free → Pro check for both modes before presenting. Existing
customers and historical usage are not valid evidence for corrected package or
transition behavior.
