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
- [ ] Newly created signup and prepared customers use the selected mode/persona
      prefix (`[Generate - …]` or `[AI Builder - …]`); existing customer names
      are not rewritten.
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
      reconciliation after two seconds; Plans & Billing retains only its
      five-minute, visible-tab safety interval. An unconfirmed local deduction
      expires after 60 seconds rather than remaining indefinitely.
- [ ] New persona background seeding shows progress on Plans & Billing and
      refreshes billing data after Metronome has had time to aggregate accepted
      events; "ready" must not reveal an empty invoice.
- [ ] Persona seeding completes with batched usage ingestion (normally about
      10 seconds) without high-frequency dashboard polling.
- [ ] Account Setup, checkout-created Pro/Quickstart, and deferred B2B creation
      do not report completion immediately after ingest acceptance; they
      verify at least 98% of expected balance consumption, polling at most
      every five seconds for no more than 30 seconds. Generation Account Setup
      retains its 10-second aggregation grace.
- [ ] Account Setup and login/Admin customer creation route through the same
      mode-specific usage seeder; there is no bootstrap-only event generator
      with separate target, unit, or seat-distribution logic.
- [ ] Pricing, dashboard initialization, checkout, cancellation, credit
      display, and auto top-up do not call Stripe Billing V2 pricing-plan or
      pricing-plan-subscription APIs; plans remain Metronome contracts.
- [ ] Admin Customer Seeding invokes the same mode-specific starter persona
      and contract builders as Account Setup, changing only the selected
      persona, customer identity, and usage profile. Login/Signup still uses
      its interactive Checkout path.
- [ ] Admin-prepared customer aliases use the `prepared-persona` namespace,
      never a starter-owned namespace, so Starter Reset cannot archive them.
- [ ] Fresh Pro and Quickstart contracts start 28 days ago at UTC midnight.
- [ ] B2B contracts and all their terms start on the first of the previous
      month, remain non-prorated, and seed usage only in the current calendar
      month so the active monthly seat credits are consumed before commit.
- [ ] AI Builder starter B2B events interleave all five seats so partial
      aggregation cannot present only the heavy seat while others show zero.
- [ ] Healthy/At-Risk/Late-month Spike is selected before customer creation. Admin does
      not add a second immutable story to an already-seeded customer; a fresh
      customer is required to compare stories.
- [ ] Seeded usage still covers every configured product/model, both pricing
      tiers, all projects, historical dates, and the intended users/seats.
- [ ] Every AI Builder seed event includes `api_product`, `model`,
      `processing_tier`, `workspace_id`, `project_id`, and `user_id`; these are
      required by the canonical billable-metric filters, not optional display
      dimensions.
- [ ] Re-running AI Builder seeding with the same event-schema revision is
      idempotent and completes missing batches. A deliberate revision bump
      produces replacement transaction IDs for previously accepted but
      unrated event shapes.
- [ ] AI Builder resume recognizes starter packages by saved ID, starter
      alias, uniqueness key, or exact package name plus starter rate card;
      a failed run must not turn its own packages into ownership conflicts.
- [ ] Pro and Quickstart seed one actor; only B2B seeds the five contract seats.
- [ ] AI Builder Pro Healthy consumes about $10 of the current $20 monthly
      grant. Its future recurring grant and prepared $15 auto-top-up commit are
      excluded from pacing and remain unused.
- [ ] AI Builder Pro At-Risk consumes about $17 and can cross the $5 auto-top-up
      threshold; Late-month Spike consumes about $18 with most usage late in
      the seed window.
- [ ] Healthy, At-Risk, and Late-month Spike are selectable for both AI Builder
      and Generation; Account Setup still defaults every persona to Healthy.
- [ ] Generation Pro Healthy consumes about 920–980 of the 2,000 monthly plan
      credits. Its pre-created 1,500-credit auto-top-up commit is excluded from
      pacing and remains unused.

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
- [ ] Usage Pacing and project breakdown totals use the same contract-anchored
      monthly period; Usage Pacing shows current available balance rather than
      a linear forecast.
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

- [ ] Pricing shows Free 100, Pro 2,000 at `$20/month`, Enterprise
      Quickstart 110,000 / `$1,000` / 12 months, and custom Enterprise.
- [ ] Pricing includes image, video, and 3D credit costs.
- [ ] Customer-facing pricing does not expose per-credit USD conversion.
- [ ] Playground supports all modalities, Standard/Priority, and `1×/5×/10×`.
- [ ] Free can visibly burn `100 → 50 → 0`.
- [ ] Upgrade begins with the full 2,000-credit Pro pool.
- [ ] Usage carries separate model, quality, operation, and `service_tier`.
- [ ] Usage carries `workspace_id`, `project_id`, and `user_id`.
- [ ] Purchase minimum/presets remain 500 / 1,000 / 2,500 credits.
- [ ] Checkout purchases receive 5% at exactly 2,000 units and 10% at exactly
      5,000 units in both modes; inclusive API boundaries are 1,999 / 4,999.
- [ ] A fresh Checkout Session redisplays `always`, `limited`, and legacy
      `unspecified` saved payment methods and permits saving/removing them;
      removal is tested only on disposable test customers because it detaches
      the method from the Stripe customer.
- [ ] The Payment Method card's Replace action opens the setup Payment Element,
      saves the successful method as the Stripe customer's invoice default,
      refreshes the card, and removes the superseded default.
- [ ] Fiat `getNetBalance` values are treated as `USD (cents)` minor units even
      when fractional; Purchase Credits must not inflate the balance by 100×.
- [ ] Internal fiat credit-type names such as `USD (cents)` display as `USD`;
      custom unit names such as `Generation Credits` remain unchanged.
- [ ] Ordinary Pro signup does not automatically enable auto top-up.
- [ ] Prepared seeded Pro uses below 500 → recharge to 1,500.
- [ ] Prepared Generation Pro seeds only whole image/3D jobs and whole video
      seconds; seeded usage cannot exceed the 2,000-credit monthly grant before
      any configured auto top-up.
- [ ] No single prepared Generation Pro event represents more than 15% of its
      seeded consumption, and usage spans at least ten dates and three projects.
- [ ] Prepared Pro targets vary deterministically per customer: Healthy consumes
      46–49% and remains above the 500-credit threshold; At-Risk consumes
      81–87%; Late-month Spike consumes 89–94%. Healthy does not trigger
      auto top-up, while At-Risk and Late-month Spike may trigger it.
- [ ] Quickstart targets elapsed 12-month term pace, with base demo floors of
      10% Healthy, 15% At-Risk, and 12% Late-month Spike plus a stable
      per-customer 0.4–2 percentage-point offset inside the supported
      backdating window.
- [ ] Prepared Generation Pro retains a nonzero balance after every supported
      story; Quickstart consumes only a bounded fraction of its annual commit.
- [ ] Invoice rows split internally by credit application are coalesced by
      product, unit price, and dimensions so whole-job quantities remain whole.
- [ ] Cancel disables the existing threshold configuration; setting it up again
      updates and re-enables that configuration rather than attempting to add a
      duplicate.

## Enterprise and seeded data

- [ ] Quickstart has no subscription and never transitions from Free.
- [ ] Quickstart usage produces a representative graph, consumes only its
      110,000-credit annual commitment, and leaves a nonzero balance.
- [ ] B2B Power User is a direct contract, not a package.
- [ ] B2B has five nonzero seat quantities/assignments.
- [ ] AI Builder and Generation B2B seat subscriptions start exactly at the
      contract start, end with the contract, and use no proration; per-seat
      recurring credits and seat increases follow the same boundaries.
- [ ] Per-seat monthly credits are visible and consumed before shared commit.
- [ ] Healthy and At-Risk B2B profiles have exactly one spill seat. Generation
      Late-month Spike has exactly two post-discount spill seats. Every other
      seat has varied, nonzero usage below its allocation.
- [ ] B2B targets are derived from the monthly per-seat allocation, not from
      the annual shared commitment or the sum of all contract balances.
- [ ] B2B Usage Pacing compares month-to-date usage with active monthly seat
      credits, labels the shared commitment as contract-term rather than
      monthly, and keeps an off-scale shared commitment out of the chart axis.
- [ ] AI Builder B2B targets remain USD amounts and Generation B2B targets
      remain Generation Credits. Both account for the 0.85 usage multiplier
      when converting desired balance consumption to list-rate events.
- [ ] All B2B usage lands in the active monthly seat-credit period.
- [ ] Seat IDs use neutral sample identities; “power user” is inferred from
      usage and is not repeated in every seat name.
- [ ] The 15% negotiated discount is present.
- [ ] Deterministic transaction IDs prevent accidental duplicate usage.

## Stripe and tax fallback

- [ ] Metronome-only flows work without Stripe.
- [ ] Stripe-assisted paths accept only a test key.
- [ ] Account Setup and Admin direct provisioning create each Stripe test
      customer in one request with a reusable test PaymentMethod, a complete
      billing address, and `invoice_settings.default_payment_method`.
- [ ] Delivery method and Stripe account are compatible.
- [ ] Every Metronome billing-provider payload sends exactly one of
      `delivery_method_id` or `delivery_method`, preferring the resolved ID.
- [ ] Stripe-backed B2B billing configurations use `send_invoice`; Pro and
      Quickstart continue to use `charge_automatically`.
- [ ] Stripe-backed Quickstart and B2B commitments are not created with an
      inline Stripe payment gate; Metronome only allows Stripe-gated commits
      through a post-contract `contracts/edit` operation.
- [ ] Customer billing configuration links successfully.
- [ ] If `tax_provider: stripe` is unavailable, the supported retry removes the
      tax provider rather than abandoning customer setup.
- [ ] Credit purchase/top-up creates the intended invoice-gated action.
- [ ] Credit purchase still offers the existing invoice flow plus Stripe
      Checkout. Checkout uses a `metronome_commit`, starts on the current UTC
      hour, expires in 90 days, and does not report success until the new commit
      is visible on the Metronome contract.
- [ ] Checkout sends `applicable_metronome_product_tags: ['usage']`; the
      invoice purchase path sends `applicable_product_tags: ['usage']`.
      Purchased credits apply to usage products and never subscription lines.
- [ ] A purchased or auto-top-up commit augments total active credits without
      replacing the monthly plan-credit category. Non-B2B Usage Pacing shows
      available top-up credits separately and compares its forecast and project
      bar with total active credits; pending/unpaid purchases do not count.
- [ ] Credit Purchase Checkout setting offers `form` and `hosted_page`;
      `elements` and `embedded_page` are selectable but clearly noted as
      falling back to `form`. Form supports selectable compact multi-step and
      expanded single-page layouts, while hosted Checkout returns to Usage and
      waits for the Metronome commit before refreshing balances.
- [ ] Checkout credit purchase uses automatic billing address collection and
      enables automatic tax with exclusive tax behavior and a tax code. An
      applicable Stripe Tax registration is present when validating a nonzero
      tax amount.
- [ ] AI Builder Checkout amounts are fiat minor units without `credit_type_id`;
      Generation amounts are native credits with its custom credit type ID.
- [ ] Finalize/pay is used only for intended Stripe test invoices.
- [ ] Cleanup deletes only recorded starter-owned Stripe customers.

## Admin, starter, and inspector

- [ ] No starter mode is selected by default.
- [ ] Starter modes remain visible but disabled until an explicit Metronome key
      is entered.
- [ ] Account Setup, Demo Customers, and Customer Cleanup each link back to the
      Admin tools page.
- [ ] AI Builder can plan/seed/reset on a blank target account without legacy
      Demo Hub packages.
- [ ] With both modes selected, either mode can run independently or
      concurrently; one mode's failure leaves the other untouched and retryable.
- [ ] AI Builder starter usage remains USD cents; Generation starter usage
      remains Generation Credits.
- [ ] Each mode creates exactly one Pro, Quickstart, and B2B starter customer
      with one active starter contract.
- [ ] Demo-data reset retains catalog/packages. Full reset removes demo data
      before mode-owned packages, rate cards, products, and metrics.
- [ ] Preview performs no mutation.
- [ ] API keys remain memory-only and are never written to `.env` or state.
- [ ] Account Setup/reset accepts only explicit credentials and cannot silently
      fall back to Tools Panel or server environment keys.
- [ ] Entering a Stripe test key enables Stripe-assisted setup automatically;
      explicitly unchecking it still permits a Metronome-only run.
- [ ] Demo customer seeding and cleanup explicitly select either the configured
      demo environment or another account.
- [ ] Configured demo credentials resolve Tools Panel overrides before server
      environment variables; explicit mode rejects missing explicit keys.
- [ ] Admin target verification displays only safe identity metadata, and
      cleanup confirmation names the selected target.
- [ ] Combined group keys satisfy pricing and presentation dimensions.
- [ ] Reset removes aliases before customer archival.
- [ ] Reset preview excludes unrelated account resources.
- [ ] Reseed works after reset despite archived uniqueness keys.
- [ ] Duplicate active contracts stop with a clear reset/review instruction.
- [ ] Account Setup exposes no arbitrary custom-property editor.
- [ ] AI Builder uses only canonical `model × processing_tier` pricing.
- [ ] Generation always includes `service_tier=standard|priority` on metric
      filters/group keys, product pricing keys, rates, and seeded events.
- [ ] Fixed/subscription products, credit units, package terms, commits, and
      seat allocations do not gain pricing dimensions.
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
