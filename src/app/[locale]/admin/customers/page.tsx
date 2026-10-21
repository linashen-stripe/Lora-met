/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, RefreshCw, Users } from 'lucide-react';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import {
  generateRandomCustomerEmail,
} from '@/utils/helpers';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useAdminCredentials } from '@/contexts/AdminCredentialsContext';
import type { DemoMode } from '@/config/demoModes';
import AdminCredentialPanel from '@/components/admin/AdminCredentialPanel';
import { buildAdminCredentialHeaders } from '@/utils/adminCredentials';

type Persona = 'pro' | 'quickstart' | 'b2b';
type Story = 'healthy' | 'at-risk' | 'burst';

export default function DemoCustomersPage() {
  const { settings, updateCustomer } = useConfigContext();
  const { source, explicit } = useAdminCredentials();
  const language = settings?.language || 'en';
  const randomEmail = () =>
    generateRandomCustomerEmail(settings?.country || 'US');
  const [mode, setMode] = useState<DemoMode>('generation');
  const [persona, setPersona] = useState<Persona>('pro');
  const [story, setStory] = useState<Story>('healthy');
  const [email, setEmail] = useState(randomEmail);
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const adminHeaders = () => buildAdminCredentialHeaders(source, explicit);
  const explicitCredentialsMissing =
    source === 'explicit' &&
    !explicit.metronomeApiKey.trim();

  useEffect(() => {
    setCustomerId('');
    setMessage(null);
  }, [explicit, source]);

  const prepareCustomer = async () => {
    if (!email.trim() || loading) return;
    setLoading('prepare');
    setMessage(null);
    try {
      const response = await inspectedFetch('/api/metronome/demo/persona', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          email,
          demoMode: mode,
          persona,
          story,
        }),
      });
      let result: Record<string, unknown> | undefined;
      let streamError: string | undefined;
      await consumeNdjsonStream(response, (entry) => {
        if (entry.type === 'result') result = entry;
        if (entry.type === 'error') streamError = entry.error;
      });
      if (streamError) throw new Error(streamError);
      if (!result?.customerId) {
        throw new Error('Customer preparation returned no customer ID.');
      }
      const id = String(result.customerId);
      setCustomerId(id);
      updateCustomer({
        id,
        email,
        name: String(result.customerName ?? email),
        metronomeCustomerId: id,
        ...(result.stripeCustomerId
          ? { stripeCustomerId: String(result.stripeCustomerId) }
          : {}),
      });
      const billingMode =
        result.billingMode === 'stripe'
          ? 'Stripe-assisted'
          : 'Metronome-only';
      setMessage(
        `Prepared ${PERSONA_LABELS[persona]} in ${billingMode} mode with ${Number(
          result.eventsIngested ?? 0,
        ).toLocaleString()} usage events.`,
      );
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

  return (
    <main className='min-h-screen bg-background px-6 py-12'>
      <div className='mx-auto max-w-4xl'>
        <Link
          href={`/${language}/admin`}
          className='mb-5 inline-flex text-sm font-semibold text-purple hover:underline'
        >
          ← Admin tools
        </Link>
        <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
          Admin · Demo customers
        </p>
        <h1 className='mt-2 text-4xl font-bold text-foreground'>
          Prepare demo personas
        </h1>
        <p className='mt-3 max-w-3xl text-muted-foreground'>
          Create customers in the configured demo environment or deliberately
          target another account.
        </p>

        <div className='mt-8'>
          <AdminCredentialPanel />
          <p className='mt-2 text-xs text-gray-600'>
            Stripe is optional for a Metronome-only starter catalog. If the
            target catalog was seeded with Stripe billing, provide the matching
            Stripe test key so its package payment gates remain consistent.
          </p>
        </div>

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
                onChange={(event) => {
                  setMode(event.target.value as DemoMode);
                  setStory('healthy');
                  setEmail(randomEmail());
                  setCustomerId('');
                }}
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
                onChange={(event) => {
                  setPersona(event.target.value as Persona);
                  setEmail(randomEmail());
                  setCustomerId('');
                }}
                className='mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
              >
                <option value='pro'>Pro</option>
                <option value='quickstart'>Enterprise Quickstart</option>
                <option value='b2b'>B2B power user</option>
              </select>
            </label>
          </div>
          <div className='mt-4'>
            <div className='flex items-center justify-between gap-3'>
              <label
                htmlFor='demo-customer-email'
                className='text-sm font-medium text-gray-700'
              >
                Customer email
              </label>
              <button
                type='button'
                onClick={() => {
                  setEmail(randomEmail());
                  setCustomerId('');
                  setMessage(null);
                }}
                disabled={loading !== null}
                className='inline-flex items-center gap-1.5 text-xs font-semibold text-purple hover:underline disabled:opacity-50'
              >
                <RefreshCw className='h-3.5 w-3.5' />
                Re-generate
              </button>
            </div>
            <input
              id='demo-customer-email'
              type='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2'
            />
          </div>
          <label className='mt-4 block text-sm font-medium text-gray-700'>
            Usage profile
            <select
              value={story}
              onChange={(event) => setStory(event.target.value as Story)}
              className='mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2'
            >
              <option value='healthy'>Healthy growth</option>
              <option value='at-risk'>At risk</option>
              <option value='burst'>Late-month spike</option>
            </select>
          </label>
          <details className='mt-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950'>
            <summary className='cursor-pointer font-semibold'>
              How usage profiles affect seeded data
            </summary>
            <div className='mt-3 space-y-2 text-xs leading-5'>
              <p>
                Profiles control synthetic usage volume and timing. They are
                not Metronome plan tiers and do not automatically classify a
                customer&apos;s risk.
              </p>
              {persona === 'b2b' ? (
                <>
                  <p>
                    Percentages below are consumption of each seat&apos;s
                    monthly allocation after the negotiated 15% discount.
                    Seeded list-rate usage is increased so these are the actual
                    credit-balance effects:
                  </p>
                  <ul className='list-disc space-y-1 pl-5'>
                    <li>Healthy: 115%, 60%, 42%, 25%, 12%</li>
                    <li>At-Risk: 145%, 78%, 58%, 36%, 20%</li>
                    <li>Late-month Spike: 175%, 110%, 68%, 48%, 28%</li>
                  </ul>
                  <p>
                    Healthy and At-Risk have one spill seat; Late-month Spike
                    has two. This is seat spill into shared commitment, not
                    account-level overage.
                  </p>
                </>
              ) : (
                <ul className='list-disc space-y-1 pl-5'>
                  {mode === 'generation' && persona === 'pro' ? (
                    <>
                      <li>Healthy: about 50% of the monthly grant.</li>
                      <li>At-Risk: about 85% of the monthly grant.</li>
                      <li>
                        Late-month Spike: about 90%, concentrated late in the
                        period.
                      </li>
                    </>
                  ) : mode === 'generation' ? (
                    <>
                      <li>
                        Healthy follows elapsed term pace, with a 10% demo
                        floor.
                      </li>
                      <li>
                        At-Risk runs at 135% of elapsed pace, with a 15% floor.
                      </li>
                      <li>
                        Late-month Spike runs near elapsed pace, with a 12%
                        floor and most usage concentrated recently.
                      </li>
                    </>
                  ) : persona === 'pro' ? (
                    <>
                      <li>Healthy: about 50% of the current monthly grant.</li>
                      <li>
                        At-Risk: about 85%, crossing the $5 auto-top-up
                        threshold.
                      </li>
                      <li>
                        Late-month Spike: about 90%, concentrated late in the
                        period.
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        Healthy follows elapsed term pace, with a 10% demo
                        floor.
                      </li>
                      <li>
                        At-Risk runs at 135% of elapsed pace, with a 15% floor.
                      </li>
                      <li>
                        Late-month Spike runs near elapsed pace, with a 12%
                        floor and most usage concentrated recently.
                      </li>
                    </>
                  )}
                </ul>
              )}
              <p className='font-medium text-amber-900'>
                Usage is immutable and additive. Create a fresh customer to
                compare a different profile.
              </p>
            </div>
          </details>
          <button
            type='button'
            onClick={prepareCustomer}
            disabled={
              !email.trim() ||
              loading !== null ||
              explicitCredentialsMissing
            }
            className='mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-50'
          >
            {loading === 'prepare' && (
              <LoaderCircle className='h-4 w-4 animate-spin' />
            )}
            Prepare {persona === 'b2b' ? 'B2B power user' : persona}
          </button>
        </section>

        <section className='mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950'>
          Usage profiles are selected before customer creation. Metronome usage
          is immutable and additive, so changing a prepared customer from one
          profile to another would combine both histories. Create a fresh
          customer email when you need a different profile.
          {customerId && (
            <p className='mt-2 font-mono text-xs'>Customer: {customerId}</p>
          )}
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

const PERSONA_LABELS: Record<Persona, string> = {
  pro: 'Pro',
  quickstart: 'Enterprise Quickstart',
  b2b: 'B2B power user',
};

