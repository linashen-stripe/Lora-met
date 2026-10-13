# Unified Lora Demo Runbook

## Before the presentation

1. Configure Metronome sandbox and Stripe test credentials in `.env` or
   the Tools panel.
2. Confirm the Metronome Stripe integration and delivery method.
3. Preview and, when needed, provision the namespaced Generation catalog:
   `npm run metronome:generation:plan` then
   `npm run metronome:generation:seed`.
4. Open these tabs:
   - `/en/demos/ai-builder`
   - `/en/demos/generation`
   - `/en/pricing?demoMode=generation`
   - `/en/admin/demo-prep`
   - `/en/dashboard/usage`
   - The matching Stripe test customer
   - The matching Metronome customer and contract
5. In `/en/admin/demo-prep`, load `bufo-studios@example.com` and seed the
   **Healthy growth** story.

## Demo switcher — two monetization models

Use the Demo tab in the left Tools panel to switch between:

- **AI Builder:** conversational app creation billed by input/output tokens.
- **Lora Generate:** image, video, and 3D jobs billed in generation credits.

Both modes use one Metronome and Stripe account pair, while package names,
customer aliases, stored sessions, seeders, and dashboard dimensions remain
isolated by mode.

Run two AI Builder prompts to exhaust the $5 trial credit and show its
mode-specific Premium upgrade before switching to Lora Generate.

## Chapter 1 — Launch

Explain that Lora launched Free, Pro, and Premium packages quickly using one
generation-credit unit across image, video, and 3D products.

Start the live product story on `/en/pricing?demoMode=generation`.

## Chapter 2 — Hybrid self-serve

1. Select **Free**.
2. Complete signup to create linked Metronome and Stripe customers.
3. Open Lora Generate.
4. Run an **Ultra 3D production bundle** for 50 credits.
5. Run a second 50-credit image, video, or 3D bundle.
6. Confirm the balance moves from 100 → 50 → 0.
7. Select **Upgrade to Premium**.
8. Add a Stripe test payment method through setup Checkout.
9. Confirm the Premium contract and its 8,000 monthly credits.

The upgrade transition ends Free and starts Premium at the same exact timestamp.
Usage before that boundary remains on Free.

## Chapter 3 — Quickstart Enterprise

1. Open `/en/admin/demo-prep`.
2. Load `bufo-studios@example.com`.
3. If it is new, complete setup Checkout once to prepare the Enterprise
   contract. Otherwise the prepared customer loads directly.
4. Seed **Healthy growth**, **At risk**, or **Late-month burst** usage.
5. Open the usage dashboard.
6. Filter by generation product, `model`, and quality.
7. Show project and `user_id` attribution.
8. Demonstrate low-balance alerting and auto top-up.
9. Open the Stripe customer delivered through Metronome.
10. Open the Metronome contract and explain:
    - 1,000,000 Generation Credit prepaid commitment ($10,000) over 12 months
    - Five seats
    - $1,000 monthly seat price with 10,000 Generation Credits per seat
    - Monthly credits burn before the prepaid commitment
    - 15% negotiated generation-rate discount

Quickstart never creates or transitions from a Free contract.

## Reset and fallback

- Reset the local Free wallet from Lora Generate.
- Reseed usage safely; deterministic transaction IDs prevent duplicate jobs.
- Use `/en/admin/cleanup-environment` to archive selected Metronome demo
  customers before deleting matching Stripe test customers.
- Preview catalog cleanup with `npm run metronome:generation:cleanup`. Apply it
  only after review with
  `npm run metronome:generation:cleanup -- --apply --confirm=lora-generate`.
- If account APIs are unavailable, the pricing page and generation playground
  remain usable with static local data.

## Expected local verification

```bash
npm run lint
npm run build
```

Free signup and two-job credit exhaustion have been verified against live
Metronome and Stripe test credentials. Recheck Premium Checkout before presenting.
