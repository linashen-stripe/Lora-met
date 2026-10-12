import { after, NextRequest, NextResponse } from 'next/server';
import {
  initializeMetronome,
  getCustomerContractsWithBalance,
  createContract,
  assignContractSeats,
  endActiveCustomerContractsAt,
  restoreOpenEndedContracts,
  resolveMetronomeDeliveryMethodId,
  currentMetronomeHourBoundary,
  isMetronomeHourBoundaryError,
  getStripeCustomerIdFromMetronomeCustomer,
} from '@/utils/metronome';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import initializeStripe from '@/utils/stripe';
import { finalizeAndPayMetronomeInvoice } from '@/utils/stripeInvoiceFinalize';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  try {
    const { metronomeCustomerId } = await params;
    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ contracts: [] });
    }
    const contracts = await getCustomerContractsWithBalance(
      metronome,
      metronomeCustomerId,
    );

    // Compute total ever committed (schedule grants + manual top-ups) from the ledger.
    // This is durable — no in-memory state needed.
    let topUpTotalCents = 0;
    try {
      const balances = metronome.v1.contracts.listBalances({
        customer_id: metronomeCustomerId,
        include_ledgers: true,
        include_balance: true,
      });
      for await (const item of balances) {
        const ledger: any[] = (item as any).ledger ?? [];
        for (const entry of ledger) {
          if (
            entry.type === 'PREPAID_COMMIT_MANUAL' ||
            entry.type === 'CREDIT_MANUAL'
          ) {
            if (entry.amount > 0) topUpTotalCents += entry.amount;
          }
        }
      }
    } catch (ledgerErr) {
      console.warn('[contracts] Could not fetch ledger for topUpTotalCents:', ledgerErr);
    }

    return NextResponse.json({ contracts, topUpTotalCents });
  } catch (error) {
    console.error('Error fetching Metronome contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  try {
    const { metronomeCustomerId } = await params;
    const { packageId, email, upgrade } = await request.json();

    if (!packageId) {
      return NextResponse.json({ error: 'packageId is required' }, { status: 400 });
    }

    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ error: 'Metronome not configured' }, { status: 503 });
    }

    const now = new Date();
    const existingContracts = await metronome.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });
    const matchingContracts = (existingContracts.data ?? []).filter(
      (contract: any) =>
        contract.package_id === packageId && !contract.archived_at,
    );
    const existingActiveContract = matchingContracts.find((contract: any) => {
      const startsAt = contract.starting_at
        ? new Date(contract.starting_at)
        : new Date(0);
      const endsAt = contract.ending_before
        ? new Date(contract.ending_before)
        : null;
      return startsAt <= now && (!endsAt || endsAt > now);
    });
    if (existingActiveContract) {
      return NextResponse.json({ contractId: existingActiveContract.id });
    }

    // Recover from an earlier legacy fallback that scheduled this package at the
    // next hour. It has no usage or invoice yet, so replace it with an immediate
    // current-hour contract.
    for (const contract of matchingContracts) {
      if (contract.starting_at && new Date(contract.starting_at) > now) {
        await metronome.v1.contracts.archive({
          contract_id: contract.id,
          customer_id: metronomeCustomerId,
          void_invoices: false,
        });
        console.warn(
          `[contracts] Archived future scheduled contract ${contract.id} before immediate retry`,
        );
      }
    }

    let startingAt = new Date();

    let endedContractIds: string[] = [];
    if (upgrade === true) {
      try {
        endedContractIds = await endActiveCustomerContractsAt(
          metronome,
          metronomeCustomerId,
          startingAt.toISOString(),
        );
      } catch (endError) {
        if (!isMetronomeHourBoundaryError(endError)) throw endError;
        startingAt = currentMetronomeHourBoundary();
        console.warn(
          `[contracts] Exact-time contract endings are unavailable; retrying at ${startingAt.toISOString()}`,
        );
        endedContractIds = await endActiveCustomerContractsAt(
          metronome,
          metronomeCustomerId,
          startingAt.toISOString(),
        );
      }
    }

    const {
      metronomeDeliveryMethodId,
      stripeCustomerId: headerStripeCustomerId,
    } = withFallbackHeaders(request.headers);
    const stripeCustomerId =
      headerStripeCustomerId ??
      (await getStripeCustomerIdFromMetronomeCustomer(
        metronome,
        metronomeCustomerId,
      ));

    // Ensure the customer has a Stripe billing config before creating the contract.
    const deliveryMethodId = resolveMetronomeDeliveryMethodId(metronomeDeliveryMethodId);
    try {
      let hasStripe = false;
      try {
        const { data: billingConfigs } = await metronome.v1.customers.retrieveBillingConfigurations({ customer_id: metronomeCustomerId });
        hasStripe = billingConfigs?.some((c: any) => c.billing_provider === 'stripe' && !c.archived_at) ?? false;
        console.log(`[contracts] Billing configs for ${metronomeCustomerId}: ${JSON.stringify(billingConfigs)}`);
      } catch {
        console.warn(`[contracts] retrieveBillingConfigurations threw for ${metronomeCustomerId} — will attempt to link`);
      }

      if (!hasStripe) {
        if (stripeCustomerId && deliveryMethodId) {
          console.log(`[contracts] Linking Stripe customer ${stripeCustomerId} via delivery method ${deliveryMethodId}`);
          await metronome.v1.customers.setBillingConfigurations({
            data: [{
              customer_id: metronomeCustomerId,
              billing_provider: 'stripe',
              delivery_method_id: deliveryMethodId,
              configuration: {
                stripe_customer_id: stripeCustomerId,
                stripe_collection_method: 'charge_automatically',
                tax_provider: 'stripe',
              } as any,
            }],
          });
          console.log(`[contracts] Stripe billing config linked successfully`);
        } else {
          console.warn(`[contracts] Cannot link — missing stripeCustomerId (${stripeCustomerId}) or deliveryMethodId (${deliveryMethodId})`);
        }
      }
    } catch (bcErr: any) {
      console.warn(`[contracts] Failed to set billing config:`, bcErr?.message);
    }

    const createdAfter = Math.floor(Date.now() / 1000) - 15;
    let contractId: string;
    try {
      console.log(`Creating contract for customer ${metronomeCustomerId} with package ${packageId} starting ${startingAt.toISOString()}`);
      contractId = await createContract(metronome, {
        metronomeCustomerId,
        packageId,
        startingAt: startingAt.toISOString(),
        preferredDeliveryMethodId: metronomeDeliveryMethodId,
      });
    } catch (contractError) {
      if (isMetronomeHourBoundaryError(contractError)) {
        if (endedContractIds.length > 0) {
          await restoreOpenEndedContracts(
            metronome,
            metronomeCustomerId,
            endedContractIds,
          );
        }

        startingAt = currentMetronomeHourBoundary();
        endedContractIds =
          upgrade === true
            ? await endActiveCustomerContractsAt(
                metronome,
                metronomeCustomerId,
                startingAt.toISOString(),
              )
            : [];
        console.warn(
          `[contracts] Exact-time package transitions are unavailable; retrying at ${startingAt.toISOString()}`,
        );
        try {
          contractId = await createContract(metronome, {
            metronomeCustomerId,
            packageId,
            startingAt: startingAt.toISOString(),
            preferredDeliveryMethodId: metronomeDeliveryMethodId,
          });
        } catch (fallbackError) {
          if (endedContractIds.length > 0) {
            await restoreOpenEndedContracts(
              metronome,
              metronomeCustomerId,
              endedContractIds,
            ).catch((restoreError) => {
              console.error(
                '[contracts] Failed to restore contracts after fallback failure:',
                restoreError,
              );
            });
          }
          throw fallbackError;
        }
      } else {
      if (endedContractIds.length > 0) {
        await restoreOpenEndedContracts(
          metronome,
          metronomeCustomerId,
          endedContractIds,
        ).catch((restoreError) => {
          console.error(
            '[contracts] Failed to restore contracts after upgrade failure:',
            restoreError,
          );
        });
      }
      throw contractError;
      }
    }

    console.log(`Created contract ${contractId}`);

    // Finalize and pay the subscription invoice Metronome creates in Stripe.
    if (stripeCustomerId) {
      try {
        const stripe = initializeStripe(request.headers);
        after(() =>
          finalizeAndPayMetronomeInvoice(
            stripe,
            stripeCustomerId,
            createdAfter,
            'contracts',
          ).catch((err) =>
            console.error('[contracts] Background invoice payment failed:', err),
          ),
        );
      } catch {
        // Stripe not configured — skip
      }
    }

    if (email) {
      try {
        await assignContractSeats(metronome, metronomeCustomerId, contractId, email);
        console.log(`Assigned seats for contract ${contractId}`);
      } catch (seatError) {
        console.warn('Could not assign contract seats (package may not be seat-based):', seatError);
      }
    }

    return NextResponse.json({ contractId });
  } catch (error: any) {
    const message = error?.message || 'Failed to create contract';
    console.error('Error creating Metronome contract:', message);
    return NextResponse.json(
      { error: message },
      { status: error?.status ?? 500 },
    );
  }
}
