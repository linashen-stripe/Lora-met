# Repeatable billing experiments

Billing experiments live under `scripts/experiments/`. They share this
repository's Node version and Metronome SDK, but remain separate from the web
application and demo seeders.

## Safety contract

- Commands use only `.env.metronome-target.local`; they never read or edit
  `.env`.
- The default command is a dry run.
- Every applied run uses unique names, aliases, transaction IDs, and
  uniqueness keys.
- State contains resource IDs and evidence only, never API keys. It is written
  under the ignored `.metronome/experiments/` directory with owner-only file
  permissions.
- Cleanup requires typed confirmation and archives only IDs recorded in that
  experiment's state. Metronome invoices and archived objects remain in account
  history.
- Always use a sandbox account and a fresh experiment customer.

Create the ignored credential file if it does not already exist:

```dotenv
# .env.metronome-target.local
METRONOME_API_KEY=...
```

## Credit lifecycle experiment

This experiment answers two questions:

1. On an open-ended contract, does usage after plan cancellation consume an
   unexpired 60-day prepaid top-up after the final plan credit expires?
2. If a fixed-term contract ends before that top-up's access schedule, can the
   old top-up cover usage rated on an open-ended replacement contract?

The fixture has no subscriptions or recurring charges. It creates a one-time
plan credit and a one-time prepaid top-up, uses hour-aligned historical
timestamps, and ingests deterministic usage after the cancellation/transition.
The replacement contract intentionally has no transition rollover: the test is
whether the old contract-level top-up survives on its own.

```bash
# Print the planned isolated fixture; no API writes
npm run experiment:credit-lifecycle

# Create the fixture, ingest usage, poll balances, and print the verdict
npm run experiment:credit-lifecycle -- --apply

# Re-read balances and print the verdict again
npm run experiment:credit-lifecycle -- --check

# Preview cleanup; no API writes
npm run experiment:credit-lifecycle -- --cleanup

# Archive only resources recorded for this experiment run
npm run experiment:credit-lifecycle -- \
  --cleanup --confirm=credit-lifecycle-experiment
```

The open-ended case is the control. It must show a top-up balance reduction
before the ended-contract result is trusted.

Ended-contract output is interpreted as:

- `USABLE_AFTER_END`: the old top-up balance decreased after post-transition
  usage.
- `NOT_USABLE_AFTER_END`: the old top-up balance did not decrease, or was
  already zero after the contract ended.
- `CONTRACT_CREATION_REJECTED`: Metronome rejected the historical fixed-term
  fixture. Inspect the printed error before deciding whether the date shape or
  extended top-up schedule caused the rejection.
- `INCONCLUSIVE`: required balance evidence was unavailable or the control did
  not settle during the polling window.

If an applied run fails partway through, its IDs are retained for confirmed
cleanup. Do not manually reuse or edit the experiment state.

## Integration Q&A verification

This suite verifies the observable parts of the Metronome integration Q&A:
credit priority and expiry ordering, contract-edit grants and idempotency,
invoices without a billing provider, delayed event timestamps, archived-credit
fallback, atomic ingest validation, and Stripe-independent operation.

```bash
# Dry-run fixture plan
npm run experiment:integration-qa

# Create isolated fixtures and print sanitized requests and evidence
npm run experiment:integration-qa -- --apply

# Refresh balance evidence and print the report
npm run experiment:integration-qa -- --check

# Preview and then confirm cleanup
npm run experiment:integration-qa -- --cleanup
npm run experiment:integration-qa -- \
  --cleanup --confirm=integration-qa-experiment
```

The suite waits for fresh catalog propagation before ingesting usage and polls
for balance or invoice evidence. A `200` ingest response proves acceptance, not
rating; drawdown conclusions require the printed balance transition or applied
invoice line.

The CLI prints the exact API sequence and sanitized evidence for each run.
Keep dated sandbox reports and customer-specific investigation notes outside
version control; the reusable procedure belongs here and in the experiment
source.

## Adding another experiment

Create another script in `scripts/experiments/` and reuse
`scripts/experiments/lib/harness.ts` for:

- dry-run/apply/check/cleanup argument parsing;
- API-key-scoped state paths;
- protected state writes;
- deterministic transaction IDs;
- polling.

Keep each experiment's namespace, confirmation phrase, state type, ownership
boundary, and cleanup routine explicit. Experiments must not depend on Lora
demo customers or starter-owned resources.
