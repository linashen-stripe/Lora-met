import { after, NextRequest, NextResponse } from 'next/server';
import initializeStripe from '@/utils/stripe';
import { initializeMetronome } from '@/utils/metronome';
import { pickPrimaryMetronomeContract } from '@/utils/metronomeContractPool';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import { finalizeAndPayMetronomeInvoice } from '@/utils/stripeInvoiceFinalize';
import { normalizeDemoMode, type DemoMode } from '@/config/demoModes';
import generationCatalog from '../../../../../config/metronome/generation-catalog.json';

const USD_CREDIT_TYPE_ID = '2714e483-4ff1-48e4-9e25-ac732e8f24f2';

interface RequestBody {
  customerId: string;
  metronomeCustomerId: string;
  amount: number;
  demoMode?: DemoMode;
  creditTypeId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const stripe = initializeStripe(request.headers);
    const metronome = initializeMetronome(request.headers);
    const {
      customerId,
      metronomeCustomerId,
      amount,
      demoMode: rawDemoMode,
      creditTypeId,
    }: RequestBody = await request.json();
    const demoMode = normalizeDemoMode(rawDemoMode);

    if (!customerId || !metronomeCustomerId || typeof amount !== 'number') {
      return NextResponse.json(
        { error: 'customerId, metronomeCustomerId, and amount are required' },
        { status: 400 },
      );
    }

    if (!metronome) {
      return NextResponse.json({ error: 'Metronome API key not configured' }, { status: 503 });
    }

    // Ensure Stripe billing config is linked — Metronome needs it to create the Stripe invoice.
    const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);
    try {
      const { data: billingConfigs } = await metronome.v1.customers.retrieveBillingConfigurations({ customer_id: metronomeCustomerId });
      const hasStripe = billingConfigs?.some((c: any) => c.billing_provider === 'stripe' && !c.archived_at) ?? false;
      if (!hasStripe && metronomeDeliveryMethodId) {
        await metronome.v1.customers.setBillingConfigurations({
          data: [{
            customer_id: metronomeCustomerId,
            billing_provider: 'stripe',
            delivery_method_id: metronomeDeliveryMethodId,
            configuration: {
              stripe_customer_id: customerId,
              stripe_collection_method: 'charge_automatically',
              tax_provider: 'stripe',
            } as any,
          }],
        });
        console.log(`[credit-grant] Linked Stripe billing config for ${metronomeCustomerId}`);
      }
    } catch (bcErr: any) {
      console.warn(`[credit-grant] Could not verify/link billing config:`, bcErr?.message);
    }

    const accessAmount =
      demoMode === 'generation' ? Math.round(amount) : Math.round(amount * 100);
    const invoiceAmountCents =
      demoMode === 'generation'
        ? Math.round(
            amount * generationCatalog.pricingUnit.fiatPerCustomCredit,
          )
        : Math.round(amount * 100);

    if (demoMode === 'generation' && !creditTypeId) {
      return NextResponse.json(
        { error: 'Generation credit type is not loaded yet' },
        { status: 409 },
      );
    }

    const contractsRes = await metronome.v2.contracts.list({ customer_id: metronomeCustomerId });
    const contract = pickPrimaryMetronomeContract(contractsRes.data ?? []);

    if (!contract) {
      return NextResponse.json({ error: 'No active Metronome contract found' }, { status: 404 });
    }

    const existingCommit = (contract.commits ?? [])[0] ?? (contract.credits ?? [])[0];
    if (!existingCommit) {
      return NextResponse.json({ error: 'No commit or credit found on contract' }, { status: 404 });
    }

    const productId: string = existingCommit.product?.id ?? (existingCommit as any).product_id;
    if (!productId) {
      return NextResponse.json({ error: 'Could not resolve product_id from contract' }, { status: 500 });
    }

    const now = new Date();
    now.setMinutes(0, 0, 0);
    const farFuture = new Date(now);
    farFuture.setFullYear(farFuture.getFullYear() + 10);

    console.log(
      `💳 Adding Metronome-invoiced commit: ${accessAmount} ${
        demoMode === 'generation' ? 'Generation Credits' : 'cents'
      } for customer ${metronomeCustomerId}`,
    );

    // Metronome creates and owns the Stripe invoice — preserves the Metronome→Stripe invoice link.
    await (metronome.v2.contracts as any).edit({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      add_commits: [{
        type: 'PREPAID',
        product_id: productId,
        name: 'Credit Purchase',
        access_schedule: {
          credit_type_id:
            demoMode === 'generation' ? creditTypeId : USD_CREDIT_TYPE_ID,
          schedule_items: [{
            amount: accessAmount,
            starting_at: now.toISOString(),
            ending_before: farFuture.toISOString(),
          }],
        },
        invoice_schedule: {
          credit_type_id: USD_CREDIT_TYPE_ID,
          schedule_items: [{
            timestamp: now.toISOString(),
            amount: invoiceAmountCents,
          }],
        },
        payment_gate_config: {
          payment_gate_type: 'STRIPE',
          tax_type: 'NONE',
          stripe_config: {
            payment_type: 'INVOICE',
          },
        },
      }],
    });

    console.log(`✅ Metronome commit added for customer ${metronomeCustomerId}`);

    // Invoice finalization + payment runs in the background — don't block the modal.
    const createdAfter = Math.floor(Date.now() / 1000) - 15;
    after(() =>
      finalizeAndPayMetronomeInvoice(
        stripe,
        customerId,
        createdAfter,
        'credit-grant',
      ).catch((err) =>
        console.error('[credit-grant] Background invoice payment failed:', err),
      ),
    );

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Credit purchase error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
