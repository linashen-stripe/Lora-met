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
current job and is never written to local storage or an environment file.

Add `-- --time-based-pricing` to plan or seed to include a `time_band`
dimension and separate peak/off-peak rates:

```bash
npm run starter:plan -- --time-based-pricing
npm run starter:seed -- --time-based-pricing
```

The defaults are `America/Los_Angeles`, with peak defined as weekdays from
09:00 inclusive to 17:00 exclusive. Peak rates are 1.25 times the base rate;
off-peak rates are 0.8 times the base rate. Seeded events calculate
`time_band` from each event timestamp in that explicit timezone.

Do not switch an existing starter namespace between standard and time-based
pricing. Billable metric and product dimensions are immutable enough that the
CLI intentionally reports the incompatible definition. Reset the starter
namespace first, or use a fresh target account.

## Seeded personas

- Enterprise Quickstart: a one-month, $1,000 prepaid commitment for 100,000
  Generation Credits.
- Pro: a $20 monthly subscription with 1,000 recurring monthly Generation
  Credits.
- B2B Power User: 1,000,000-credit / $10,000 annual prepaid commitment,
  five seats at $1,000 per month, 10,000 monthly credits per seat, and a 0.85
  usage multiplier.

All personas receive deterministic image and video Generation usage with
model, operation, workspace, project, and user dimensions. Transaction IDs
are deterministic, so reruns within Metronome's deduplication window do not
double-count usage.

Because this starter intentionally creates no billing-provider configuration,
its invoices stay in Metronome. Connect and configure a billing provider
separately if the target account should collect payment externally.

## Ownership and state

Resource names, ingest aliases, package uniqueness keys, and contract
uniqueness keys are namespaced with `metronome-starter`. Reset discovers only
those exact resources and archives only starter-created contracts and
customers before archiving the starter catalog. Custom pricing units are
retained because they are shared account resources.

After a successful seed, IDs are written under
`.metronome/starter/<account-scope>/state.json`. `.metronome/` is ignored by
git, and the account scope is a one-way API-key fingerprint; credentials are
never written to state.
