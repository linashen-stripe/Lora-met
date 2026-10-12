import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { useMemo, type ReactNode } from 'react';
import { getStripeLocale } from '@/utils/stripe/localeUtils';

/** Fixed width for Metronome package summary + embedded checkout column */
export const EMBEDDED_CHECKOUT_WITH_SIDEBAR_WIDTH_PX = 444;

interface Props {
  checkoutData: {
    clientSecret: string;
    sessionId: string;
  };
  settings: {
    language: string;
    checkoutMethod?: string;
    country: string;
    currency: string;
    email: string;
    stripePublishableKey: string;
    specialSku?: string;
    specialSkuPmc?: string;
  };
  onComplete: () => void;
  /** Summary block stacked above Embedded Checkout (same column width). */
  sidebar?: ReactNode;
  /** Tighter outer padding on the page shell. */
  compact?: boolean;
}

export default function EmbeddedCheckoutComponent({
  checkoutData,
  settings,
  onComplete,
  sidebar,
  compact = false,
}: Props) {
  const stripePromise = useMemo(() => {
    if (!settings.stripePublishableKey) {
      console.error('Stripe publishable key is not set');
      return null;
    }

    return loadStripe(settings.stripePublishableKey, {
      locale: getStripeLocale(settings.language),
    }).catch((err) => {
      console.error('Failed to load Stripe:', err);
      return null;
    });
  }, [settings.stripePublishableKey, settings.language]);

  const options = { clientSecret: checkoutData.clientSecret, onComplete };

  const outerPad = compact ? 'p-2 sm:p-3 md:p-4' : 'p-4 md:p-8';
  const innerPad = compact ? 'px-4 py-4' : 'px-5 py-5';

  if (sidebar) {
    return (
      <div
        id='checkout'
        className={`w-full min-h-[700px] bg-background ${outerPad}`}
      >
        <div className='mx-auto flex w-full justify-center'>
          <div className='flex w-full max-w-[444px] flex-col overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm'>
            <aside
              className={`w-full shrink-0 border-b border-neutral-200/90 ${innerPad}`}
            >
              {sidebar}
            </aside>
            <div className={`min-w-0 w-full ${innerPad}`}>
              <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id='checkout'
      className={`w-full min-h-[700px] bg-background ${outerPad}`}
    >
      <div className='mx-auto w-full max-w-screen-2xl'>
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
