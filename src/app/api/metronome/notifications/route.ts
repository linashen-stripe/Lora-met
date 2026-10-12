import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { pickPrimaryMetronomeContract } from '@/utils/metronomeContractPool';

const USD_CREDIT_TYPE_ID = '2714e483-4ff1-48e4-9e25-ac732e8f24f2';

/**
 * POST /api/metronome/notifications
 *
 * Configures native Metronome auto top-up via
 * `add_prepaid_balance_threshold_configuration` on the customer's active
 * contract. Metronome handles threshold detection, commit creation, invoicing,
 * and Stripe payment entirely — no custom webhook logic required.
 *
 * Body: { metronomeCustomerId, thresholdAmount, rechargeAmount }
 * Amounts use the contract's credit type (fiat minor units or custom credits).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    metronomeCustomerId,
    thresholdAmount: requestedThreshold,
    rechargeAmount: requestedRecharge,
    // Backward compatibility with older clients.
    thresholdCents,
    rechargeAmountCents,
  } = body;
  const thresholdAmount = requestedThreshold ?? thresholdCents;
  const rechargeAmount = requestedRecharge ?? rechargeAmountCents;

  if (
    !metronomeCustomerId ||
    thresholdAmount == null ||
    rechargeAmount == null
  ) {
    return NextResponse.json(
      {
        error:
          'metronomeCustomerId, thresholdAmount, and rechargeAmount are required',
      },
      { status: 400 },
    );
  }

  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome API key not configured' }, { status: 503 });
  }

  try {
    const normalizedThresholdAmount = Number(thresholdAmount);
    const normalizedRechargeAmount = Number(rechargeAmount);

    // Get the customer's active contract and existing commit for product_id.
    const contractsRes = await metronome.v2.contracts.list({ customer_id: metronomeCustomerId });
    const contracts: any[] = contractsRes.data ?? [];
    const contract = pickPrimaryMetronomeContract(contracts);

    if (!contract) {
      return NextResponse.json({ error: 'No active contract found for customer' }, { status: 404 });
    }

    const existingCommit = (contract.commits ?? [])[0] ?? (contract.credits ?? [])[0];
    if (!existingCommit) {
      return NextResponse.json({ error: 'No commit or credit found on contract' }, { status: 404 });
    }

    const productId: string = existingCommit.product?.id ?? existingCommit.product_id;
    const creditTypeId: string | undefined =
      existingCommit.access_schedule?.credit_type?.id ??
      existingCommit.credit_type?.id;
    if (!productId) {
      return NextResponse.json({ error: 'Could not resolve product_id from existing commit' }, { status: 500 });
    }

    console.log(`[metronome/notifications] Configuring threshold ${normalizedThresholdAmount} → recharge to ${normalizedRechargeAmount} on contract ${contract.id}`);

    await (metronome.v2.contracts as any).edit({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      add_prepaid_balance_threshold_configuration: {
        is_enabled: true,
        threshold_amount: normalizedThresholdAmount,
        recharge_to_amount: normalizedRechargeAmount,
        ...(creditTypeId && creditTypeId !== USD_CREDIT_TYPE_ID
          ? { custom_credit_type_id: creditTypeId }
          : {}),
        payment_gate_config: {
          payment_gate_type: 'STRIPE',
          stripe_config: {
            payment_type: 'INVOICE',
          },
        },
        commit: {
          product_id: productId,
          name: 'Auto Top-Up',
        },
      },
    });

    console.log(`[metronome/notifications] ✓ Threshold config set on contract ${contract.id}`);
    return NextResponse.json({ contractId: contract.id });
  } catch (error: any) {
    console.error('[metronome/notifications] Failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { metronomeCustomerId } = body;
  if (!metronomeCustomerId) {
    return NextResponse.json(
      { error: 'metronomeCustomerId is required' },
      { status: 400 },
    );
  }

  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json(
      { error: 'Metronome API key not configured' },
      { status: 503 },
    );
  }

  try {
    const contractsRes = await metronome.v2.contracts.list({
      customer_id: metronomeCustomerId,
    });
    const contract = pickPrimaryMetronomeContract(contractsRes.data ?? []);
    if (!contract) {
      return NextResponse.json(
        { error: 'No active contract found for customer' },
        { status: 404 },
      );
    }

    await metronome.v2.contracts.edit({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      update_prepaid_balance_threshold_configuration: {
        is_enabled: false,
      },
    });

    return NextResponse.json({ contractId: contract.id });
  } catch (error: any) {
    console.error(
      '[metronome/notifications] Failed to disable:',
      error.message,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
