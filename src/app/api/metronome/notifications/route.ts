import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { pickPrimaryMetronomeContract } from '@/utils/metronomeContractPool';

/**
 * POST /api/metronome/notifications
 *
 * Configures native Metronome auto top-up via
 * `add_prepaid_balance_threshold_configuration` on the customer's active
 * contract. Metronome handles threshold detection, commit creation, invoicing,
 * and Stripe payment entirely — no custom webhook logic required.
 *
 * Body: { metronomeCustomerId, thresholdCents, rechargeAmountCents }
 * (rechargeAmountCents = the amount to recharge UP TO, not by)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { metronomeCustomerId, thresholdCents, rechargeAmountCents } = body;

  if (!metronomeCustomerId || thresholdCents == null || rechargeAmountCents == null) {
    return NextResponse.json(
      { error: 'metronomeCustomerId, thresholdCents, and rechargeAmountCents are required' },
      { status: 400 },
    );
  }

  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json({ error: 'Metronome API key not configured' }, { status: 503 });
  }

  try {
    const thresholdAmount = Number(thresholdCents);
    const rechargeAmount = Number(rechargeAmountCents);

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
    if (!productId) {
      return NextResponse.json({ error: 'Could not resolve product_id from existing commit' }, { status: 500 });
    }

    console.log(`[metronome/notifications] Configuring threshold ${thresholdAmount} → recharge to ${rechargeAmount} on contract ${contract.id}`);

    await (metronome.v2.contracts as any).edit({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      add_prepaid_balance_threshold_configuration: {
        is_enabled: true,
        threshold_amount: thresholdAmount,
        recharge_to_amount: rechargeAmount,
        payment_gate_config: {
          payment_gate_type: 'STRIPE',
          tax_type: 'STRIPE',
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
