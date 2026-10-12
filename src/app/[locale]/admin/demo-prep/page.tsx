/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Database, ExternalLink, LoaderCircle } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { useConfigContext } from '@/contexts/ConfigContext';

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
        setMessage('Prepared Enterprise customer loaded. You can reseed its story below.');
        return;
      }

      const { data: checkout } = await fetchClient.post(
        '/api/stripe/upgrade-checkout',
        {
          stripeCustomerId: data.stripeCustomerId,
          metronomeCustomerId: data.metronomeCustomerId,
          language,
          contractStartDaysAgo: 30,
          contractPackage: 'enterprise',
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

  const seedStory = async (story: SeedStory) => {
    if (!customerId.trim()) return;
    setLoading(story);
    setMessage(null);
    try {
      const { data } = await fetchClient.get(
        '/api/metronome/seed-usage-multi-project',
        {
          params: {
            customerId: customerId.trim(),
            story,
            trailingDays: 1,
          },
        },
      );
      setMessage(
        `${data.message} ${Number(data.creditsConsumed).toLocaleString()} credits consumed.`,
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.error ?? error?.message ?? 'Seeding failed');
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
            Prepare the existing Enterprise customer, reseed a deterministic generation
            story, and open the presentation views.
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

          <section className='rounded-2xl border bg-white p-6'>
            <div className='flex items-center gap-3'>
              <Database className='h-6 w-6 text-purple' />
              <h2 className='text-xl font-semibold'>Historical usage</h2>
            </div>
            <label className='mt-5 block text-sm font-medium text-gray-700'>
              Metronome customer ID
            </label>
            <input
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm'
            />
            <div className='mt-4 grid grid-cols-3 gap-2'>
              {(['healthy', 'at-risk', 'burst'] as SeedStory[]).map((story) => (
                <button
                  key={story}
                  type='button'
                  onClick={() => seedStory(story)}
                  disabled={!customerId.trim() || loading !== null}
                  className='rounded-lg border border-purple/30 bg-purple/5 px-2 py-2 text-sm font-medium text-purple disabled:opacity-50'
                >
                  {loading === story ? 'Seeding…' : story}
                </button>
              ))}
            </div>
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
