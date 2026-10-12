# AGENTS.md

## Tech Stack

- **Node.js** 24.11.1 (`.node-version`)
- **Next.js** 15.5.9 (App Router, locale-scoped routes)
- **React** 19.1.0 + TypeScript 5.x
- **Stripe** 20.4.0-alpha.3 SDK with `@stripe/react-stripe-js` & `@stripe/stripe-js`; V2 Billing API version `2026-01-28.preview`
- **i18n**: i18next + react-i18next with JSON locales in `public/locales`
- **Styling**: Tailwind CSS 3.4.1 + custom CSS variables from the Tools Panel
- **Package manager**: npm

## Project Structure

```
/src/app/[locale]/        - All pages + API route handlers (chat, dashboard, pricing, etc.)
/src/app/api/stripe/      - Stripe-specific endpoints (credit grants, meters, billing, etc.)
/src/components/          - UI primitives (dashboard cards, checkout flows, tools panel)
/src/contexts/            - React context providers (Config, Cart, Checkout, Tools panel)
/src/utils/               - Stripe helpers, fetch clients, demo config utilities
```

## Dev Environment

- Install: `npm install`
- Run dev: `npm run dev`
- Build: `npm run build`

## Key Patterns & Conventions

- Locale-first routing: every page lives under `/[locale]/…`; root layout is async and awaits `params`.
- API routes in Next 15 use async params: `{ params }: { params: Promise<{ id: string }> }`.
- All Stripe calls go through `initializeStripe` (headers provide secret key via `withFallbackHeaders`); use the shared `STRIPE_API_VERSION` from `@/utils/stripe` for API version consistency.
- Usage-based billing demo: chat emits usage via `/api/stripe/meter/send-bulk-usage`; dashboards read data through `DashboardService`.
- Tools Panel (bottom-left Stripe button) controls runtime settings, webhook setup, and links to Lora v1; updates persist via `ConfigContext` + `localStorage`.
- Pricing/return pages wrap the search-param logic in `<Suspense>`—follow that pattern for any new `useSearchParams` usage.

## Testing Notes

- There are no active tests available for this project; ignore any references to tests in scripts or docs.
- Do not attempt to run tests to check code changes, even if you see test commands in package.json.

## Gotchas & Common Issues

- Stripe prerequisites: pricing plans seeded via Demo Hub (lookup keys `llama_ai_*`), API keys set in Tools Panel, webhook endpoint configured for `billing.alert.triggered`, `billing.credit_grant.created`, `invoice.paid`, `invoice.payment_failed`.
- Credit grants, blocking, and auto top-up all hinge on specific customer metadata; update helper utilities together.
- New manual checklists (`API_TEST_COMMANDS.md`, `API_TEST_RESULTS.md`, `UI_TEST_CHECKLIST.md`) document the UBB verification steps—keep them consistent when workflows change.
- Build warnings (hook deps, `<img>` usage) are known; avoid introducing new lint errors, but it’s acceptable to leave the existing warnings.
- Ensure locale JSON files and i18n keys stay synchronized whenever you add user-facing copy.

## Useful Commands

```bash
npm run lint
npm run build
PORT=3000 npm run dev        # matches the documented API curl commands
```

## Before You Commit

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Verify `.node-version` and `package.json` remain in sync
- [ ] If Stripe flows changed, re-run the manual UBB API/UI checklists with real Stripe data
- [ ] Update locale files + Tools Panel defaults for any new user-facing strings or settings
