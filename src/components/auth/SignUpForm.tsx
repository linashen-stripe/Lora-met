'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AxiosError } from 'axios';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { generateRandomCustomerEmail } from '@/utils/helpers';
import ErrorBanner from '../ui/ErrorBanner';
import Spinner from '../ui/Spinner';

interface SignUpFormProps {
  defaultCountry?: string;
}

const SignUpForm = ({ defaultCountry = 'US' }: SignUpFormProps) => {
  const { t } = useTranslation();
  const { settings, updateCustomer, customer } = useConfigContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Seed ConfigContext with a country-specific email on first mount if no
  // customer is registered yet, so the tools panel stays in sync.
  useEffect(() => {
    if (!customer?.id) {
      updateCustomer({ email: generateRandomCustomerEmail(defaultCountry) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ConfigContext is the single source of truth — no local email state.
  const email = customer?.email ?? '';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!(settings as any)?.metronomeDeliveryMethodId?.trim()) {
      setError(
        'Stripe and Metronome are not connected. Please link your accounts in Metronome (Settings → Integrations → Stripe) and ensure the delivery method ID is configured.',
      );
      return;
    }

    setIsLoading(true);

    const plan = searchParams.get('plan')?.toLowerCase();
    const packageId = searchParams.get('packageId') || undefined;
    const requiresPayment = searchParams.get('requiresPayment') === 'true';

    try {
      const { data } = await fetchClient.post('/api/auth/sign-up', {
        email,
        planType: plan,
        packageId: requiresPayment ? undefined : packageId,
      });
      updateCustomer({
        id: data.metronomeCustomerId,
        email,
        name: data.name,
        metronomeCustomerId: data.metronomeCustomerId,
        ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
      });
      localStorage.removeItem('savory-seasons-chat-state-new');

      if (!settings) {
        throw new Error('Plan is not set up correctly');
      }

      const { language } = settings;

      if (packageId && requiresPayment) {
        router.push(`/${language}/subscribe/metronome-package?packageId=${packageId}`);
        return;
      }

      if (packageId) {
        router.push(`/${language}/chat`);
        return;
      }

      switch (plan) {
        case 'free':
          router.push(`/${language}/chat`);
          break;
        case 'pricing-plan-pro':
          router.push(`/${language}/subscribe/metronome-package`);
          break;
        default:
          router.push(`/${language}/chat`);
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(
          err.response?.data?.message || 'An error occurred. Please try again.',
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div>
          <h2 className='mt-6 text-center text-3xl font-extrabold text-text-color'>
            {t('signup.title')}
          </h2>
        </div>
        <div className='bg-white p-8 rounded-lg shadow-md'>
          <form className='space-y-6' onSubmit={handleSubmit}>
            {error && <ErrorBanner message={error} />}

            <div>
              <label
                htmlFor='email'
                className='block text-sm font-medium text-gray-700'
              >
                {t('signup.email')}
              </label>
              <input
                id='email'
                name='email'
                type='email'
                autoComplete='off'
                required
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateCustomer({ email: e.target.value })
                }
                className='mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple focus:border-purple sm:text-sm'
                placeholder={t('signup.email_placeholder')}
              />
            </div>

            <button
              disabled={!email || email.length === 0 || isLoading}
              type='submit'
              className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-button-color bg-purple hover:bg-purple-hover transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isLoading ? <Spinner /> : t('signup.sign_up')}
            </button>
          </form>
        </div>
        <div className='text-center'>
          <p className='text-sm text-text-color'>
            {t('signup.already_member')}{' '}
            <Link
              href='sign-in'
              className='font-medium text-purple hover:text-purple-hover'
            >
              {t('signup.sign_in_link')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpForm;
