# Metronome Starter Kit CLI

This is an isolated, Metronome-only starter flow. It does not modify or reuse
the existing Lora-named catalog, and it does not create Stripe customers,
billing-provider configurations, delivery methods, or Stripe-delivered
invoices.

## Credentials

Create the ignored file `.env.metronome-target.local`:

```dotenv
METRONOME_API_KEY=...
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
page includes an optional custom pricing-property editor.

## Custom pricing property

A starter catalog can include one custom event property with two to four
values, rate multipliers, and an Image/Video/3D scope. For example, this creates
`service_tier: standard | priority` on all three usage products:

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

- Enterprise Quickstart: a 12-month, $1,000 prepaid commitment for 100,000
  Generation Credits.
- Pro: a $20 monthly subscription with 1,000 recurring monthly Generation
  Credits.
- B2B Power User: 1,000,000-credit / $10,000 annual prepaid commitment,
  five assigned seats at $1,000 per month, 10,000 monthly credits per seat,
  a 0.85 usage multiplier, and a seat-rate override.

All personas receive deterministic image, video, and 3D Generation usage with
model, quality, operation, workspace, project, and user dimensions. Transaction IDs
are deterministic, so reruns within Metronome's deduplication window do not
double-count usage.

Because this starter intentionally creates no billing-provider configuration,
its invoices stay in Metronome. Connect and configure a billing provider
separately if the target account should collect payment externally.

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

After a successful seed, IDs are written under
`.metronome/starter/<account-scope>/state.json`. `.metronome/` is ignored by
git, and the account scope is a one-way API-key fingerprint; credentials are
never written to state.

The admin page includes a collapsed **Review starter configuration** section
with the resolved metrics, base rates, package terms, customer names, usage
volume, custom-property variants, and optional JSON.
