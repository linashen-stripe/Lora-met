# Metronome Starter Kit CLI

This starter and the Generation app use the same canonical manifest,
`config/metronome/starter-kit.json`. The configurable resource prefix defaults
to `Generate`. Metronome-only remains the default; Stripe test billing is
optional.

## Credentials

Create the ignored file `.env.metronome-target.local`:

```dotenv
METRONOME_API_KEY=...
# Optional full billing seed:
STRIPE_SECRET_KEY=sk_test_...
METRONOME_DELIVERY_METHOD_ID=...
```

The starter npm scripts only load this file. They do not read or modify `.env`.

## Commands

```bash
# Inspect the target account and print the exact create plan (no writes)
npm run starter:plan

# Create/reuse the catalog, packages, personas, contracts, and usage
npm run starter:seed

# Preview only the starter-owned resources that reset would archive
npm run starter:reset

# Apply the namespace-scoped reset after reviewing the preview
npm run starter:reset -- --confirm=metronome-starter
```

The same workflow is available in the app under **Settings → Admin: seed a
new account**. The API key entered there is kept only in page memory for the
current job and is never written to local storage or an environment file. The
page includes an optional custom pricing-property editor, resource prefix, and
Stripe-assisted test-billing controls. Keys remain in page memory and are never
written to browser storage or `.env`.

## Custom pricing property

The canonical catalog includes `service_tier: standard | priority` on all
three usage products, with `1×` and `1.25×` multipliers. The admin editor can
review or customize this property before seeding.

The base pricing dimensions remain separate: `operation`, `quality`, and
`model`. The custom property is appended as an additional dimension; it does
not encode quality into model names.

```bash
npm run starter:plan -- \
  --pricing-property=service_tier \
  --pricing-values=standard:1,priority:1.25 \
  --pricing-metrics=image,video,3d

npm run starter:seed -- \
  --pricing-property=service_tier \
  --pricing-values=standard:1,priority:1.25 \
  --pricing-metrics=image,video,3d
```

The property is added only to the selected billable metrics, usage products,
rates, and seeded events. It does not change packages, contracts, customers,
subscriptions, credits, or commitments.

Each starter billable metric uses one combined group key containing its pricing
dimensions plus `workspace_id`, `project_id`, and `user_id`. This keeps the
starter easy to inspect while satisfying both product pricing and presentation
keys. Add alternate group keys later only when the account needs additional
aggregation paths.

Add `--validate-config` to the same arguments to print the resolved product
group keys and rate variants without credentials or API calls.

`time_band` can be modeled in the same way:

```bash
npm run starter:plan -- \
  --pricing-property=time_band \
  --pricing-values=off_peak:0.8,peak:1.25 \
  --pricing-metrics=image
```

The starter distributes property values deterministically across example
events. Metronome does not infer `peak`, `priority`, or other values: a
production event producer must classify the event and send the property.
The Generation playground exposes Standard/Priority controls and sends the
selected `service_tier` value on every event.

Billable metric and product dimensions cannot be safely repurposed in place.
To change or remove a property after seeding, preview and run Starter Reset
with the same resource prefix, then seed the new definition.

If a seed stops after creating billable metrics but before creating products,
use the same reset flow before retrying. Reset archives the partial metrics;
the shared custom pricing unit is intentionally retained and reused.

## Packages and seeded personas

The reusable package catalog contains Free (100 one-time credits), Pro, and
Enterprise Quickstart. The B2B Power User is intentionally not a package; it is
created as a negotiated direct contract.

One Generation Credit converts to one USD cent. Metronome's
`fiat_per_custom_credit` value is therefore `1` because fiat pricing units use
minor units; `0.01` would mean one-hundredth of a cent.

- Enterprise Quickstart: a 12-month, $1,000 prepaid commitment for 100,000
  Generation Credits.
- Pro: a $20 monthly subscription with 1,000 recurring monthly Generation
  Credits, plus a native threshold recharge below 50 credits back to 500.
- B2B Power User: 1,000,000-credit / $10,000 annual prepaid commitment,
  five assigned seats at $1,000 per month, 10,000 monthly credits per seat,
  a 0.85 usage multiplier, and a seat-rate override. Seeded utilization targets
  approximately 150%, 70%, 45%, 25%, and 10% of each seat allocation. The
  busiest seat has enough headroom beyond the 15% discount to exhaust its
  monthly credits and spill into the shared annual commitment; the other seats
  retain clearly different balances.

The per-seat recurring credits use priority `50`, matching the Admin power-user
flow. The annual commitment keeps Metronome's default priority so usage is
attributed to and consumes each individual seat allocation before the shared
annual pool.

All personas receive deterministic image, video, and 3D Generation usage with
model, quality, operation, workspace, project, and user dimensions. Transaction IDs
are deterministic, so reruns within Metronome's deduplication window do not
double-count usage.

In Metronome-only mode, invoices stay in Metronome and the Pro threshold
recharge uses `payment_gate_type: NONE`.

With a Stripe test key, the starter first verifies the key is test mode and
that its Stripe account ID matches the selected Metronome delivery method. If
several Stripe methods are connected, explicitly provide
`METRONOME_DELIVERY_METHOD_ID` or select it in the admin page. The starter then:

- creates one state-owned Stripe test customer and default test card per persona;
- links each Metronome customer with the existing tax-provider fallback;
- routes package and direct contracts through the linked billing configuration;
- creates Pro with a Stripe invoice payment gate; and
- finalizes and pays generated test invoices when they become available.

Do not put a live Stripe key in this flow; only `sk_test_` keys are accepted.
Switching an existing seed between billing modes requires reset and reseed
because the package payment gate is part of the package definition.

## Ownership and state

Ingest aliases, package uniqueness keys, and contract uniqueness keys are
namespaced with `metronome-starter`; catalog resources are matched by the
configured resource prefix and exact names. Reset archives matching contracts
and customers before archiving the starter catalog. Custom pricing units are
retained because they are shared account resources.

Customer ingest aliases include the starter catalog version. Before archiving
a customer, reset removes all `metronome-starter:` aliases so Metronome releases
them for future seeds. This removal happens before customer archival because
aliases on archived customers remain reserved.

Metronome keeps archived package and contract uniqueness keys reserved. New
packages and contracts therefore receive run-scoped suffixes while active
resources from a partial seed are reused. This allows reset and reseed to work
repeatedly without colliding with archived keys.

Active contracts are matched by both uniqueness key and their expected
contract-name/rate-card identity because package-provisioned contracts do not
always expose the supplied uniqueness key consistently in list responses.
Seeding stops with a reset instruction if duplicate active starter contracts
are detected; it never guesses which contract to archive.
Reset archives every active contract on a customer carrying a starter ingest
alias, so contracts that omit their uniqueness key are still cleaned up.

After a successful seed, IDs are written under
`.metronome/starter/<account-scope>/state.json`. `.metronome/` is ignored by
git, and the account scope is a one-way API-key fingerprint; credentials are
never written to state. Stripe-assisted runs journal the Stripe account,
delivery method, owned customer IDs, billing configurations, and completion
checkpoints after each cross-system step so a partial run can resume.

Reset always previews both systems. Confirmed reset archives starter-owned
Metronome contracts/customers/catalog resources. When the matching Stripe test
key is supplied, it also deletes only Stripe customer IDs recorded in state.
Finalized Stripe test invoices remain historical and cannot be made unpaid.

The admin page includes a collapsed **Review starter configuration** section
with the resolved metrics, base rates, package terms, customer names, usage
volume, custom-property variants, and optional JSON.
