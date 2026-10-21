/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, ExternalLink, LoaderCircle } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';
import { DEMO_CONTRACT_LOOKBACK_DAYS } from '@/utils/demoUsageSeedProfiles';

type SeedStory = 'healthy' | 'at-risk' | 'burst';

export default function DemoPrepPage() {
  const { customer, settings, updateCustomer } = useConfigContext();
  const language = settings?.language || 'en';
  const [email, setEmail] = useState('bufo-studios@example.com');
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(
    customer?.metronomeCustomerId ?? customer?.id ?? '',
  );
  const [story, setStory] = useState<SeedStory>('healthy');

  const prepareCustomer = async () => {
    setLoading('prepare');
    setMessage(null);
    try {
      const { data } = await fetchClient.post('/api/auth/quickstart', {
        email,
        name: 'Bufo Studios',
        demoMode: 'generation',
      });
      setCustomerId(data.metronomeCustomerId);
      updateCustomer({
        id: data.metronomeCustomerId,
        email,
        name: data.name,
        metronomeCustomerId: data.metronomeCustomerId,
        stripeCustomerId: data.stripeCustomerId,
      });

      if (data.hasActiveContract) {
        setMessage(
          'Prepared Enterprise customer loaded without adding usage. Use a fresh email for a different immutable usage story.',
        );
        return;
      }

      const { data: checkout } = await fetchClient.post(
        '/api/stripe/upgrade-checkout',
        {
          stripeCustomerId: data.stripeCustomerId,
          metronomeCustomerId: data.metronomeCustomerId,
          language,
          contractStartDaysAgo: DEMO_CONTRACT_LOOKBACK_DAYS,
          contractPackage: 'enterprise',
          seedPersona: 'quickstart',
          seedStory: story,
          demoMode: 'generation',
        },
      );
      if (checkout.url) window.location.href = checkout.url;
    } catch (error: any) {
      setMessage(error?.response?.data?.message ?? error?.message ?? 'Preparation failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className='min-h-screen bg-background px-6 py-12'>
      <div className='mx-auto max-w-4xl'>
        <div className='mb-8'>
          <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
            Presenter controls
          </p>
          <h1 className='mt-2 text-4xl font-bold text-foreground'>Demo preparation</h1>
          <p className='mt-3 max-w-2xl text-muted-foreground'>
            Prepare one Enterprise customer with a deterministic Generation
            story, then open the presentation views.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <section className='rounded-2xl border bg-white p-6'>
            <div className='flex items-center gap-3'>
              <Building2 className='h-6 w-6 text-purple' />
              <h2 className='text-xl font-semibold'>Enterprise customer</h2>
            </div>
            <label className='mt-5 block text-sm font-medium text-gray-700'>
              Prepared customer email
            </label>
            <input
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2'
            />
            <label className='mt-4 block text-sm font-medium text-gray-700'>
              Usage profile
              <select
                value={story}
                onChange={(event) =>
                  setStory(event.target.value as SeedStory)
                }
                className='mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
              >
                <option value='healthy'>Healthy growth</option>
                <option value='at-risk'>At risk</option>
                <option value='burst'>Late-month spike</option>
              </select>
            </label>
            <details className='mt-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-950'>
              <summary className='cursor-pointer font-semibold'>
                How these profiles differ
              </summary>
              <ul className='mt-2 list-disc space-y-1 pl-5'>
                <li>
                  Healthy follows elapsed term pace, with a 10% demo floor.
                </li>
                <li>
                  At-Risk runs at 135% of elapsed pace, with a 15% floor.
                </li>
                <li>
                  Late-month Spike stays near elapsed pace, with a 12% floor
                  and usage concentrated recently.
                </li>
              </ul>
              <p className='mt-2 text-amber-900'>
                Usage is immutable. Use a fresh customer to compare profiles.
              </p>
            </details>
            <button
              type='button'
              onClick={prepareCustomer}
              disabled={!email.trim() || loading !== null}
              className='mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-50'
            >
              {loading === 'prepare' && <LoaderCircle className='h-4 w-4 animate-spin' />}
              Load or prepare customer
            </button>
          </section>

          <section className='rounded-2xl border border-amber-200 bg-amber-50 p-6'>
            <h2 className='text-xl font-semibold text-amber-950'>
              One story per customer
            </h2>
            <p className='mt-3 text-sm text-amber-900'>
              Historical usage is additive and cannot be replaced. Choose the
              profile before preparation and use a fresh email to compare a
              different profile.
            </p>
            {customerId && (
              <p className='mt-3 break-all font-mono text-xs text-amber-900'>
                Customer: {customerId}
              </p>
            )}
          </section>
        </div>

        {message && (
          <p className='mt-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900'>
            {message}
          </p>
        )}

        <div className='mt-8 grid gap-3 sm:grid-cols-3'>
          <Link
            href={`/${language}/chat`}
            className='flex items-center justify-between rounded-xl border bg-white px-4 py-3 font-medium'
          >
            Generation playground <ExternalLink className='h-4 w-4' />
          </Link>
          <Link
            href={`/${language}/dashboard/usage`}
            className='flex items-center justify-between rounded-xl border bg-white px-4 py-3 font-medium'
          >
            Usage dashboard <ExternalLink className='h-4 w-4' />
          </Link>
          <Link
            href={`/${language}/admin/cleanup-environment`}
            className='flex items-center justify-between rounded-xl border bg-white px-4 py-3 font-medium'
          >
            Cleanup wizard <ExternalLink className='h-4 w-4' />
          </Link>
        </div>
      </div>
    </main>
  );
}
