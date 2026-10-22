/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  Database,
  LoaderCircle,
  RotateCcw,
  Sprout,
} from 'lucide-react';
import TerminalPanel from '@/components/admin/TerminalPanel';
import AdminCredentialPanel from '@/components/admin/AdminCredentialPanel';
import { useConfigContext } from '@/contexts/ConfigContext';
import { useAdminCredentials } from '@/contexts/AdminCredentialsContext';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { useTerminalLines } from '@/utils/useTerminalLines';
import aiBuilderManifest from '../../../../../config/metronome/ai-builder-starter.json';
import generationManifest from '../../../../../config/metronome/starter-kit.json';

type StarterMode = 'ai-builder' | 'generation';
type StarterAction = 'plan' | 'seed' | 'reset';
type ResetScope = 'demo-data' | 'full';

type ModeConfig = {
  prefix: string;
  quickstartName: string;
  proName: string;
  powerUserName: string;
};

const MODE_ORDER: StarterMode[] = ['ai-builder', 'generation'];
const MODE_LABELS: Record<StarterMode, string> = {
  'ai-builder': 'AI Builder',
  generation: 'Generation',
};
const METRICS: Record<
  StarterMode,
  Array<{ key: string; label: string }>
> = {
  'ai-builder': [
    { key: 'code_assist_input', label: 'Code Assist · Input Tokens' },
    { key: 'code_assist_output', label: 'Code Assist · Output Tokens' },
    { key: 'chat_input', label: 'Chat · Input Tokens' },
    { key: 'chat_output', label: 'Chat · Output Tokens' },
    { key: 'voice_input', label: 'Voice · Input Tokens' },
    { key: 'voice_output', label: 'Voice · Output Tokens' },
  ],
  generation: [
    { key: 'image', label: 'Image Generations' },
    { key: 'video', label: 'Video Seconds' },
    { key: '3d', label: '3D Generations' },
  ],
};

function initialConfig(mode: StarterMode): ModeConfig {
  return {
    prefix: mode === 'ai-builder' ? 'Build' : 'Generate',
    quickstartName: `${MODE_LABELS[mode]} Enterprise Quickstart`,
    proName: `${MODE_LABELS[mode]} Pro`,
    powerUserName: `${MODE_LABELS[mode]} B2B Power User`,
  };
}

function ModeReview({
  mode,
  config,
}: {
  mode: StarterMode;
  config: ModeConfig;
}) {
  const aiBuilder = mode === 'ai-builder';
  const withPrefix = (name: string, defaultPrefix: string) =>
    name.startsWith(`${defaultPrefix} - `)
      ? `${config.prefix}${name.slice(defaultPrefix.length)}`
      : name;
  const review = aiBuilder
    ? {
        mode: 'AI Builder',
        prefix: config.prefix,
        billingUnit: 'USD (cents)',
        eventType: 'ai_platform.usage',
        canonicalDimensions: ['model', 'processing_tier'],
        usageMetrics: METRICS[mode].map((metric) => metric.label),
        catalog: [
          `Rate card · ${withPrefix(aiBuilderManifest.rateCard.name, aiBuilderManifest.resourcePrefix)}`,
          ...aiBuilderManifest.metrics.flatMap((metric) => [
            `Billable metric · ${withPrefix(metric.name, aiBuilderManifest.resourcePrefix)} · event=${aiBuilderManifest.eventType} · SUM(${metric.aggregationKey}) · filters=api_product:${metric.apiProduct}, model, processing_tier, workspace_id, project_id, user_id · group key=[model, processing_tier, workspace_id, project_id, user_id]`,
            `Usage product · ${withPrefix(metric.name, aiBuilderManifest.resourcePrefix)} · pricing key=[model, processing_tier] · presentation key=[project_id, user_id] · quantity conversion=tokens ÷ 1,000,000`,
          ]),
          ...Object.values(aiBuilderManifest.products).map(
            (name) =>
              `Fixed/subscription product · ${withPrefix(name, aiBuilderManifest.resourcePrefix)}`,
          ),
        ],
        rates: aiBuilderManifest.rates.flatMap((rate) => {
          return [
            `${rate.metric} · ${rate.model} · ${rate.processingTier} · $${(
              rate.centsPerMillionTokens / 100
            ).toFixed(2)}/1M tokens`,
          ];
        }),
        packages: [
          'Free · $5 one-time credit',
          'Pro · $20/month + $20 monthly credit',
          'Enterprise Quickstart · $2,500 prepaid · 12 months',
        ],
        b2b:
          '$100,000 annual commit · 5 × $2,000/month seats · $2,000 monthly credit/seat · 15% usage discount',
        personas: [
          config.proName,
          config.quickstartName,
          config.powerUserName,
        ],
      }
    : {
        mode: 'Generation',
        prefix: config.prefix,
        billingUnit: 'Generation Credits (1 credit = $0.01)',
        eventType: 'generation.completed',
        canonicalDimensions: ['operation', 'quality', 'model', 'service_tier'],
        usageMetrics: METRICS[mode].map((metric) => metric.label),
        catalog: [
          `Pricing unit · ${generationManifest.pricingUnit.name}`,
          `Rate card · ${withPrefix(generationManifest.rateCard.name, generationManifest.resourcePrefix)}`,
          ...generationManifest.metrics.flatMap((metric) => [
            `Billable metric · ${withPrefix(metric.name, generationManifest.resourcePrefix)} · event=${generationManifest.eventType} · SUM(quantity) · filters=modality:${metric.modality}, operation, quality, model, service_tier, workspace_id, project_id, user_id · group key=[operation, quality, model, service_tier, workspace_id, project_id, user_id]`,
            `Usage product · ${withPrefix(metric.name, generationManifest.resourcePrefix)} · pricing key=[operation, quality, model, service_tier] · presentation key=[project_id, user_id]`,
          ]),
          ...Object.values(generationManifest.products).map(
            (name) =>
              `Fixed/subscription product · ${withPrefix(name, generationManifest.resourcePrefix)}`,
          ),
        ],
        rates: generationManifest.rates.flatMap((rate) => {
          const dimension = generationManifest.pricingDimension;
          const variants = dimension.metrics.includes(rate.metric)
            ? dimension.values
            : [{ value: '', multiplier: 1 }];
          return variants.map(
            (variant) =>
              `${rate.metric} · ${rate.operation} · ${rate.quality} · ${rate.model}${
                variant.value
                  ? ` · ${dimension.propertyKey}=${variant.value}`
                  : ''
              } · ${rate.creditsPerUnit * variant.multiplier} credits/unit`,
          );
        }),
        packages: [
          'Free · 100 one-time credits',
          'Pro · $20/month + 2,000 monthly credits',
          'Enterprise Quickstart · $1,000 prepaid · 110,000 credits · 12 months',
        ],
        b2b:
          '1,000,000-credit annual commit · 5 × $1,000/month seats · 10,000 monthly credits/seat · 15% usage discount',
        personas: [
          config.proName,
          config.quickstartName,
          config.powerUserName,
        ],
      };

  return (
    <details className='rounded-xl border border-gray-200 bg-white shadow-sm'>
      <summary className='flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900'>
        Review starter configuration
        <ChevronDown className='h-4 w-4' />
      </summary>
      <div className='space-y-5 border-t border-gray-200 p-4 text-sm text-gray-700'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='rounded-lg bg-gray-50 p-3'>
            <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
              Billing unit
            </p>
            <p className='mt-1 font-medium text-gray-900'>
              {review.billingUnit}
            </p>
          </div>
          <div className='rounded-lg bg-gray-50 p-3'>
            <p className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
              Canonical dimensions
            </p>
            <div className='mt-2 flex flex-wrap gap-1.5'>
              {review.canonicalDimensions.map((dimension) => (
                <span
                  key={dimension}
                  className='rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs text-gray-700'
                >
                  {dimension}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section>
          <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Usage metrics
          </h3>
          <div className='mt-2 grid gap-2 sm:grid-cols-2'>
            {review.usageMetrics.map((metric) => (
              <div
                key={metric}
                className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-medium text-gray-800'
              >
                {metric}
              </div>
            ))}
          </div>
        </section>

        <details className='rounded-lg border border-gray-200 bg-white'>
          <summary className='cursor-pointer px-4 py-3 font-semibold text-gray-900'>
            Catalog primitives ({review.catalog.length})
          </summary>
          <div className='grid gap-3 border-t border-gray-200 bg-gray-50 p-3'>
            {review.catalog.map((entry) => {
              const [type, name, ...details] = entry.split(' · ');
              return (
                <article
                  key={entry}
                  className='min-w-0 rounded-lg border border-gray-200 bg-white p-3'
                >
                  <span className='inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple'>
                    {type}
                  </span>
                  {name && (
                    <h4 className='mt-2 break-words font-semibold leading-5 text-gray-900'>
                      {name}
                    </h4>
                  )}
                  {details.length > 0 && (
                    <div className='mt-2 flex flex-wrap gap-1.5'>
                      {details.map((detail) => (
                        <span
                          key={detail}
                          className='max-w-full break-words rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] leading-4 text-gray-700'
                        >
                          {detail}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </details>

        <details className='rounded-lg border border-gray-200 bg-white'>
          <summary className='cursor-pointer px-4 py-3 font-semibold text-gray-900'>
            Resolved usage rates ({review.rates.length})
          </summary>
          <div className='grid gap-2 border-t border-gray-200 bg-gray-50 p-3 sm:grid-cols-2'>
            {review.rates.map((rate) => {
              const [metric, ...values] = rate.split(' · ');
              return (
                <div
                  key={rate}
                  className='min-w-0 rounded-lg border border-gray-200 bg-white p-3'
                >
                  <p className='break-words font-medium text-gray-900'>
                    {metric}
                  </p>
                  <p className='mt-1 break-words font-mono text-[11px] leading-4 text-gray-600'>
                    {values.join(' · ')}
                  </p>
                </div>
              );
            })}
          </div>
        </details>

        <section>
          <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Packages
          </h3>
          <div className='mt-2 grid gap-2'>
            {review.packages.map((pkg) => (
              <div
                key={pkg}
                className='rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-800'
              >
                {pkg}
              </div>
            ))}
          </div>
        </section>

        <section className='rounded-lg border border-gray-200 bg-gray-50 p-3'>
          <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            B2B terms
          </h3>
          <p className='mt-1 leading-5 text-gray-800'>{review.b2b}</p>
        </section>

        <section>
          <h3 className='text-xs font-semibold uppercase tracking-wide text-gray-500'>
            Demo customers
          </h3>
          <div className='mt-2 flex flex-wrap gap-2'>
            {review.personas.map((persona) => (
              <span
                key={persona}
                className='rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-800'
              >
                {persona}
              </span>
            ))}
          </div>
        </section>

        <details className='rounded-lg border border-gray-200 bg-white'>
          <summary className='cursor-pointer px-4 py-3 text-xs font-semibold'>
            View resolved JSON
          </summary>
          <pre className='max-h-80 overflow-auto border-t p-3 text-[11px]'>
            {JSON.stringify(review, null, 2)}
          </pre>
        </details>
      </div>
    </details>
  );
}

export default function MetronomeStarterPage() {
  const { settings } = useConfigContext();
  const { explicit, resolvedTarget } = useAdminCredentials();
  const language = settings?.language || 'en';
  const { lines, outputRef, appendLine, appendLines } = useTerminalLines();
  const apiKey = explicit.metronomeApiKey;
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const stripeSecretKey = explicit.stripeSecretKey;
  const deliveryMethodId = explicit.deliveryMethodId;
  const [selectedModes, setSelectedModes] = useState<StarterMode[]>([]);
  const [configs, setConfigs] = useState<Record<StarterMode, ModeConfig>>({
    'ai-builder': initialConfig('ai-builder'),
    generation: initialConfig('generation'),
  });
  const [completedModes, setCompletedModes] = useState<StarterMode[]>([]);
  const [expandedModes, setExpandedModes] = useState<StarterMode[]>([]);
  const [running, setRunning] = useState<
    Partial<Record<StarterMode, StarterAction>>
  >({});
  const [resetScope, setResetScope] = useState<ResetScope>('demo-data');
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [completedResets, setCompletedResets] = useState<
    Partial<Record<StarterMode, ResetScope>>
  >({});

  const orderedSelectedModes = useMemo(
    () => MODE_ORDER.filter((mode) => selectedModes.includes(mode)),
    [selectedModes],
  );

  useEffect(() => {
    setStripeEnabled(Boolean(stripeSecretKey.trim()));
  }, [stripeSecretKey]);

  const toggleMode = (mode: StarterMode) => {
    const next = selectedModes.includes(mode)
      ? selectedModes.filter((candidate) => candidate !== mode)
      : [...selectedModes, mode];
    setSelectedModes(next);
    const orderedNext = MODE_ORDER.filter((candidate) =>
      next.includes(candidate),
    );
    setExpandedModes((current) =>
      selectedModes.includes(mode)
        ? current.filter((candidate) => candidate !== mode)
        : MODE_ORDER.filter(
            (candidate) =>
              orderedNext.includes(candidate) &&
              (current.includes(candidate) || candidate === mode),
          ),
    );
    setCompletedModes((current) =>
      current.filter((candidate) => candidate !== mode),
    );
    setCompletedResets((current) => {
      const next = { ...current };
      delete next[mode];
      return next;
    });
  };

  const updateConfig = (mode: StarterMode, patch: Partial<ModeConfig>) => {
    setConfigs((current) => ({
      ...current,
      [mode]: { ...current[mode], ...patch },
    }));
    setCompletedModes((current) =>
      current.filter((candidate) => candidate !== mode),
    );
    setCompletedResets((current) => {
      const next = { ...current };
      delete next[mode];
      return next;
    });
  };

  const run = async (
    mode: StarterMode,
    action: StarterAction,
    confirmReset = false,
  ) => {
    const config = configs[mode];
    if (!apiKey.trim() || running[mode]) return;
    if (stripeEnabled && !stripeSecretKey.trim()) {
      appendLine('✗ Enter a Stripe test secret key or turn off Stripe billing.');
      return;
    }
    setRunning((current) => ({ ...current, [mode]: action }));
    appendLines([
      '',
      `$ [${resolvedTarget ?? 'unverified explicit target'}] starter:${action} --mode=${mode} --prefix=${config.prefix}`,
    ]);
    try {
      const response = await inspectedFetch('/api/metronome/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          mode: action,
          starterMode: mode,
          confirmReset,
          resetScope,
          resourcePrefix: config.prefix,
          quickstartName: config.quickstartName,
          proName: config.proName,
          powerUserName: config.powerUserName,
          stripeSecretKey: stripeEnabled ? stripeSecretKey.trim() : undefined,
          deliveryMethodId: stripeEnabled
            ? deliveryMethodId.trim()
            : undefined,
        }),
      });
      let succeeded = false;
      await consumeNdjsonStream(response, (message) => {
        if (message.type === 'log') {
          appendLine(`[${MODE_LABELS[mode]}] ${message.line}`);
        }
        if (message.type === 'error') {
          appendLine(`[${MODE_LABELS[mode]}] ✗ ${message.error}`);
        }
        if (message.type === 'result') {
          succeeded = true;
          appendLine(`✓ ${MODE_LABELS[mode]} ${action} completed`);
        }
      });
      if (succeeded && action === 'seed') {
        setCompletedModes((current) =>
          current.includes(mode) ? current : [...current, mode],
        );
        setCompletedResets((current) => {
          const next = { ...current };
          delete next[mode];
          return next;
        });
      }
      if (succeeded && action === 'reset' && confirmReset) {
        setCompletedModes((current) =>
          current.filter((candidate) => candidate !== mode),
        );
        setCompletedResets((current) => ({
          ...current,
          [mode]: resetScope,
        }));
      }
    } catch (error) {
      appendLine(
        `[${MODE_LABELS[mode]}] ✗ ${
          error instanceof Error ? error.message : 'Starter job failed'
        }`,
      );
    } finally {
      setRunning((current) => {
        const next = { ...current };
        delete next[mode];
        return next;
      });
    }
  };

  return (
    <main className='min-h-screen bg-background px-6 py-12'>
      <div className='mx-auto max-w-6xl'>
        <Link
          href={`/${language}/admin`}
          className='mb-5 inline-flex text-sm font-semibold text-purple hover:underline'
        >
          ← Admin tools
        </Link>
        <div className='mb-8'>
          <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
            Admin tools
          </p>
          <h1 className='mt-2 text-3xl font-bold'>Target account setup</h1>
          <p className='mt-3 max-w-3xl text-sm text-muted-foreground'>
            Provision starter-owned pricing primitives, packages, demo
            customers, contracts, and representative usage in a target
            Metronome account. Preview before creating resources; reset
            archives only resources owned by the selected starter mode.
            Explicit keys stay in memory and are cleared on refresh.
          </p>
        </div>

        <div className='grid gap-6 lg:grid-cols-[1fr_1.15fr]'>
          <div className='space-y-6'>
            <AdminCredentialPanel explicitOnly />

            <section className='rounded-2xl border bg-white p-6'>
              <div className='flex items-center gap-3'>
                <Sprout className='h-6 w-6 text-purple' />
                <h2 className='text-xl font-semibold'>
                  1. Select modes and billing
                </h2>
              </div>
              <p className='mt-2 text-xs text-gray-500'>
                Enter the target Metronome key above to enable mode selection.
                Nothing is selected by default; selected modes remain
                independent and may run in either order.
              </p>
              <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                {MODE_ORDER.map((mode) => (
                  <label
                    key={mode}
                    className={`rounded-xl border p-4 ${
                      apiKey.trim()
                        ? 'cursor-pointer'
                        : 'cursor-not-allowed opacity-50'
                    } ${
                      selectedModes.includes(mode)
                        ? 'border-purple bg-purple/5'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className='flex items-start gap-3'>
                      <input
                        type='checkbox'
                        checked={selectedModes.includes(mode)}
                        disabled={!apiKey.trim()}
                        onChange={() => toggleMode(mode)}
                        className='mt-1'
                      />
                      <span>
                        <span className='block font-semibold'>
                          {MODE_LABELS[mode]}
                        </span>
                        <span className='mt-1 block text-xs text-gray-600'>
                          {mode === 'ai-builder'
                            ? 'USD token pricing with processing tiers'
                            : 'Image, video, and 3D Generation Credits'}
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <label className='mt-4 flex items-start gap-3 rounded-xl border p-4'>
                <input
                  type='checkbox'
                  checked={stripeEnabled}
                  onChange={(event) =>
                    setStripeEnabled(event.target.checked)
                  }
                  className='mt-1'
                />
                <span>
                  <span className='block text-sm font-semibold'>
                    Stripe-assisted test billing
                  </span>
                  <span className='mt-1 block text-xs text-gray-600'>
                    Optional. Uses the explicit Stripe test credential entered
                    above.
                  </span>
                </span>
              </label>
            </section>

            {orderedSelectedModes.map((mode) => {
              const config = configs[mode];
              const complete = completedModes.includes(mode);
              const runningAction = running[mode];
              return (
                <section
                  key={mode}
                  className='rounded-2xl border bg-white p-6'
                >
                  <button
                    type='button'
                    onClick={() =>
                      setExpandedModes((current) =>
                        current.includes(mode)
                          ? current.filter((candidate) => candidate !== mode)
                          : [...current, mode],
                      )
                    }
                    className='flex w-full items-center justify-between gap-3 text-left'
                    aria-expanded={expandedModes.includes(mode)}
                  >
                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-purple'>
                        2. Configure and seed
                      </p>
                      <h2 className='mt-1 text-xl font-semibold'>
                        {MODE_LABELS[mode]}
                      </h2>
                    </div>
                    {complete && (
                      <span className='flex items-center gap-1 text-sm font-semibold text-green-700'>
                        <CheckCircle2 className='h-4 w-4' />
                        Complete
                      </span>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        expandedModes.includes(mode) ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {expandedModes.includes(mode) && (
                    <div className='mt-5 space-y-4'>
                      <label className='block text-sm font-medium'>
                        Resource prefix
                        <input
                          value={config.prefix}
                          onChange={(event) =>
                            updateConfig(mode, { prefix: event.target.value })
                          }
                          className='mt-1 w-full rounded-lg border px-3 py-2'
                        />
                      </label>
                      <div className='grid gap-3 sm:grid-cols-3'>
                        {(
                          [
                            ['proName', 'Pro customer'],
                            ['quickstartName', 'Quickstart customer'],
                            ['powerUserName', 'B2B customer'],
                          ] as const
                        ).map(([field, label]) => (
                          <label key={field} className='text-xs font-medium'>
                            {label}
                            <input
                              value={config[field]}
                              onChange={(event) =>
                                updateConfig(mode, {
                                  [field]: event.target.value,
                                })
                              }
                              className='mt-1 w-full rounded-lg border px-3 py-2 text-sm'
                            />
                          </label>
                        ))}
                      </div>

                      <ModeReview mode={mode} config={config} />

                      <div className='grid grid-cols-2 gap-3'>
                        <button
                          type='button'
                          disabled={
                            !apiKey.trim() || Boolean(runningAction)
                          }
                          onClick={() => run(mode, 'plan')}
                          className='rounded-lg border border-purple px-4 py-2.5 font-semibold text-purple disabled:opacity-40'
                        >
                          Preview
                        </button>
                        <button
                          type='button'
                          disabled={
                            !apiKey.trim() || Boolean(runningAction)
                          }
                          onClick={() => run(mode, 'seed')}
                          className='flex items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-40'
                        >
                          {runningAction === 'seed' && (
                            <LoaderCircle className='h-4 w-4 animate-spin' />
                          )}
                          Seed {MODE_LABELS[mode]}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}

            {selectedModes.length > 0 && (
              <section className='rounded-2xl border border-red-200 bg-white p-6'>
                <div className='flex items-center gap-3'>
                  <RotateCcw className='h-5 w-5 text-red-600' />
                  <h2 className='text-lg font-semibold'>Reset selected mode</h2>
                </div>
                <div className='mt-4 flex gap-5 text-sm'>
                  <label className='flex items-center gap-2'>
                    <input
                      type='radio'
                      checked={resetScope === 'demo-data'}
                      onChange={() => setResetScope('demo-data')}
                    />
                    Demo customers and contracts only
                  </label>
                  <label className='flex items-center gap-2'>
                    <input
                      type='radio'
                      checked={resetScope === 'full'}
                      onChange={() => setResetScope('full')}
                    />
                    Full mode reset
                  </label>
                </div>
                <input
                  value={resetConfirmationText}
                  onChange={(event) =>
                    setResetConfirmationText(event.target.value)
                  }
                  placeholder='Type metronome-starter'
                  className='mt-4 w-full rounded-lg border px-3 py-2 font-mono text-sm'
                />
                <div className='mt-3 space-y-3'>
                  {orderedSelectedModes.map((mode) => {
                    const completedReset = completedResets[mode];
                    return (
                      <div
                        key={mode}
                        className='rounded-lg border border-red-100 bg-red-50/40 p-3'
                      >
                        <div className='mb-2 flex items-center justify-between gap-3'>
                          <p className='text-sm font-semibold text-gray-900'>
                            {MODE_LABELS[mode]}
                          </p>
                          {completedReset && (
                            <span className='flex items-center gap-1 text-xs font-medium text-green-700'>
                              <CheckCircle2 className='h-3.5 w-3.5' />
                              {completedReset === 'full'
                                ? 'Full reset completed'
                                : 'Demo data reset completed'}
                            </span>
                          )}
                        </div>
                        <div className='grid grid-cols-2 gap-3'>
                          <button
                            type='button'
                            disabled={!apiKey.trim() || Boolean(running[mode])}
                            onClick={() => run(mode, 'reset', false)}
                            className='rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40'
                          >
                            Preview reset
                          </button>
                          <button
                            type='button'
                            disabled={
                              resetConfirmationText !== 'metronome-starter' ||
                              !apiKey.trim() ||
                              Boolean(running[mode])
                            }
                            onClick={() => run(mode, 'reset', true)}
                            className='rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40'
                          >
                            Reset {MODE_LABELS[mode]}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <section className='h-fit rounded-2xl border bg-white p-6 lg:sticky lg:top-6'>
            <div className='mb-4 flex items-center gap-3'>
              <Database className='h-6 w-6 text-purple' />
              <h2 className='text-xl font-semibold'>Setup activity</h2>
            </div>
            <TerminalPanel lines={lines} outputRef={outputRef} />
          </section>
        </div>
      </div>
    </main>
  );
}
