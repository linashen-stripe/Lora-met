import React, { useState, FormEvent } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { defaultDemoSignInPassword } from '@/config/config';
import {
  deriveCustomerNameFromEmail,
  generateRandomCustomerEmail,
} from '@/utils/helpers';
import { loadFromStorage } from '@/utils/clientStorage';
import ErrorBanner from '../ui/ErrorBanner';
import { customerStorageKey } from '@/config/demoModes';
import { formatDemoCustomerName } from '@/utils/demoCustomerName';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { buildDemoRequestHeaders } from '@/utils/demoRequestHeaders';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import SeedPersonaCheckoutDialog, {
  type SeedPersonaCheckoutData,
} from '@/components/auth/SeedPersonaCheckoutDialog';
import { DEMO_CONTRACT_LOOKBACK_DAYS } from '@/utils/demoUsageSeedProfiles';

type SeedPersona = 'quickstart' | 'pro' | 'b2b';

const SignInForm = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { updateCustomer, settings, demoMode } = useConfigContext();
  const [error, setError] = useState<string | null>(null);
  const [seedPersonaLoading, setSeedPersonaLoading] =
    useState<SeedPersona | null>(null);
  const [seedCheckout, setSeedCheckout] =
    useState<SeedPersonaCheckoutData | null>(null);
  // Match anonymous demo sessions: use stored customer email if any, else same generator as ConfigContext.
  const [email, setEmail] = useState(() => {
    const stored = loadFromStorage(customerStorageKey(demoMode), {}) as {
      email?: string;
    };
    if (stored?.email?.trim()) return stored.email.trim();
    return generateRandomCustomerEmail();
  });
  const [password, setPassword] = useState(defaultDemoSignInPassword);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    try {
      const { data } = await fetchClient.post('/api/auth/sign-in', {
        email,
        demoMode,
      });
      updateCustomer({
        id: data.metronomeCustomerId,
        email,
        name: data.name,
        metronomeCustomerId: data.metronomeCustomerId,
        ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
      });
      router.push(`../dashboard?demoMode=${demoMode}`);
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(
          err.response?.data?.message || 'An error occurred. Please try again.',
        );
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    }
  };

  const runQuickstart = async (e: FormEvent, persona: SeedPersona) => {
    e.preventDefault();
    setError(null);
    setSeedPersonaLoading(persona);
    try {
      const lang = settings?.language || 'en';
      if (persona === 'b2b') {
        const response = await inspectedFetch(
          '/api/metronome/demo/power-user',
          {
            method: 'POST',
            headers: buildDemoRequestHeaders(),
            body: JSON.stringify({
              customerName: deriveCustomerNameFromEmail(email),
              demoMode,
            }),
          },
        );
        let seededCustomer:
          | {
              customerId: string;
              stripeCustomerId?: string;
            }
          | undefined;
        let streamError: string | undefined;
        await consumeNdjsonStream(response, (message) => {
          if (message.type === 'result') {
            seededCustomer = {
              customerId: String(message.customerId),
              ...(message.stripeCustomerId
                ? { stripeCustomerId: String(message.stripeCustomerId) }
                : {}),
            };
          } else if (message.type === 'error') {
            streamError = message.error;
          }
        });
        if (streamError) throw new Error(streamError);
        if (!seededCustomer) {
          throw new Error('The B2B demo customer could not be created.');
        }
        updateCustomer({
          id: seededCustomer.customerId,
          email,
          name: formatDemoCustomerName({
            demoMode,
            persona: 'b2b',
            baseName: deriveCustomerNameFromEmail(email),
          }),
          metronomeCustomerId: seededCustomer.customerId,
          ...(seededCustomer.stripeCustomerId
            ? { stripeCustomerId: seededCustomer.stripeCustomerId }
            : {}),
        });
        router.push(
          `/${lang}/dashboard?demoMode=${demoMode}&seedingUsage=true`,
        );
        return;
      }

      const { data } = await fetchClient.post('/api/auth/quickstart', {
        email,
        demoMode,
        persona,
      });

      updateCustomer({
        id: data.metronomeCustomerId,
        email,
        name: data.name,
        metronomeCustomerId: data.metronomeCustomerId,
        stripeCustomerId: data.stripeCustomerId,
      });

      if (data.existing && data.hasActiveContract) {
        router.push(`/${lang}/dashboard?demoMode=${demoMode}`);
        return;
      }

      const { data: checkout } = await fetchClient.post(
        '/api/stripe/upgrade-checkout',
        {
          stripeCustomerId: data.stripeCustomerId,
          metronomeCustomerId: data.metronomeCustomerId,
          language: lang,
          contractStartDaysAgo: DEMO_CONTRACT_LOOKBACK_DAYS,
          contractPackage:
            persona === 'pro' ? ('premium' as const) : ('enterprise' as const),
          seedPersona: persona,
          demoMode,
          uiMode: 'embedded',
        },
      );
      if (
        checkout.clientSecret &&
        checkout.sessionId &&
        checkout.package
      ) {
        setSeedCheckout({
          clientSecret: checkout.clientSecret,
          sessionId: checkout.sessionId,
          package: checkout.package,
        });
        return;
      }
      setError(t('common.error.default_message'));
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 409) {
          setError(t('signin.quickstart_conflict'));
        } else {
          setError(
            err.response?.data?.message || t('common.error.default_message'),
          );
        }
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(t('common.error.default_message'));
      }
    } finally {
      setSeedPersonaLoading(null);
    }
  };

  return (
    <div className='min-h-screen bg-background flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <div>
          <h2 className='mt-6 text-center text-3xl font-extrabold text-text-color'>
            {t('signin.title')}
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
                {t('signin.email')}
              </label>
              <input
                id='email'
                name='email'
                type='email'
                autoComplete='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple focus:border-purple sm:text-sm'
                placeholder={t('signin.email_placeholder')}
              />
            </div>

            <div>
              <label
                htmlFor='password'
                className='block text-sm font-medium text-gray-700'
              >
                {t('signin.password')}
              </label>
              <input
                id='password'
                name='password'
                type='password'
                autoComplete='new-password'
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className='mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple focus:border-purple sm:text-sm'
              />
            </div>

            <div className='flex items-center justify-between'>
              <div className='flex items-center'>
                <input
                  id='remember-me'
                  name='remember-me'
                  type='checkbox'
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className='h-4 w-4 text-purple focus:ring-purple border-gray-300 rounded'
                />
                <label
                  htmlFor='remember-me'
                  className='ml-2 block text-sm text-gray-900'
                >
                  {t('signin.remember_me')}
                </label>
              </div>

              <div className='text-sm'>
                <Link
                  href='#'
                  className='font-medium text-purple hover:text-purple-hover'
                >
                  {t('signin.forgot_password')}
                </Link>
              </div>
            </div>

            <button
              disabled={!email || email.length === 0}
              type='submit'
              className='w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-button-color bg-purple hover:bg-purple-hover transition duration-300'
            >
              {t('signin.sign_in')}
            </button>

            <div className='relative py-2'>
              <div className='absolute inset-0 flex items-center'>
                <span className='w-full border-t border-gray-200' />
              </div>
              <div className='relative flex justify-center text-xs uppercase tracking-wide'>
                <span className='bg-white px-2 text-gray-400'>Demo</span>
              </div>
            </div>

            <p className='text-xs text-gray-500 text-center'>
              {t('signin.quickstart_sub')}
            </p>
            <div className='grid gap-2'>
              {(
                [
                  ['pro', 'signin.seed_pro'],
                  ['quickstart', 'signin.seed_quickstart'],
                  ['b2b', 'signin.seed_b2b'],
                ] as const
              ).map(([persona, label]) => (
                <button
                  key={persona}
                  type='button'
                  disabled={
                    !email ||
                    email.length === 0 ||
                    seedPersonaLoading !== null
                  }
                  onClick={(event) => runQuickstart(event, persona)}
                  className='w-full flex justify-center py-2 px-4 border border-purple/30 rounded-md shadow-sm text-sm font-medium text-purple bg-purple/5 hover:bg-purple/10 transition duration-300 disabled:opacity-50'
                >
                  {seedPersonaLoading === persona
                    ? persona === 'b2b'
                      ? t('signin.seed_b2b')
                      : t('signin.quickstart_loading')
                    : t(label)}
                </button>
              ))}
            </div>
          </form>
        </div>
        <div className='text-center'>
          <p className='text-sm text-text-color'>
            {t('signin.not_member')}{' '}
            <Link
              href='sign-up'
              className='font-medium text-purple hover:text-purple-hover'
            >
              {t('signin.sign_up_link')}
            </Link>
          </p>
        </div>
      </div>
      <SeedPersonaCheckoutDialog
        checkout={seedCheckout}
        onClose={() => setSeedCheckout(null)}
      />
    </div>
  );
};

export default SignInForm;
