# Handoff — 2026-10-12

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
- A single bulk batch that exhausts the Free balance now opens the Pro upgrade prompt.
- TypeScript and focused lint checks pass.

## Next task

- Visually verify the Generation pricing page shows Free, Pro, and Enterprise correctly.
- Test a fresh Generation customer through Free → Pro; existing legacy customers retain their old 8,000-credit contracts.
- Consider blocking auto top-up for legacy Generation contracts because their old rate card used the incorrect conversion.

## Current catalog

- Rate card: `ace1038e-e6be-4130-a28f-b8ec6d88af70`
- Free package: `22733ea2-e8bf-4147-98a2-52fd79d26387`
- Pro package: `5957532b-016f-466e-9c16-2835dfe5a469`
- Enterprise package: `5ce33189-876c-4251-bb36-011ed45e023a`
- Generation credit type: `7178a268-9978-4714-b56c-fd239e4d978b`

Do not automatically migrate the existing legacy customer or pay its old prorated Stripe draft invoice.

The webhook reconciliation signal is intentionally in-memory for this single-process demo. A production deployment needs signature verification plus a durable shared cache or queue.

## Resume

```bash
npm install
npm run dev
```

Do not overwrite `.env`; it contains the user's restored credentials.
