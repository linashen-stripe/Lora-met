/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Database,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sprout,
  Trash2,
} from 'lucide-react';
import TerminalPanel from '@/components/admin/TerminalPanel';
import {
  METRONOME_STARTER_KIT,
  StarterMetricKey,
} from '@/config/metronomeStarterKit';
import { useConfigContext } from '@/contexts/ConfigContext';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { useTerminalLines } from '@/utils/useTerminalLines';

type StarterMode = 'plan' | 'seed' | 'reset';
type PricingMetric = 'image' | 'video' | '3d';
type PricingValue = { value: string; multiplier: string };
type StarterPackage =
  | {
      key: 'quickstart';
      includedCredits: number;
      prepaidInvoiceCents: number;
    }
  | {
      key: 'pro';
      monthlyCredits: number;
      monthlyPriceCents: number;
    }
  | {
      key: 'power-user';
      annualCommitCredits: number;
      annualCommitCents: number;
      seatCount: number;
    };
const RESERVED_PROPERTY_KEYS = new Set([
  'quantity',
  'modality',
  'operation',
  'model',
  'workspace_id',
  'project_id',
  'user_id',
  'customer_id',
]);

function packageSummary(pkg: StarterPackage): string {
  if (pkg.key === 'quickstart') {
    return `${pkg.includedCredits.toLocaleString()} credits · $${(
      pkg.prepaidInvoiceCents / 100
    ).toLocaleString()} prepaid`;
  }
  if (pkg.key === 'pro') {
    return `${pkg.monthlyCredits.toLocaleString()} credits/month · $${(
      pkg.monthlyPriceCents / 100
    ).toLocaleString()}/month`;
  }
  return `${pkg.annualCommitCredits.toLocaleString()} credits · $${(
    pkg.annualCommitCents / 100
  ).toLocaleString()} annual commit · ${pkg.seatCount} seats`;
}

export default function MetronomeStarterPage() {
  const { settings } = useConfigContext();
  const language = settings?.language || 'en';
  const { lines, outputRef, appendLine, appendLines } = useTerminalLines();
  const [apiKey, setApiKey] = useState('');
  const [resourcePrefix, setResourcePrefix] = useState('Generate');
  const [quickstartName, setQuickstartName] = useState('Enterprise Quickstart');
  const [proName, setProName] = useState('Pro');
  const [powerUserName, setPowerUserName] = useState('B2B Power User');
  const [pricingPropertyEnabled, setPricingPropertyEnabled] = useState(true);
  const [pricingPropertyKey, setPricingPropertyKey] =
    useState('service_tier');
  const [pricingValues, setPricingValues] = useState<PricingValue[]>([
    { value: 'standard', multiplier: '1' },
    { value: 'priority', multiplier: '1.25' },
  ]);
  const [pricingMetrics, setPricingMetrics] = useState<PricingMetric[]>([
    'image',
    'video',
    '3d',
  ]);
  const [running, setRunning] = useState<StarterMode | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);

  const pricingPropertyError = (() => {
    if (!pricingPropertyEnabled) return null;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(pricingPropertyKey.trim())) {
      return 'Use a lowercase property key with letters, numbers, and underscores.';
    }
    if (RESERVED_PROPERTY_KEYS.has(pricingPropertyKey.trim())) {
      return 'Choose a property key that is not already used by the starter.';
    }
    const values = pricingValues.map((entry) => entry.value.trim());
    if (
      values.some(
        (value) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value),
      )
    ) {
      return 'Property values may use letters, numbers, underscores, and hyphens.';
    }
    if (new Set(values).size !== values.length) {
      return 'Property values must be unique.';
    }
    if (
      pricingValues.some(
        (entry) =>
          !Number.isFinite(Number(entry.multiplier)) ||
          Number(entry.multiplier) <= 0,
      )
    ) {
      return 'Every rate multiplier must be greater than zero.';
    }
    if (pricingMetrics.length === 0) {
      return 'Select Image, Video, 3D, or a combination.';
    }
    return null;
  })();

  const pricingDimension =
    pricingPropertyEnabled && !pricingPropertyError
      ? {
          propertyKey: pricingPropertyKey.trim(),
          values: pricingValues.map((entry) => ({
            value: entry.value.trim(),
            multiplier: Number(entry.multiplier),
          })),
          metrics: pricingMetrics,
        }
      : null;

  const resolvedPrefix = resourcePrefix.trim() || 'Generate';
  const reviewConfig = {
    ...METRONOME_STARTER_KIT,
    rateCard: {
      ...METRONOME_STARTER_KIT.rateCard,
      name: `${resolvedPrefix} - Standard Rate Card`,
    },
    metrics: METRONOME_STARTER_KIT.metrics.map((metric) => ({
      ...metric,
      name: `${resolvedPrefix} - ${
        metric.key === 'image'
          ? 'Image Generations'
          : metric.key === 'video'
            ? 'Video Seconds'
            : '3D Generations'
      }`,
    })),
    products: {
      creditGrant: `${resolvedPrefix} - Credit Grant`,
      proSubscription: `${resolvedPrefix} - Pro Subscription`,
      enterpriseSeat: `${resolvedPrefix} - Enterprise Seat`,
    },
    packages: METRONOME_STARTER_KIT.packages.map((pkg) => ({
      ...pkg,
      name: `${resolvedPrefix} ${
        pkg.key === 'quickstart'
          ? 'Enterprise Quickstart'
          : pkg.key === 'pro'
            ? 'Pro'
            : 'B2B Power User'
      }`,
    })),
    personas: METRONOME_STARTER_KIT.personas.map((persona) => ({
      ...persona,
      name:
        persona.key === 'enterprise-quickstart'
          ? quickstartName
          : persona.key === 'pro'
            ? proName
            : powerUserName,
    })),
    pricingDimension,
  };

  const togglePricingMetric = (metric: PricingMetric) => {
    setPricingMetrics((current) =>
      current.includes(metric)
        ? current.filter((candidate) => candidate !== metric)
        : [...current, metric],
    );
  };

  const updatePricingValue = (
    index: number,
    field: keyof PricingValue,
    value: string,
  ) => {
    setPricingValues((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const run = async (mode: StarterMode, confirmReset = false) => {
    if (!apiKey.trim() || running) return;
    if (mode !== 'reset' && pricingPropertyError) {
      appendLine(`✗ ${pricingPropertyError}`);
      return;
    }
    setRunning(mode);
    setResetConfirming(false);
    appendLines([
      '',
      `$ starter:${mode}${
        mode !== 'reset' && pricingDimension
          ? ` --pricing-property=${pricingDimension.propertyKey}`
          : ''
      }`,
    ]);
    try {
      const response = await fetch('/api/metronome/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          mode,
          confirmReset,
          pricingDimension: mode === 'reset' ? null : pricingDimension,
          resourcePrefix,
          quickstartName,
          proName,
          powerUserName,
        }),
      });
      await consumeNdjsonStream(response, (message) => {
        if (message.type === 'log') appendLine(message.line);
        if (message.type === 'error') appendLine(`✗ ${message.error}`);
        if (message.type === 'result') appendLine(`✓ ${mode} completed`);
      });
    } catch (error) {
      appendLine(
        `✗ ${error instanceof Error ? error.message : 'Starter job failed'}`,
      );
    } finally {
      setRunning(null);
    }
  };

  return (
    <main className='min-h-screen bg-background px-6 py-10'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
              Admin tools
            </p>
            <h1 className='mt-2 text-3xl font-bold text-foreground'>
              Metronome Starter Seed
            </h1>
            <p className='mt-3 max-w-3xl text-sm text-muted-foreground'>
              Prepare a new Metronome-only account with a generic Generation
              catalog and three example customers. The target key is used only
              for this job and is not saved.
            </p>
          </div>
          <Link
            href={`/${language}/admin/cleanup-environment`}
            className='text-sm font-medium text-purple hover:underline'
          >
            Open cleanup tools
          </Link>
        </div>

        <div className='grid gap-6 lg:grid-cols-[1fr_1.1fr]'>
          <section className='rounded-2xl border bg-white p-6'>
            <div className='flex items-center gap-3'>
              <Sprout className='h-6 w-6 text-purple' />
              <h2 className='text-xl font-semibold'>Starter configuration</h2>
            </div>

            <label className='mt-5 block text-sm font-medium text-gray-700'>
              Target Metronome API key
            </label>
            <input
              type='password'
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete='off'
              placeholder='mtr_…'
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm'
            />

            <label className='mt-4 block text-sm font-medium text-gray-700'>
              Resource prefix
            </label>
            <input
              value={resourcePrefix}
              onChange={(event) => setResourcePrefix(event.target.value)}
              className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2'
            />

            <div className='mt-4 grid gap-3 sm:grid-cols-3'>
              {[
                ['Quickstart', quickstartName, setQuickstartName],
                ['Pro', proName, setProName],
                ['Power user', powerUserName, setPowerUserName],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className='text-sm font-medium text-gray-700'>
                  {String(label)}
                  <input
                    value={String(value)}
                    onChange={(event) =>
                      (setter as (value: string) => void)(event.target.value)
                    }
                    className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal'
                  />
                </label>
              ))}
            </div>

            <div className='mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4'>
              <label className='flex items-start gap-3'>
                <input
                  type='checkbox'
                  checked={pricingPropertyEnabled}
                  onChange={(event) =>
                    setPricingPropertyEnabled(event.target.checked)
                  }
                  className='mt-1'
                />
                <span>
                  <span className='block text-sm font-semibold text-violet-950'>
                    Custom pricing property
                  </span>
                  <span className='mt-1 block text-xs text-violet-800'>
                    Demonstrates how an event property flows through a billable
                    metric, usage product, and dimensional rates.
                  </span>
                </span>
              </label>

              {pricingPropertyEnabled && (
                <div className='mt-4 space-y-4 border-t border-violet-200 pt-4'>
                  <label className='block text-sm font-medium text-violet-950'>
                    Event property key
                    <input
                      value={pricingPropertyKey}
                      onChange={(event) =>
                        setPricingPropertyKey(event.target.value)
                      }
                      placeholder='service_tier'
                      className='mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono font-normal'
                    />
                  </label>

                  <div>
                    <div className='mb-2 grid grid-cols-[1fr_7rem_2rem] gap-2 text-xs font-semibold uppercase tracking-wide text-violet-800'>
                      <span>Value</span>
                      <span>Rate multiplier</span>
                      <span />
                    </div>
                    <div className='space-y-2'>
                      {pricingValues.map((entry, index) => (
                        <div
                          key={index}
                          className='grid grid-cols-[1fr_7rem_2rem] gap-2'
                        >
                          <input
                            value={entry.value}
                            onChange={(event) =>
                              updatePricingValue(
                                index,
                                'value',
                                event.target.value,
                              )
                            }
                            placeholder={index === 0 ? 'standard' : 'priority'}
                            className='min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-sm'
                          />
                          <input
                            type='number'
                            min='0.01'
                            step='0.05'
                            value={entry.multiplier}
                            onChange={(event) =>
                              updatePricingValue(
                                index,
                                'multiplier',
                                event.target.value,
                              )
                            }
                            className='min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm'
                          />
                          <button
                            type='button'
                            onClick={() =>
                              setPricingValues((current) =>
                                current.filter(
                                  (_, entryIndex) => entryIndex !== index,
                                ),
                              )
                            }
                            disabled={pricingValues.length <= 2}
                            aria-label={`Remove ${entry.value || `value ${index + 1}`}`}
                            className='flex items-center justify-center text-violet-700 disabled:opacity-30'
                          >
                            <Trash2 className='h-4 w-4' />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type='button'
                      onClick={() =>
                        setPricingValues((current) => [
                          ...current,
                          { value: '', multiplier: '1' },
                        ])
                      }
                      disabled={pricingValues.length >= 4}
                      className='mt-2 flex items-center gap-1 text-xs font-semibold text-violet-800 disabled:opacity-40'
                    >
                      <Plus className='h-3.5 w-3.5' />
                      Add value
                    </button>
                  </div>

                  <fieldset>
                    <legend className='text-sm font-medium text-violet-950'>
                      Apply pricing property to
                    </legend>
                    <div className='mt-2 flex gap-5'>
                      {[
                        ['image', 'Image Generations'],
                        ['video', 'Video Seconds'],
                        ['3d', '3D Generations'],
                      ].map(([metric, label]) => (
                        <label
                          key={metric}
                          className='flex items-center gap-2 text-sm text-violet-950'
                        >
                          <input
                            type='checkbox'
                            checked={pricingMetrics.includes(
                              metric as PricingMetric,
                            )}
                            onChange={() =>
                              togglePricingMetric(metric as PricingMetric)
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <p className='text-xs text-violet-800'>
                    Seeded events receive example values. In production, your
                    event producer must supply this property.
                  </p>
                  {pricingPropertyError && (
                    <p className='text-xs font-medium text-red-700'>
                      {pricingPropertyError}
                    </p>
                  )}
                </div>
              )}
            </div>

            <details className='group mt-5 rounded-xl border border-gray-200 bg-gray-50'>
              <summary className='cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-800 marker:hidden'>
                <span className='flex items-center justify-between'>
                  Review starter configuration
                  <span className='text-xs font-normal text-gray-500 group-open:hidden'>
                    Expand
                  </span>
                  <span className='hidden text-xs font-normal text-gray-500 group-open:inline'>
                    Collapse
                  </span>
                </span>
              </summary>
              <div className='space-y-5 border-t border-gray-200 px-4 py-4'>
                <section>
                  <h3 className='text-xs font-bold uppercase tracking-wide text-gray-500'>
                    Pricing unit
                  </h3>
                  <p className='mt-2 text-sm text-gray-800'>
                    {METRONOME_STARTER_KIT.pricingUnit.name}: 1 credit = $
                    {METRONOME_STARTER_KIT.pricingUnit.fiatPerCustomCredit}
                  </p>
                </section>

                <section>
                  <h3 className='text-xs font-bold uppercase tracking-wide text-gray-500'>
                    Usage metrics and base rates
                  </h3>
                  <div className='mt-2 space-y-3'>
                    {METRONOME_STARTER_KIT.metrics.map((metric) => {
                      const metricKey = metric.key as StarterMetricKey;
                      const displayName = `${resolvedPrefix} - ${
                        metricKey === 'image'
                          ? 'Image Generations'
                          : metricKey === 'video'
                            ? 'Video Seconds'
                            : '3D Generations'
                      }`;
                      return (
                        <div
                          key={metric.key}
                          className='rounded-lg border border-gray-200 bg-white p-3'
                        >
                          <p className='text-sm font-semibold text-gray-900'>
                            {displayName}
                          </p>
                          <div className='mt-1 space-y-1 text-xs text-gray-600'>
                            {METRONOME_STARTER_KIT.rates
                              .filter((rate) => rate.metric === metric.key)
                              .map((rate) => (
                                <p
                                  key={`${rate.operation}:${rate.model}`}
                                  className='font-mono'
                                >
                                  {rate.operation} · {rate.model} ·{' '}
                                  {rate.creditsPerUnit} credits/unit
                                </p>
                              ))}
                          </div>
                          <p className='mt-2 text-xs text-violet-700'>
                            {pricingDimension?.metrics.includes(metricKey)
                              ? `${pricingDimension.propertyKey}: ${pricingDimension.values
                                  .map(
                                    (entry) =>
                                      `${entry.value} ×${entry.multiplier}`,
                                  )
                                  .join(', ')}`
                              : 'No custom pricing property'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className='text-xs font-bold uppercase tracking-wide text-gray-500'>
                    Packages
                  </h3>
                  <div className='mt-2 space-y-2'>
                    {METRONOME_STARTER_KIT.packages.map((pkg) => (
                      <div key={pkg.key} className='text-sm'>
                        <p className='font-semibold text-gray-900'>
                          {resolvedPrefix}{' '}
                          {pkg.key === 'quickstart'
                            ? 'Enterprise Quickstart'
                            : pkg.key === 'pro'
                              ? 'Pro'
                              : 'B2B Power User'}
                        </p>
                        <p className='text-xs text-gray-600'>
                          {packageSummary(pkg as StarterPackage)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className='text-xs font-bold uppercase tracking-wide text-gray-500'>
                    Example customers and usage
                  </h3>
                  <div className='mt-2 space-y-1 text-sm text-gray-700'>
                    {METRONOME_STARTER_KIT.personas.map((persona) => {
                      const displayName =
                        persona.key === 'enterprise-quickstart'
                          ? quickstartName
                          : persona.key === 'pro'
                            ? proName
                            : powerUserName;
                      return (
                        <p key={persona.key}>
                          <span className='font-semibold'>{displayName}</span>
                          {' · '}
                          {(persona.usageScale * 21).toLocaleString()} sample
                          events
                        </p>
                      );
                    })}
                  </div>
                </section>

                <details className='rounded-lg border border-gray-200 bg-white'>
                  <summary className='cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700'>
                    View resolved JSON
                  </summary>
                  <pre className='max-h-80 overflow-auto border-t border-gray-200 p-3 text-[11px] leading-5 text-gray-700'>
                    {JSON.stringify(reviewConfig, null, 2)}
                  </pre>
                </details>
              </div>
            </details>

            <div className='mt-5 grid grid-cols-2 gap-3'>
              <button
                type='button'
                onClick={() => run('plan')}
                disabled={
                  !apiKey.trim() ||
                  running !== null ||
                  Boolean(pricingPropertyError)
                }
                className='rounded-lg border border-purple px-4 py-2.5 font-semibold text-purple disabled:opacity-50'
              >
                Preview
              </button>
              <button
                type='button'
                onClick={() => run('seed')}
                disabled={
                  !apiKey.trim() ||
                  running !== null ||
                  Boolean(pricingPropertyError)
                }
                className='flex items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-50'
              >
                {running === 'seed' && (
                  <LoaderCircle className='h-4 w-4 animate-spin' />
                )}
                Seed account
              </button>
            </div>

            <div className='mt-5 border-t pt-5'>
              <button
                type='button'
                onClick={() =>
                  resetConfirming
                    ? run('reset', true)
                    : setResetConfirming(true)
                }
                onBlur={() => setResetConfirming(false)}
                disabled={!apiKey.trim() || running !== null}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                  resetConfirming ? 'bg-red-600' : 'bg-gray-700'
                }`}
              >
                <RotateCcw className='h-4 w-4' />
                {resetConfirming
                  ? 'Confirm starter reset'
                  : 'Reset starter resources'}
              </button>
              <p className='mt-2 text-xs text-gray-500'>
                Reset only archives resources carrying the starter namespace.
              </p>
            </div>
          </section>

          <section className='rounded-2xl border bg-white p-6'>
            <div className='mb-4 flex items-center gap-3'>
              <Database className='h-6 w-6 text-purple' />
              <h2 className='text-xl font-semibold'>Job output</h2>
            </div>
            <TerminalPanel
              lines={lines}
              outputRef={outputRef}
              className='h-[50rem]'
            />
          </section>
        </div>
      </div>
    </main>
  );
}
