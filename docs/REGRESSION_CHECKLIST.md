# Change regression checklist

Use the smallest applicable section for every change. Run the full matrix for
changes to shared billing, customer, package, contract, invoice, balance,
pricing, or seeding code.

## Before editing

- [ ] Identify affected mode: AI Builder, Generation, or both.
- [ ] Identify affected customer types: Free, Pro, Enterprise Quickstart, B2B.
- [ ] Record whether the target account supports exact-time transitions or
      still requires the temporary hour-boundary fallback.
- [ ] Check whether the contract credit type is USD or a custom pricing unit.
- [ ] Confirm existing working-tree changes and do not overwrite `.env`.
- [ ] Create/push a fallback checkpoint first when the user requests one.
- [ ] For catalog changes, update the canonical manifest/config rather than
      hard-coding a second definition in UI or API code.

## Shared-code risk map

Changes in these areas require both-mode review:

- [ ] `ConfigContext` contract selection, balance normalization, and refresh.
- [ ] Pricing package loading and package-name compatibility.
- [ ] Signup, setup Checkout, upgrade success, and contract creation.
- [ ] Billing dashboard and invoice line classification.
- [ ] Credit purchase and auto top-up modals/routes.
- [ ] Admin customer creation, seeded usage, and cleanup.
- [ ] API client headers and API Inspector tracing.

## Package and signup

- [ ] Package lookup uses the selected mode's ordered configured names.
- [ ] A missing Free package fails clearly; it does not select another mode's
      package by a broad `free|trial` match.
- [ ] Home and pricing Free actions create the same intended contract.
- [ ] Signup does not silently succeed when required contract creation fails.
- [ ] Customer identity, local state, and ingest alias are mode/customer scoped.
- [ ] Seeded-persona login does not reseed usage on every login.
- [ ] Seeded personas land on Plans & Billing.
- [ ] Login-created Pro and Quickstart personas use the same embedded Checkout
      modal, package summary, background, and sizing as pricing-page upgrades;
      they do not redirect to Stripe-hosted Checkout.
- [ ] Resetting a playground resets only its story; it does not restore credit
      or discard pending usage that Metronome has already accepted.
- [ ] A reset creates a new story-run ID. Repeating step 1 must ingest new
      transaction IDs rather than being silently deduplicated.
- [ ] Pre-upgrade usage consumes Trial Credit on the Free contract; post-upgrade
      and post-reset usage consumes the active Pro plan credit.
- [ ] The chat shows cumulative Trial Credit and Pro plan credit spend
      separately; Reset clears the story but preserves both spend totals.
- [ ] Plans & Billing honors the playground's pending local deduction
      immediately. Each accepted chat ingestion schedules one contract
      reconciliation after two seconds; Plans & Billing retains only its normal
      60-second safety interval. An unconfirmed local deduction expires after
      60 seconds rather than remaining indefinitely.
- [ ] New persona background seeding shows progress on Plans & Billing and
      refreshes billing data after Metronome has had time to aggregate accepted
      events; "ready" must not reveal an empty invoice.
- [ ] Persona seeding completes with batched usage ingestion (normally about
      10 seconds) without high-frequency dashboard polling.
- [ ] Seeded usage still covers every configured product/model, both pricing
      tiers, all projects, historical dates, and the intended users/seats.

## Contract transitions

- [ ] Subscription/recurring schedules anchor on contract start.
- [ ] Intended proration remains disabled.
- [ ] Exact-time transition is attempted before compatibility fallback.
- [ ] When fallback is required, Free starts in the preceding hour and Pro
      starts at the current hour boundary.
- [ ] Fallback Free events remain before the boundary; paid events use real
      timestamps.
- [ ] There is no transition-credit workaround.
- [ ] No temporary transition credit hides usage attributed to the wrong
      contract.
- [ ] After Free → Pro, the Free draft remains attached only to the Free
      contract; the Plans page selects the Pro draft by active contract ID.
- [ ] Free usage never lowers the displayed Pro balance or appears in the Pro
      upcoming-invoice section.
- [ ] No new contract is future-dated or shown as `active soon`.
- [ ] Existing duplicate/future contracts are handled explicitly, not ignored.

## Balance and invoice invariants

- [ ] Local deduction is immediate after accepted user action.
- [ ] Failed ingest restores the local reservation.
- [ ] Stale reconciliation cannot increase the displayed balance above the
      local optimistic value.
- [ ] A changed contract resets the old pending reservation safely.
- [ ] Subscription-only invoice lines do not reduce included credit.
- [ ] Draft metered usage can lower availability before balance catches up.
- [ ] Every dashboard invoice selection is scoped to the active contract ID;
      it never selects another contract merely because that draft has usage.
- [ ] AI Builder displays USD; Generation custom wallets display Generation
      Credits.
- [ ] Legacy Generation `USD (cents)` contracts retain fiat semantics.
- [ ] USD and custom-credit invoice sections are not added together.
- [ ] Draft invoices remain Upcoming; finalized invoices appear in history.

## AI Builder matrix

- [ ] Pricing shows Free, Pro `$20/month`, and Enterprise Quickstart.
- [ ] No image, video, 3D, service-tier, or Generation Credit copy appears.
- [ ] Free starts at `$5.00`.
- [ ] Two prompts exhaust Free and open the upgrade prompt.
- [ ] Pro users do not see the Free upgrade prompt.
- [ ] First paid prompt invoices only `0.3M` input / `0.2M` output for `$3.90`.
- [ ] Pro remaining balance is `$16.10`.
- [ ] Chat remains fixed-height and scrollable.
- [ ] Auto top-up defaults to `$5 → $15`, can save, and can cancel.

## Generation matrix

- [ ] Pricing shows Free 100, Pro 1,000 at `$20/month`, Enterprise
      Quickstart 100,000 / `$1,000` / 12 months, and custom Enterprise.
- [ ] Pricing includes image, video, and 3D credit costs.
- [ ] Customer-facing pricing does not expose per-credit USD conversion.
- [ ] Playground supports all modalities, Standard/Priority, and `1×/5×/10×`.
- [ ] Free can visibly burn `100 → 50 → 0`.
- [ ] Upgrade begins with the full 1,000-credit Pro pool.
- [ ] Usage carries separate model, quality, operation, and `service_tier`.
- [ ] Usage carries `workspace_id`, `project_id`, and `user_id`.
- [ ] Purchase minimum/presets remain 500 / 1,000 / 2,500 credits.
- [ ] Fiat `getNetBalance` values are treated as `USD (cents)` minor units even
      when fractional; Purchase Credits must not inflate the balance by 100×.
- [ ] Internal fiat credit-type names such as `USD (cents)` display as `USD`;
      custom unit names such as `Generation Credits` remain unchanged.
- [ ] Ordinary Pro signup does not automatically enable auto top-up.
- [ ] Prepared seeded Pro uses below 500 → recharge to 1,500.
- [ ] Prepared Generation Pro seeds only whole image/3D jobs and whole video
      seconds; seeded usage cannot exceed the 1,000-credit monthly grant before
      any configured auto top-up.
- [ ] Invoice rows split internally by credit application are coalesced by
      product, unit price, and dimensions so whole-job quantities remain whole.
- [ ] Cancel disables the existing threshold configuration; setting it up again
      updates and re-enables that configuration rather than attempting to add a
      duplicate.

## Enterprise and seeded data

- [ ] Quickstart has no subscription and never transitions from Free.
- [ ] Quickstart usage produces a representative graph, consumes only its
      100,000-credit annual commitment, and leaves a nonzero balance.
- [ ] B2B Power User is a direct contract, not a package.
- [ ] B2B has five nonzero seat quantities/assignments.
- [ ] AI Builder and Generation B2B seat subscriptions start exactly at the
      contract start, end with the contract, and use no proration; per-seat
      recurring credits and seat increases follow the same boundaries.
- [ ] Per-seat monthly credits are visible and consumed before shared commit.
- [ ] Exactly one seat spills into commitment; the other seats have varied,
      nonzero usage below their individual allocations.
- [ ] The 15% negotiated discount is present.
- [ ] Deterministic transaction IDs prevent accidental duplicate usage.

## Stripe and tax fallback

- [ ] Metronome-only flows work without Stripe.
- [ ] Stripe-assisted paths accept only a test key.
- [ ] Delivery method and Stripe account are compatible.
- [ ] Customer billing configuration links successfully.
- [ ] If `tax_provider: stripe` is unavailable, the supported retry removes the
      tax provider rather than abandoning customer setup.
- [ ] Credit purchase/top-up creates the intended invoice-gated action.
- [ ] Finalize/pay is used only for intended Stripe test invoices.
- [ ] Cleanup deletes only recorded starter-owned Stripe customers.

## Admin, starter, and inspector

- [ ] No starter mode is selected by default.
- [ ] AI Builder can plan/seed/reset on a blank target account without legacy
      Demo Hub packages.
- [ ] With both modes selected, AI Builder completes before Generation
      unlocks; a failure leaves the other mode untouched and retryable.
- [ ] AI Builder starter usage remains USD cents; Generation starter usage
      remains Generation Credits.
- [ ] Each mode creates exactly one Pro, Quickstart, and B2B starter customer
      with one active starter contract.
- [ ] Demo-data reset retains catalog/packages. Full reset removes demo data
      before mode-owned packages, rate cards, products, and metrics.
- [ ] Preview performs no mutation.
- [ ] API keys remain memory-only and are never written to `.env` or state.
- [ ] Combined group keys satisfy pricing and presentation dimensions.
- [ ] Reset removes aliases before customer archival.
- [ ] Reset preview excludes unrelated account resources.
- [ ] Reseed works after reset despite archived uniqueness keys.
- [ ] Duplicate active contracts stop with a clear reset/review instruction.
- [ ] Optional custom pricing is disabled by default for both modes.
- [ ] When enabled, the property appears on selected metric filters/group
      keys, product pricing keys, all expected rate variants, and seeded events.
- [ ] Custom properties never alter fixed/subscription products, credit units,
      package terms, commits, or seat allocations.
- [ ] Changing, enabling, or disabling a property on a completed seed requires
      full reset; demo-data reset is insufficient.
- [ ] `time_band` preview shows `off_peak 0.8×`, `standard 1×`, and
      `peak 1.25×`, with clear producer-classification/live-app warnings.
- [ ] API Inspector captures supported browser and server-side Metronome/Stripe
      calls, supports search/filtering, and redacts credentials.

## Verification and handoff

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint` (record known warnings; introduce no new errors)
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] IDE diagnostics checked for edited files.
- [ ] Fresh-customer live test completed for affected end-to-end flows.
- [ ] Requirements, setup guide, runbook, and locale copy updated where needed.
- [ ] State clearly whether changes are uncommitted, committed locally, pushed,
      and/or tagged.
