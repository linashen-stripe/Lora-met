import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome, listCustomerInvoices } from '@/utils/metronome';
import initializeStripe from '@/utils/stripe';
import { toJsonSafe } from '@/utils/jsonSafeResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ metronomeCustomerId: string }> },
) {
  try {
    const { metronomeCustomerId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const sortRaw = searchParams.get('sort');
    const sort =
      sortRaw === 'date_asc' || sortRaw === 'date_desc' ? sortRaw : undefined;

    const metronome = initializeMetronome(request.headers);
    if (!metronome) {
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await listCustomerInvoices(
      metronome,
      metronomeCustomerId,
      status,
      sort,
    );

    // Enrich finalized invoices with the Stripe hosted_invoice_url
    let stripe: ReturnType<typeof initializeStripe> | null = null;
    try {
      stripe = initializeStripe(request.headers);
    } catch {
      // Stripe not configured — proceed without enrichment
    }

    const enriched = await Promise.all(
      invoices.map(async (inv: any) => {
        const stripeInvoiceId = inv.external_invoice?.invoice_id;
        if (stripe && stripeInvoiceId) {
          try {
            const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
            const enrichedInv: any = {
              ...inv,
              hosted_invoice_url: stripeInvoice.hosted_invoice_url ?? null,
              stripeStatus: stripeInvoice.status ?? null,
            };
            // Use the Stripe total when it includes tax (e.g. Singapore GST).
            // Stripe always stores amounts in minor units (cents) matching Metronome.
            if (typeof stripeInvoice.total === 'number' && stripeInvoice.total > inv.total) {
              enrichedInv.total = stripeInvoice.total;
            }
            return enrichedInv;
          } catch {
            // Stripe lookup failed — return as-is
          }
        }
        return inv;
      }),
    );

    return NextResponse.json(toJsonSafe({ invoices: enriched }));
  } catch (error) {
    console.error('Error fetching Metronome invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 },
    );
  }
}
