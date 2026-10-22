# Demo product and billing requirements

This is the durable product/design source of truth for the unified Metronome
demo. It consolidates decisions made while building the demo. When this
document conflicts with an old package, customer, screenshot, or archived
resource, this document and the canonical configuration files win.

## Goals

- Demonstrate two distinct monetization models in one application:
  - **AI Builder** — token usage priced in USD, with USD-denominated credits.
  - **Generation** — image, video, and 3D usage priced in custom
    `Generation Credits`.
- Support an end-to-end self-serve story: pricing → Free signup → usage
  exhaustion → Pro upgrade → paid usage and invoice.
- Support prepared Enterprise and negotiated B2B stories without forcing a
  presenter to construct contracts manually.
- Make Metronome and optional Stripe API activity inspectable for learning.
- Allow a shared test account to be safely seeded, reset, and reseeded without
  touching unrelated resources.

## Global experience

- The active demo mode is selected in the left Tools panel.
- Home, pricing, playground, account, usage, and seeded-customer behavior must
  follow the selected mode. Content from one mode must not appear in the other.
- The primary home action and the Free pricing action both lead to a simple
  signup page with a prefilled email, then to the selected playground.
- Customer sessions, playground state, package lookup, and ingest aliases are
  mode- and customer-scoped. A newly created or selected customer must never
  inherit another customer's local progress.
- Seeded-persona shortcuts may create/load prepared customers, but ordinary
  signup stays simple. Persona shortcuts land on **Plans & Billing**.
- While a new prepared persona is ingesting historical usage, Plans & Billing
  shows visible progress and refreshes automatically when seeding completes.
  Playground prompts do not show this background-seeding status.
- Historical usage seeding uses batched, higher-quantity events rather than a
  cross-product of tiny events. It must retain coverage for time, product,
  model, processing/service tier, project, and user/seat dimensions and should
  normally complete in about 10 seconds.
- A prepared customer's Healthy, At-Risk, or Late-month Spike usage profile is selected before
  creation and seeded exactly once. Usage is immutable and additive, so Admin
  must not present post-creation "reseed" controls that silently combine
  stories; create a fresh customer to compare another story.
- Naming exposed to users is `AI Builder`, `Generation`, `Free`, `Pro`,
  `Enterprise Quickstart`, and `Enterprise`. Do not expose internal catalog
  versions such as `v3`, the old `Premium` name, or unexplained `Lora` prefixes
  in generic seeded resources.
- New demo customers include a compact mode-and-persona prefix:
  `[Generate - Free|Pro|Quickstart|B2B]` or
  `[AI Builder - Free|Pro|Quickstart|B2B]`. Existing customers are not renamed.

## AI Builder model

### Packages

- **AI Builder Free**
  - One-time `$5.00` USD credit.
  - The demo's first two prompts consume the trial.
- **AI Builder Pro**
  - `$20/month`.
  - `$20` recurring monthly USD credit.
  - Optional customer-configured auto top-up defaults to threshold `$5` and
    recharge-to `$15`.
- **AI Builder Enterprise Quickstart**
  - `$2,500` prepaid commitment.
  - Twelve-month term.
- **AI Builder B2B Power User**
  - Preserve the existing negotiated direct-contract structure, including
    commitment, five seats, rate override, and multi-seat usage.
  - Seat IDs are neutral sample user identities; “power user” is demonstrated
    by usage rather than embedded in every seat name.
  - Current-period usage is intentionally uneven: exactly one seat exhausts its
    monthly allocation and spills into the shared commitment.
  - The four other seats retain distinct, nonzero balances. Seed targets are
    based on the monthly seat allocation, never the annual shared commitment.

Canonical packages may be created from the account's legacy `Free`, `Premium`,
and `Enterprise` packages. Legacy names are compatibility inputs, not preferred
UI names.

### Usage and expected Free → Pro flow

- Usage is token-based and remains USD-denominated.
- The chat area is fixed-height and scrollable; adding messages must not make
  the page grow indefinitely.
- Spend and available credit are distinct:
  - Available credit is the current entitlement.
  - Story spend is the cumulative local demo usage.
- Two Free prompts consume `$5.25` in total and visibly exhaust the `$5.00`
  credit.
- The upgrade prompt appears when an unpaid/Free contract reaches zero; it must
  not appear for an active Pro or Enterprise contract.
- After upgrade, only the next paid prompt belongs on the Pro invoice:
  `0.3M` input tokens, `0.2M` output tokens, `$3.90`, leaving `$16.10`.
- Local optimistic deduction prevents a stale Metronome read from restoring
  credit while ingestion catches up.

## Generation model

The canonical source is `config/metronome/starter-kit.json`; application
pricing and starter-account seeding must evolve together.

### Pricing unit and products

- Custom pricing unit: `Generation Credits`.
- Conversion used for billing: `1 Generation Credit = $0.01`.
- Customer-facing product tables show credit costs, not the USD conversion.
- Modalities are image, video, and 3D.
- Base dimensions remain independent:
  `operation`, `quality`, and `model`.
- Generation always uses Standard/Priority `service_tier` pricing so seeded
  target accounts match the live demo event producer.
- Neutral model IDs are `vision-2`, `motion-1`, and `mesh-3`; do not include
  `Lora` or `Generate` in model IDs.
- Each billable metric currently uses one combined group key containing its
  pricing dimensions plus `workspace_id`, `project_id`, and `user_id`.
  `user_id` and `project_id` can both be presentation dimensions; their order
  does not change event pricing.

### Generation credit costs

Base Standard-tier costs:

- Standard image: 10 credits.
- Ultra image: 50 credits.
- Standard video: 5 credits/second; the playground's 10-second job is 50.
- Ultra video: 10 credits/second; the playground's 10-second job is 100.
- Standard 3D: 20 credits.
- Ultra 3D production bundle: 50 credits.

Priority applies the `1.25×` multiplier.

### Packages and personas

- **Free**
  - `$0`.
  - 100 one-time Generation Credits.
- **Pro**
  - `$20/month`.
  - 2,000 recurring monthly Generation Credits.
  - Ordinary Pro customers do not receive auto top-up automatically.
- **Enterprise Quickstart**
  - A predefined package, not generic “Custom price”.
  - `$1,000` prepaid commitment for 110,000 Generation Credits, a 10% credit
    bonus over pay-as-you-go value.
  - Twelve-month term starting at contract start.
- **Enterprise**
  - A custom sales-led presentation for negotiated terms.
- **B2B Power User**
  - A negotiated direct contract, not a reusable package.
  - Twelve-month, 1,000,000-credit / `$10,000` prepaid commitment.
  - Five seats at `$1,000/month`.
  - When Stripe-backed, invoices use `send_invoice`; the Stripe integration's
    configured due-date setting supplies the payment term.
  - 10,000 recurring monthly credits per seat.
  - `0.85` usage multiplier (15% discount).
  - Seat IDs are neutral sample user identities; “power user” is demonstrated
    by usage rather than embedded in every seat name.
  - Usage is intentionally uneven. One seat exceeds its allocation and consumes
    shared commitment; exactly one seat should exhaust its allocation and use
    the shared commitment while the other seats retain visibly different,
    nonzero balances.
  - Generation Late-month Spike is the deliberate exception: two seats exceed
    their allocations after the 15% discount and draw from shared commitment.
  - Seed targets are computed in Generation Credits after the `0.85` negotiated
    multiplier. Event quantities remain whole jobs or whole seconds; list-rate
    usage is derived from the desired post-discount balance consumption.

Seeded personas are Enterprise Quickstart, Pro, and B2B Power User. Seeded Pro
may include a threshold below 500 credits that recharges to 1,500 because it is
a prepared demonstration. That threshold must not be embedded in the reusable
Pro package or automatically applied to ordinary signups.

Pricing card order is Free, Pro, the predefined Enterprise Quickstart, then
custom Enterprise. Package card titles omit redundant `Generate` prefixes.

### Playground

- Users can select image, video, or 3D, Standard/Priority service tier, and
  `1×`, `5×`, or `10×` batches.
- Events include operation, quality, model, unit, `service_tier`,
  `workspace_id`, `project_id`, and `user_id`.
- Local credit is reserved before work, restored if ingest fails, and retained
  as pending until Metronome reports an equal or lower balance.
- Free starts at 100 and the intended demo can consume `100 → 50 → 0`.
- Exhaustion opens the mode-specific Pro upgrade prompt.

## Contracts and transition boundaries

- Contract subscriptions and recurring terms anchor on contract start, not the
  first day of the month.
- Proration is disabled for the intended package transitions.
- Exact-time transitions are attempted first.
- Until the target account has Metronome's millisecond-boundary capability,
  the temporary compatibility fallback:
  1. starts Free at the preceding hour boundary;
  2. timestamps synthetic Free usage at minute `:59` of the preceding hour;
  3. ends Free and starts Pro at the current hour boundary; and
  4. timestamps paid usage at its real event time.
- Remove this fallback once the target account accepts exact-time boundaries.
  It must not remain as permanent billing logic.
- Do not add a transition credit to conceal wrongly attributed usage. Correct
  event/contract attribution is required.
- A future-scheduled contract left by an older fallback may be archived and
  replaced only when it has no usage/invoice history.

## Balances, invoices, and reconciliation

- Metronome remains the billing source of truth; local optimistic balances keep
  it out of the request hot path and provide immediate UX.
- Do not poll `getNetBalance` on every usage event. Use local deductions,
  threshold webhooks as reconciliation signals, and periodic/focus refresh.
- Contract balance reads and invoice breakdowns may arrive at different times.
  A stale read must never restore already consumed local credit.
- Subscription-only invoice lines do not consume included credit.
- Draft usage lines may lower displayed availability before the contract
  balance catches up.
- Generation custom-credit values are never displayed as fiat. AI Builder USD
  values are never displayed as Generation Credits.
- Upcoming invoices may include separate USD and custom-credit sections; never
  add unlike credit types into one total.
- Applied monthly credits are an adjustment, not a product filter option.
- Metronome draft invoices stay in Upcoming. Where the demo needs a Stripe test
  invoice, the app may finalize and pay it through the API.

## Credit purchase and auto top-up

- Credit purchase keeps the Metronome invoiced-commit option and also offers
  Stripe Checkout using a `metronome_commit` item. The Tools panel selects
  `form` or `hosted_page`; Form layout is independently selectable as
  `compact` (multi-step, default) or `expanded` (single page). `elements` and
  `embedded_page` remain selectable for future demos but fall back to `form`
  until supported by this preview. Checkout purchases start on the current UTC
  hour, expire after 90 days, and provide preset plus custom amounts and volume
  discounts.
- Checkout completion is not itself an entitlement signal. The UI waits until
  the purchased commit is visible on the Metronome contract before refreshing
  the balance or reporting completion.
- Both purchase paths restrict purchased credits to Metronome products tagged
  `usage`; purchased credits must never offset subscription or other recurring
  invoice lines.
- Purchased and auto-top-up balances augment the wallet without replacing the
  underlying monthly plan-credit category. Non-B2B Usage Pacing and project
  capacity compare against total active credits and show available top-up
  credits separately. B2B keeps monthly seat credits as its chart baseline and
  the shared commitment as a separate off-scale category.
- Usage Pacing and project breakdowns use the same active monthly period,
  anchored to the contract start date rather than calendar-month boundaries.
  Usage Pacing shows the current available balance instead of extrapolating a
  forecast from intentionally shaped demo history.
- Checkout enables automatic tax, uses automatic billing-address collection,
  exclusive tax behavior, and a tax code. Tax collection still depends on
  Stripe Tax being configured with an applicable active registration.
- Checkout redisplays eligible saved payment methods and enables saving and
  removing them so the Stripe-rendered replacement experience can be tested.
  Removing a method detaches it from the Stripe customer and can affect later
  invoice collection.
- Generation purchase minimum is 500 credits; presets are 1,000 for `$10` and
  2,500 for `$25`.
- Checkout credit purchases apply 5% from 2,000 units and 10% from 5,000
  units. Because tier upper bounds are inclusive, the API boundaries are 1,999
  and 4,999. The same boundaries apply to Generation Credits and AI Builder
  USD cents because each unit represents `$0.01`.
- AI Builder uses USD amounts.
- The effective contract credit type determines semantics. A legacy Generation
  contract using `USD (cents)` must keep fiat behavior rather than being treated
  as a custom-credit wallet.
- Auto top-up edits the contract prepaid-balance threshold configuration.
- Metronome requires a threshold worth at least `$5` and a recharge target
  worth at least `$10` more. For Generation's `$0.01` conversion, that means a
  threshold of at least 500 credits and a target at least 1,000 credits higher.
- Stripe-assisted auto top-up uses an invoice payment gate. Metronome-only
  starter mode uses no payment gate.
- Setup and cancellation must visibly report API failures and refresh the
  contract state.
- The dashboard Payment Method card allows replacement through a setup
  Payment Element. A successful replacement becomes the Stripe customer's
  invoice default before the prior default method is detached.

## Account starter and Admin

- **Settings → Admin** is one mode-independent hub with:
  1. account/catalog setup;
  2. demo-customer seeding; and
  3. customer/environment cleanup.
- Account Setup selects AI Builder, Generation, or both explicitly; no mode is
  selected by default. With both selected, the modes remain independent and
  may seed concurrently.
- Each selected mode has an independent prefix, review, preview, seed status,
  ownership journal, and reset scope.
- AI Builder starter setup must work on a blank target account and create its
  token catalog, packages, Pro/Quickstart/B2B personas, deterministic usage,
  and optional Stripe linkage. It must not depend on legacy Demo Hub packages.
- AI Builder continues to use USD cents and canonical `processing_tier`.
  Generation continues to use custom Generation Credits. Shared setup code
  must never convert or combine the two units.
- AI Builder usage events must include every property required by the
  canonical metric filters: `api_product`, `model`, `processing_tier`,
  `workspace_id`, `project_id`, and `user_id`. Ingest acceptance alone does
  not prove that an event was rated.
- AI Builder seed transaction IDs include an explicit event-schema revision.
  Retries within one revision remain idempotent and continue missing batches;
  bumping the revision allows corrected events to replace previously accepted
  but unrated event shapes without resetting contracts.
- Prepared Pro and Quickstart customers use a single actor with representative
  product/model/tier/project history and retain a nonzero plan balance.
  B2B uses the five contract seat IDs and explicit per-seat targets. Generic
  pool-percentage seeding must never be applied to a B2B commitment.
- Generation historical usage is distributed across bounded daily events;
  aggregation must not place most of a persona's consumption in one event.
- Account Setup and login/Admin customer creation call the same mode-specific
  historical usage seeders. Account bootstrap must not maintain a second event
  generator with independent target, unit, or seat-distribution logic.
- Prepared-customer flows do not report completion from ingest acceptance
  alone. Account Setup, checkout-created Pro/Quickstart, and deferred B2B
  creation check balances at five-second intervals (for at most 30 seconds)
  and require at least 98% of expected consumption. Generation Account Setup
  retains its aggregation grace because its quantities already reach their
  intended targets.
- Seeded Pro and Quickstart contracts start at midnight UTC 28 days before
  creation so their complete history remains inside Metronome's approximately
  34-day usage backdating window.
- B2B is deliberately different: its contract, annual commit, subscription,
  recurring credits, and discount start together on the first of the previous
  month. Its usage is seeded only in the current calendar month so it consumes
  the currently active monthly per-seat credits before spilling into commit.
  B2B subscriptions remain non-prorated.
- Account Setup defaults every prepared customer to Healthy. Prepared Pro
  Healthy deterministically varies between 46–49% of its current monthly grant
  and must not trigger auto top-up. At-Risk varies between 81–87%, crossing AI
  Builder Pro's `$5` threshold; Late-month Spike varies between 89–94% with
  usage concentrated near the end of the seed window. Variation is stable per
  customer so retries remain idempotent. All three profiles are available for
  AI Builder and Generation.
- Quickstart is a 12-month commitment, so its target follows elapsed term
  progress rather than a fixed pool percentage. Because demo usage can only be
  backdated about 34 days, the visible floors start at 10% Healthy, 15% At-Risk,
  and 12% Late-month Spike, with a stable per-customer 0.4–2 percentage-point
  offset to avoid unnaturally round totals.
- AI Builder Pro pacing uses only its current `$20` monthly grant. Future
  recurring grants and the prepared `$15` auto-top-up commit can appear in the
  same contract response but must not increase the seed target.
- Generation Pro pacing uses only its 2,000-credit monthly plan grant. The
  pre-created 1,500-credit auto-top-up commit is excluded from the seed target
  and remains untouched until the monthly grant is depleted by later usage.
- Usage Pacing labels contract-term commitments as prepaid commitments, never
  monthly commitments. For B2B, monthly usage is compared with the active
  per-seat monthly credits while the shared contract commitment is displayed
  separately. A distant term-level commitment must not flatten the usage chart
  Y-axis; off-scale commitments remain in summary cards rather than reference
  lines.
- Account Setup does not add arbitrary pricing properties. AI Builder keeps
  canonical `processing_tier`; Generation keeps canonical `service_tier`.
- Power-user creation asks which mode to seed; cleanup does not need a mode.
- Target Metronome and optional Stripe test keys are entered explicitly and
  retained only in memory. Never copy, clear, or overwrite `.env`.
- Metronome-only is the default. When a valid `sk_test_` key and matching
  delivery method are supplied, seed linked Stripe test customers, default
  payment methods, billing configurations, and test invoices.
- Plans and subscriptions are represented by Metronome packages and contracts.
  The app must not query or create Stripe Billing V2 pricing plans or pricing
  plan subscriptions. Stripe remains responsible for customers, payment
  methods, and invoices exported by Metronome.
- Only Stripe test keys are accepted.
- Starter operations support preview, apply, restart-safe state, and scoped
  reset.
- Reset removes starter ingest aliases before archiving customers, archives
  starter-owned contracts/customers/catalog resources, and deletes only Stripe
  customer IDs recorded in starter state. It must not touch unrelated account
  resources.
- Archived Metronome uniqueness keys remain reserved; reseeding uses safe
  run-scoped keys and reuses only valid active resources.
- Duplicate active starter contracts are an error requiring reset/review; the
  seeder must not guess which contract to keep.
- Account Setup and starter reset always require explicit memory-only target
  credentials and never fall back to Tools Panel or environment keys.
- Entering an explicit Stripe test key enables Stripe-assisted starter billing
  by default; the operator may still opt out for a Metronome-only run.
- Demo customer seeding and customer cleanup require a deliberate choice
  between the configured demo environment and another account. The configured
  environment resolves Tools Panel overrides before server/deployment
  environment variables; another account uses memory-only Admin credentials.
- Admin pages display safe target identity metadata before account mutations,
  and destructive cleanup confirmations identify the selected target.

## API Inspector

- The inspector is an advanced option enabled from Settings.
- It opens as a right-side panel with live search/filtering.
- It captures both browser requests and supported server-side calls to
  Metronome and Stripe during operations such as starter seeding.
- Secrets and sensitive headers must be redacted.
- Traces are scoped to the inspector session and are diagnostic only; they are
  not durable audit logs.

## Operational constraints

- Package manager is npm; local app default is port 3000.
- Do not run nonexistent tests. Required static checks are TypeScript, lint,
  production build, and `git diff --check`.
- Never edit `.env` as part of implementation or verification.
- Always distinguish:
  - modified files in the working tree;
  - a local Git commit;
  - a commit pushed to GitHub; and
  - a tag pushed to GitHub.
- Before risky migrations, create a local commit and, when requested, push/tag
  it as a fallback checkpoint.
- Existing customers retain historical contract terms and ingested usage.
  Validate pricing or attribution changes with a fresh customer after cleaning
  up obsolete test data.

## Rejected, superseded, or deferred

- Do not offer separate “Generic” and “Generation-compatible” starter choices;
  one canonical Generation starter is easier to maintain.
- Do not encode model and quality into one value.
- Do not create a reusable B2B Power User package.
- Do not apply auto top-up to every new Pro customer.
- Do not use a transition credit to work around hour-boundary attribution.
  Synthetic prior-hour timestamps are a temporary compatibility fallback only
  until the target account supports exact-time transitions.
- Do not add quick-fill sample identities to ordinary login; use explicit
  seeded-persona actions.
- Alternate billable-metric group-key sets are deferred until an account needs
  advanced aggregation paths.
- A dedicated B2B account experience is deferred until the Free, Pro, and
  Quickstart flows are stable. The current consumer-style Plans & Billing page
  does not need to fully represent commitments, seat allocations, per-seat
  usage, and pooled balances yet. A future enhancement should consider the
  structure of Metronome's
  [customer billing dashboard example](https://docs.metronome.com/guides/customers-billing/demo-dashboard/app). The reference direction includes
  an overview with spend/remaining/burn KPIs, commitment burndown, usage charts
  by product or metric, and a team/seat section showing individual consumption
  against allocations. Separate Overview, Usage, Users, and Billing views may
  be clearer than forcing the B2B story into the consumer account layout.
- Durable multi-instance webhook reconciliation, production signature
  verification, and a queue/shared cache are production follow-ups, not claims
  made by this single-process demo.
