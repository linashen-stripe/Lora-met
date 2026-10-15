/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import { LoaderCircle, Users } from 'lucide-react';
import fetchClient from '@/utils/fetchClient';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { buildDemoRequestHeaders } from '@/utils/demoRequestHeaders';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { deriveCustomerNameFromEmail } from '@/utils/helpers';
import { useConfigContext } from '@/contexts/ConfigContext';
import type { DemoMode } from '@/config/demoModes';

type Persona = 'pro' | 'quickstart' | 'b2b';
type Story = 'healthy' | 'at-risk' | 'burst';

export default function DemoCustomersPage() {
  const { settings, updateCustomer } = useConfigContext();
  const language = settings?.language || 'en';
  const [mode, setMode] = useState<DemoMode>('generation');
  const [persona, setPersona] = useState<Persona>('pro');
  const [email, setEmail] = useState('demo-pro@example.com');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const seedUsage = async (
    targetCustomerId: string,
    story: Story = 'healthy',
  ) => {
    const endpoint =
      mode === 'generation'
        ? '/api/metronome/seed-usage-multi-project'
        : '/api/metronome/seed-usage-multi-seat';
    const { data } = await fetchClient.get(endpoint, {
      params: {
        customerId: targetCustomerId,
        story,
        trailingDays: 1,
        ...(mode === 'ai-builder' && persona === 'pro'
          ? { singleSeat: '1', singleProject: '1' }
          : {}),
      },
    });
    return data;
  };

  const prepareCustomer = async () => {
    if (!email.trim() || loading) return;
    setLoading('prepare');
    setMessage(null);
    try {
      if (mode === 'ai-builder') {
        const { data } = await fetchClient.post(
          '/api/metronome/demo/ai-builder-packages',
        );
        if (!data.ok) throw new Error('AI Builder package setup failed.');
      }
      if (persona === 'b2b') {
        const response = await inspectedFetch(
          '/api/metronome/demo/power-user',
          {
            method: 'POST',
            headers: buildDemoRequestHeaders(),
            body: JSON.stringify({
              customerName: deriveCustomerNameFromEmail(email),
              demoMode: mode,
            }),
          },
        );
        let result: Record<string, unknown> | undefined;
        let streamError: string | undefined;
        await consumeNdjsonStream(response, (entry) => {
          if (entry.type === 'result') result = entry;
          if (entry.type === 'error') streamError = entry.error;
        });
        if (streamError) throw new Error(streamError);
        if (!result?.customerId) {
          throw new Error('B2B customer creation returned no customer ID.');
        }
        const id = String(result.customerId);
        setCustomerId(id);
        updateCustomer({
          id,
          email,
          name: deriveCustomerNameFromEmail(email),
          metronomeCustomerId: id,
          ...(result.stripeCustomerId
            ? { stripeCustomerId: String(result.stripeCustomerId) }
            : {}),
        });
        setMessage(
          `Created B2B power user with ${Number(result.eventsIngested ?? 0).toLocaleString()} usage events.`,
        );
        return;
      }

      const { data } = await fetchClient.post('/api/auth/quickstart', {
        email,
        demoMode: mode,
      });
      setCustomerId(data.metronomeCustomerId);
      updateCustomer({
        id: data.metronomeCustomerId,
        email,
        name: data.name,
        metronomeCustomerId: data.metronomeCustomerId,
        stripeCustomerId: data.stripeCustomerId,
      });
      if (data.existing && data.hasActiveContract) {
        await seedUsage(data.metronomeCustomerId);
        setMessage('Loaded the existing customer and seeded fresh usage.');
        return;
      }
      const { data: checkout } = await fetchClient.post(
        '/api/stripe/upgrade-checkout',
        {
          stripeCustomerId: data.stripeCustomerId,
          metronomeCustomerId: data.metronomeCustomerId,
          language,
          contractStartDaysAgo: 29,
          contractPackage: persona === 'pro' ? 'premium' : 'enterprise',
          seedPersona: persona,
          demoMode: mode,
        },
      );
      if (!checkout.url) throw new Error('Checkout returned no URL.');
      window.location.href = checkout.url;
    } catch (error: any) {
      setMessage(
        error?.response?.data?.message ??
          error?.response?.data?.error ??
          error?.message ??
          'Customer preparation failed.',
      );
    } finally {
      setLoading(null);
    }
  };

  const reseed = async (story: Story) => {
    if (!customerId.trim() || loading) return;
    setLoading(story);
    setMessage(null);
    try {
      const data = await seedUsage(customerId.trim(), story);
      setMessage(
        `Seeded ${Number(data.eventsIngested ?? 0).toLocaleString()} ${story} usage events.`,
      );
    } catch (error: any) {
      setMessage(
        error?.response?.data?.error ?? error?.message ?? 'Usage seeding failed.',
      );
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className='min-h-screen bg-background px-6 py-12'>
      <div className='mx-auto max-w-4xl'>
        <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
          Admin · Demo customers
        </p>
        <h1 className='mt-2 text-4xl font-bold text-foreground'>
          Prepare demo personas
        </h1>
        <p className='mt-3 max-w-3xl text-muted-foreground'>
          Uses the demo environment keys from .env or the Tools Panel. Account
          primitives and destructive cleanup remain on their dedicated pages.
        </p>

        <section className='mt-8 rounded-2xl border bg-white p-6'>
          <div className='flex items-center gap-3'>
            <Users className='h-6 w-6 text-purple' />
            <h2 className='text-xl font-semibold'>Customer configuration</h2>
          </div>
          <div className='mt-5 grid gap-4 sm:grid-cols-2'>
            <label className='text-sm font-medium text-gray-700'>
              Demo mode
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as DemoMode)}
                className='mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
              >
                <option value='generation'>Lora Generate</option>
                <option value='ai-builder'>AI Builder</option>
              </select>
            </label>
            <label className='text-sm font-medium text-gray-700'>
              Persona
              <select
                value={persona}
                onChange={(event) =>
                  setPersona(event.target.value as Persona)
                }
                className='mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
              >
                <option value='pro'>Pro</option>
                <option value='quickstart'>Enterprise Quickstart</option>
                <option value='b2b'>B2B power user</option>
              </select>
            </label>
          </div>
          <label className='mt-4 block text-sm font-medium text-gray-700'>
            Customer email
            <input
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2'
            />
          </label>
          <button
            type='button'
            onClick={prepareCustomer}
            disabled={!email.trim() || loading !== null}
            className='mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-50'
          >
            {loading === 'prepare' && (
              <LoaderCircle className='h-4 w-4 animate-spin' />
            )}
            Prepare {persona === 'b2b' ? 'B2B power user' : persona}
          </button>
        </section>

        <section className='mt-6 rounded-2xl border bg-white p-6'>
          <h2 className='text-xl font-semibold'>Reseed customer usage</h2>
          <input
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            placeholder='Metronome customer ID'
            className='mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm'
          />
          <div className='mt-4 grid grid-cols-3 gap-2'>
            {(['healthy', 'at-risk', 'burst'] as Story[]).map((story) => (
              <button
                key={story}
                type='button'
                onClick={() => reseed(story)}
                disabled={!customerId.trim() || loading !== null}
                className='rounded-lg border border-purple/30 bg-purple/5 px-2 py-2 text-sm font-medium capitalize text-purple disabled:opacity-50'
              >
                {loading === story ? 'Seeding…' : story}
              </button>
            ))}
          </div>
        </section>

        {message && (
          <p className='mt-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900'>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

