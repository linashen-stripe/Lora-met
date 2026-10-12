# Lora Generation Demo Runbook

## Before the presentation

1. Configure Metronome sandbox and Stripe test credentials in `.env.local` or
   the Tools panel.
2. Confirm the Metronome Stripe integration and delivery method.
3. Provision Free, Premium, and Enterprise packages from the generation catalog.
4. Open these tabs:
   - `/en/pricing`
   - `/en/chat`
   - `/en/admin/demo-prep`
   - `/en/dashboard/usage`
   - The matching Stripe test customer
   - The matching Metronome customer and contract
5. In `/en/admin/demo-prep`, load `bufo-studios@example.com` and seed the
   **Healthy growth** story.

## Chapter 1 — Launch

Explain that Lora launched Free, Pro, and Premium packages quickly using one
generation-credit unit across image, video, and 3D products.

Start the live product story on `/en/pricing`.

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
    - $100,000 prepaid commitment over 12 months
    - Five seats
    - $2,000 monthly credits per seat
    - Monthly credits burn before the prepaid commitment
    - 15% negotiated generation-rate discount

Quickstart never creates or transitions from a Free contract.

## Reset and fallback

- Reset the local Free wallet from Lora Generate.
- Reseed usage safely; deterministic transaction IDs prevent duplicate jobs.
- Use `/en/admin/cleanup-environment` to archive selected Metronome demo
  customers before deleting matching Stripe test customers.
- If account APIs are unavailable, the pricing page and generation playground
  remain usable with static local data.

## Expected local verification

```bash
npm run lint
npm run build
```

Live verification remains incomplete until credentials and provisioned package
IDs are available.
