import { NextRequest, NextResponse } from 'next/server';
import { subDays } from 'date-fns';
import initializeStripe from '@/utils/stripe';
import { getPublicOriginFromRequest } from '@/utils/getPublicOriginFromRequest';
import { withFallbackHeaders } from '@/utils/withFallbackHeaders';
import {
  initializeMetronome,
  createContract,
  assignContractSeats,
  endActiveCustomerContractsAt,
  restoreOpenEndedContracts,
  resolveMetronomeDeliveryMethodIdAsync,
} from '@/utils/metronome';
import { finalizeAndPayMetronomeInvoice } from '@/utils/stripeInvoiceFinalize';

export async function GET(request: NextRequest) {
  const publicOrigin = getPublicOriginFromRequest(request);
  try {
    const stripe = initializeStripe(request.headers);
    const metronome = initializeMetronome(request.headers);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      const u = new URL('/en/chat', publicOrigin);
      console.log(
        '[upgrade-checkout/success] redirect (missing session_id):',
        u.href,
      );
      return NextResponse.redirect(u);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // mode: 'setup' sessions don't have payment_status — check setup_intent status
    if (session.mode === 'setup' && session.status !== 'complete') {
      console.error(
        `Setup session ${sessionId} not complete: ${session.status}`,
      );
      const u = new URL('/en/chat', publicOrigin);
      console.log(
        '[upgrade-checkout/success] redirect (session not complete):',
        u.href,
      );
      return NextResponse.redirect(u);
    }

    const {
      metronomeCustomerId,
      packageId,
      packageName,
      language = 'en',
      contractStartDaysAgo: contractStartDaysAgoRaw,
      seedUsageAfter,
    } = session.metadata ?? {};

    const contractStartDaysAgo = contractStartDaysAgoRaw
      ? parseInt(String(contractStartDaysAgoRaw), 10)
      : 0;

    // Set the collected payment method as the customer's default for future charges
    if (session.setup_intent) {
      try {
        const setupIntent = await stripe.setupIntents.retrieve(
          session.setup_intent as string,
        );
        if (setupIntent.payment_method && session.customer) {
          await stripe.customers.update(session.customer as string, {
            invoice_settings: {
              default_payment_method: setupIntent.payment_method as string,
            },
          });
          console.log(`✅ Set default payment method on Stripe customer`);
        }
      } catch (pmError) {
        console.warn('⚠️ Could not set default payment method:', pmError);
      }
    }

    if (metronome && metronomeCustomerId && packageId) {
      // Ensure Stripe billing config with tax_provider is in place before contract creation,
      // matching the safety check in contracts/route.ts POST.
      if (session.customer) {
        try {
          const { metronomeDeliveryMethodId } = withFallbackHeaders(request.headers);
          const deliveryMethodId = await resolveMetronomeDeliveryMethodIdAsync(metronome, metronomeDeliveryMethodId);
          if (deliveryMethodId) {
            let hasStripe = false;
            try {
              const { data: billingConfigs } = await metronome.v1.customers.retrieveBillingConfigurations({ customer_id: metronomeCustomerId });
              hasStripe = (billingConfigs ?? []).some((c: any) => c.billing_provider === 'stripe' && !c.archived_at);
            } catch {
              console.warn('[upgrade-checkout/success] retrieveBillingConfigurations threw — will attempt to link');
            }
            if (!hasStripe) {
              await metronome.v1.customers.setBillingConfigurations({
                data: [{
                  customer_id: metronomeCustomerId,
                  billing_provider: 'stripe',
                  delivery_method_id: deliveryMethodId,
                  configuration: {
                    stripe_customer_id: session.customer as string,
                    stripe_collection_method: 'charge_automatically',
                    tax_provider: 'stripe',
                  } as any,
                }],
              });
              console.log('[upgrade-checkout/success] ✅ Stripe billing config linked with tax_provider');
            }
          }
        } catch (bcErr: any) {
          console.warn('[upgrade-checkout/success] Failed to set billing config:', bcErr?.message);
        }
      }

      let endedContractIds: string[] = [];
      try {
        const isQuickstart =
          seedUsageAfter === 'true' && contractStartDaysAgo > 0;
        const transitionAt = new Date();
        transitionAt.setMilliseconds(0);
        const startingAt = isQuickstart
          ? subDays(transitionAt, contractStartDaysAgo)
          : transitionAt;

        // Quickstart creates a brand-new Enterprise customer with backdated history.
        // Self-serve upgrades preserve the Free contract and end it exactly where
        // Premium begins, so earlier usage cannot be re-rated against Premium.
        if (!isQuickstart) {
          endedContractIds = await endActiveCustomerContractsAt(
            metronome,
            metronomeCustomerId,
            transitionAt.toISOString(),
          );
        }

        const createdAfter = Math.floor(Date.now() / 1000) - 15;
        const contractId = await createContract(metronome, {
          metronomeCustomerId,
          packageId,
          startingAt: startingAt.toISOString(),
        });
        console.log(
          `✅ Created Metronome ${packageName} contract: ${contractId} (starting_at ${startingAt.toISOString()})`,
        );

        // Finalize and pay the subscription invoice Metronome creates in Stripe.
        // Runs in background — don't block the redirect.
        if (session.customer) {
          finalizeAndPayMetronomeInvoice(
            stripe,
            session.customer as string,
            createdAfter,
            'upgrade',
          ).catch((err) => console.error('[upgrade] Background invoice payment failed:', err));
        }

        try {
          const customerEmail = session.customer_details?.email ?? '';
          await assignContractSeats(
            metronome,
            metronomeCustomerId,
            contractId,
            customerEmail,
          );
        } catch {
          // seats optional
        }

      } catch (contractError) {
        console.error(
          'Failed to create Metronome contract after checkout:',
          contractError,
        );
        if (endedContractIds.length > 0) {
          try {
            await restoreOpenEndedContracts(
              metronome,
              metronomeCustomerId,
              endedContractIds,
            );
          } catch (restoreError) {
            console.error(
              'Failed to restore previous contracts after upgrade failure:',
              restoreError,
            );
          }
        }
      }
    }

    // Quickstart sets seedUsageAfter=true in session metadata — seed history in the background.
    if (seedUsageAfter === 'true' && metronomeCustomerId) {
      const seedUrl = new URL('/api/metronome/seed-usage-multi-project', publicOrigin);
      seedUrl.searchParams.set('customerId', metronomeCustomerId);
      seedUrl.searchParams.set('story', 'healthy');
      seedUrl.searchParams.set('trailingDays', '1');
      fetch(seedUrl.toString(), { method: 'GET', cache: 'no-store' })
        .then((res) => {
          if (!res.ok) res.text().then((t) => console.warn('[upgrade-checkout/success] seed-usage failed:', res.status, t));
          else console.log('[upgrade-checkout/success] seed-usage completed');
        })
        .catch((err) => console.warn('[upgrade-checkout/success] seed-usage error:', err));
    }

    const redirectUrl = new URL(`/${language}/dashboard`, publicOrigin);
    console.log('[upgrade-checkout/success] redirect:', redirectUrl.href);
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Upgrade checkout success error:', error);
    const fallbackUrl = new URL('/en/chat', publicOrigin);
    console.log(
      '[upgrade-checkout/success] redirect (error fallback):',
      fallbackUrl.href,
    );
    return NextResponse.redirect(fallbackUrl);
  }
}
