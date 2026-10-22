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
3. In **Settings → Demo → Open admin tools → Target account setup**, preview
   and prepare AI Builder, Generation, or both. The Generation-only CLI
   alternative is
   `npm run starter:plan` followed by `npm run starter:seed`.
4. Open these tabs:
   - `/en/demos/ai-builder`
   - `/en/demos/generation`
   - `/en/pricing?demoMode=generation`
   - `/en/admin/customers`
   - `/en/dashboard/usage`
   - The matching Stripe test customer
   - The matching Metronome customer and contract
5. In `/en/admin/customers`, generate a fresh email, choose the persona and
   **Healthy growth** profile, then prepare the customer.

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
9. Confirm the Pro contract and its 2,000 monthly Generation Credits.

The upgrade first attempts one exact transition timestamp. Until the target
account has the millisecond-boundary capability, the temporary fallback places
synthetic Free usage in the preceding hour and starts Pro at the current hour
boundary so Free usage cannot reduce the new Pro allowance.

## Chapter 3 — Enterprise Quickstart

1. Open `/en/admin/customers`.
2. Generate a fresh email and select **Enterprise Quickstart**.
3. Choose **Healthy growth**, **At risk**, or **Late-month spike** before
   preparing the customer.
4. Prepare the customer. Stripe linkage is optional on this Admin path; the
   selected immutable usage history is created as part of preparation.
5. Open the usage dashboard and filter by generation product, model, quality,
   service tier, project, and user.
6. Show period usage, plan/prepaid budget, top-up balance when present, current
   balance, and the project breakdown over the same contract-anchored period.
7. Open the Stripe customer delivered through Metronome.
8. Open the Metronome contract and explain the predefined 12-month `$1,000`
   prepaid commitment for 110,000 Generation Credits, including a 10% credit
   bonus.

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

## Optional chapter — Purchase credits

1. Open Usage for a Stripe-linked Pro customer.
2. Show the existing invoice-gated **Purchase credits** action.
3. Open **Checkout purchase** and select a preset or custom amount.
4. Use the Tools panel to compare Form Compact, Form Expanded, and Hosted page.
5. Complete payment and show that the app waits for the 90-day Metronome
   credit to appear before refreshing the wallet.
6. Reopen Checkout to demonstrate saved payment methods, or use the Payment
   Method card to replace the invoice default.

## Reset and fallback

- Use **Reset trial** in Lora Generate to start a new local story.
- Retry an interrupted prepared-customer seed safely; deterministic
  transaction IDs prevent duplicate jobs. Create a fresh customer to show a
  different immutable usage profile.
- Use `/en/admin/cleanup-environment` to archive selected Metronome demo
  customers before deleting matching Stripe test customers.
- Preview starter cleanup with `npm run starter:reset`. Apply it only after
  review with `npm run starter:reset -- --confirm=metronome-starter`.
- If account APIs are unavailable, the pricing page and generation playground
  remain usable with static local data.

## Expected local verification

```bash
npx tsc --noEmit
npm run lint
npm run verify:seeding
npm run build
git diff --check
```

Do a fresh-customer Free → Pro check for both modes before presenting. Existing
customers and historical usage are not valid evidence for corrected package or
transition behavior.
