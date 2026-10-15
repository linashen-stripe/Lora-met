/* eslint-disable i18next/no-literal-string */
'use client';

import { useMemo, useState } from 'react';
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
import StarterPricingDimensionEditor, {
  type StarterPricingDimensionDraft,
  validateStarterPricingDimension,
} from '@/components/admin/StarterPricingDimensionEditor';
import { useConfigContext } from '@/contexts/ConfigContext';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { inspectedFetch } from '@/utils/inspectedFetch';
import { useTerminalLines } from '@/utils/useTerminalLines';

type StarterMode = 'ai-builder' | 'generation';
type StarterAction = 'plan' | 'seed' | 'reset';
type ResetScope = 'demo-data' | 'full';

type ModeConfig = {
  prefix: string;
  quickstartName: string;
  proName: string;
  powerUserName: string;
  pricing: StarterPricingDimensionDraft;
};

const MODE_ORDER: StarterMode[] = ['ai-builder', 'generation'];
const MODE_LABELS: Record<StarterMode, string> = {
  'ai-builder': 'AI Builder',
  generation: 'Generation',
};
const RESERVED_PRICING_KEYS: Record<StarterMode, readonly string[]> = {
  'ai-builder': [
    'model',
    'processing_tier',
    'upstream_provider',
    'user_id',
    'team_id',
    'project_id',
  ],
  generation: [
    'modality',
    'operation',
    'quality',
    'model',
    'workspace_id',
    'project_id',
    'user_id',
  ],
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

function defaultPricing(mode: StarterMode): StarterPricingDimensionDraft {
  return {
    enabled: false,
    propertyKey: 'time_band',
    values: [
      { value: 'off_peak', multiplier: '0.8' },
      { value: 'standard', multiplier: '1' },
      { value: 'peak', multiplier: '1.25' },
    ],
    metrics: METRICS[mode].map((metric) => metric.key),
  };
}

function initialConfig(mode: StarterMode): ModeConfig {
  return {
    prefix: mode === 'ai-builder' ? 'Build' : 'Generate',
    quickstartName: `${MODE_LABELS[mode]} Enterprise Quickstart`,
    proName: `${MODE_LABELS[mode]} Pro`,
    powerUserName: `${MODE_LABELS[mode]} B2B Power User`,
    pricing: defaultPricing(mode),
  };
}

function resolvedPricing(draft: StarterPricingDimensionDraft) {
  if (!draft.enabled || validateStarterPricingDimension(draft)) return null;
  return {
    propertyKey: draft.propertyKey.trim(),
    values: draft.values.map((entry) => ({
      value: entry.value.trim(),
      multiplier: Number(entry.multiplier),
    })),
    metrics: draft.metrics,
  };
}

function ModeReview({
  mode,
  config,
}: {
  mode: StarterMode;
  config: ModeConfig;
}) {
  const custom = resolvedPricing(config.pricing);
  const aiBuilder = mode === 'ai-builder';
  const review = aiBuilder
    ? {
        mode: 'AI Builder',
        prefix: config.prefix,
        billingUnit: 'USD (cents)',
        eventType: 'ai_platform.usage',
        canonicalDimensions: ['model', 'processing_tier'],
        usageMetrics: METRICS[mode].map((metric) => metric.label),
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
        customPricingProperty: custom,
      }
    : {
        mode: 'Generation',
        prefix: config.prefix,
        billingUnit: 'Generation Credits (1 credit = $0.01)',
        eventType: 'generation.completed',
        canonicalDimensions: ['operation', 'quality', 'model'],
        usageMetrics: METRICS[mode].map((metric) => metric.label),
        packages: [
          'Free · 100 one-time credits',
          'Pro · $20/month + 1,000 monthly credits',
          'Enterprise Quickstart · $1,000 prepaid · 100,000 credits · 12 months',
        ],
        b2b:
          '1,000,000-credit annual commit · 5 × $1,000/month seats · 10,000 monthly credits/seat · 15% usage discount',
        personas: [
          config.proName,
          config.quickstartName,
          config.powerUserName,
        ],
        customPricingProperty: custom,
      };

  return (
    <details className='rounded-xl border border-gray-200 bg-gray-50'>
      <summary className='flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900'>
        Review starter configuration
        <ChevronDown className='h-4 w-4' />
      </summary>
      <div className='space-y-3 border-t border-gray-200 p-4 text-sm text-gray-700'>
        <p>
          <span className='font-semibold'>Billing unit:</span>{' '}
          {review.billingUnit}
        </p>
        <p>
          <span className='font-semibold'>Canonical dimensions:</span>{' '}
          {review.canonicalDimensions.join(', ')}
        </p>
        <div>
          <p className='font-semibold'>Usage metrics</p>
          <ul className='mt-1 list-disc pl-5'>
            {review.usageMetrics.map((metric) => (
              <li key={metric}>{metric}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className='font-semibold'>Packages</p>
          <ul className='mt-1 list-disc pl-5'>
            {review.packages.map((pkg) => (
              <li key={pkg}>{pkg}</li>
            ))}
          </ul>
        </div>
        <p>
          <span className='font-semibold'>B2B:</span> {review.b2b}
        </p>
        <details className='rounded-lg border border-gray-200 bg-white'>
          <summary className='cursor-pointer px-3 py-2 text-xs font-semibold'>
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
  const language = settings?.language || 'en';
  const { lines, outputRef, appendLine, appendLines } = useTerminalLines();
  const [apiKey, setApiKey] = useState('');
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [deliveryMethodId, setDeliveryMethodId] = useState('');
  const [selectedModes, setSelectedModes] = useState<StarterMode[]>([]);
  const [configs, setConfigs] = useState<Record<StarterMode, ModeConfig>>({
    'ai-builder': initialConfig('ai-builder'),
    generation: initialConfig('generation'),
  });
  const [completedModes, setCompletedModes] = useState<StarterMode[]>([]);
  const [running, setRunning] = useState<{
    mode: StarterMode;
    action: StarterAction;
  } | null>(null);
  const [resetScope, setResetScope] = useState<ResetScope>('demo-data');
  const [resetConfirmationText, setResetConfirmationText] = useState('');

  const orderedSelectedModes = useMemo(
    () => MODE_ORDER.filter((mode) => selectedModes.includes(mode)),
    [selectedModes],
  );

  const toggleMode = (mode: StarterMode) => {
    setSelectedModes((current) =>
      current.includes(mode)
        ? current.filter((candidate) => candidate !== mode)
        : [...current, mode],
    );
    setCompletedModes((current) =>
      current.filter((candidate) => candidate !== mode),
    );
  };

  const updateConfig = (mode: StarterMode, patch: Partial<ModeConfig>) => {
    setConfigs((current) => ({
      ...current,
      [mode]: { ...current[mode], ...patch },
    }));
    setCompletedModes((current) =>
      current.filter((candidate) => candidate !== mode),
    );
  };

  const run = async (
    mode: StarterMode,
    action: StarterAction,
    confirmReset = false,
  ) => {
    const config = configs[mode];
    const pricingError = validateStarterPricingDimension(
      config.pricing,
      RESERVED_PRICING_KEYS[mode],
    );
    if (!apiKey.trim() || running) return;
    if (stripeEnabled && !stripeSecretKey.trim()) {
      appendLine('✗ Enter a Stripe test secret key or turn off Stripe billing.');
      return;
    }
    if (action !== 'reset' && pricingError) {
      appendLine(`✗ ${pricingError}`);
      return;
    }
    setRunning({ mode, action });
    appendLines([
      '',
      `$ starter:${action} --mode=${mode} --prefix=${config.prefix}`,
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
          pricingDimension:
            action === 'reset' ? null : resolvedPricing(config.pricing),
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
        if (message.type === 'log') appendLine(message.line);
        if (message.type === 'error') appendLine(`✗ ${message.error}`);
        if (message.type === 'result') {
          succeeded = true;
          appendLine(`✓ ${MODE_LABELS[mode]} ${action} completed`);
        }
      });
      if (succeeded && action === 'seed') {
        setCompletedModes((current) =>
          current.includes(mode) ? current : [...current, mode],
        );
      }
      if (succeeded && action === 'reset') {
        setCompletedModes((current) =>
          current.filter((candidate) => candidate !== mode),
        );
        setResetConfirmationText('');
      }
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
      <div className='mx-auto max-w-6xl'>
        <div className='mb-8 flex items-end justify-between gap-4'>
          <div>
            <p className='text-sm font-semibold uppercase tracking-wide text-purple'>
              Admin tools
            </p>
            <h1 className='mt-2 text-3xl font-bold'>Account setup</h1>
            <p className='mt-3 max-w-3xl text-sm text-muted-foreground'>
              Prepare a target Metronome account one demo mode at a time. Keys
              stay in page memory and are never written to browser storage or
              environment files.
            </p>
          </div>
          <Link
            href={`/${language}/admin`}
            className='text-sm font-medium text-purple hover:underline'
          >
            Back to admin tools
          </Link>
        </div>

        <div className='grid gap-6 lg:grid-cols-[1fr_1.15fr]'>
          <div className='space-y-6'>
            <section className='rounded-2xl border bg-white p-6'>
              <div className='flex items-center gap-3'>
                <Sprout className='h-6 w-6 text-purple' />
                <h2 className='text-xl font-semibold'>
                  1. Select modes and credentials
                </h2>
              </div>
              <p className='mt-2 text-xs text-gray-500'>
                Nothing is selected by default. When both are selected, AI
                Builder is completed before Generation.
              </p>
              <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                {MODE_ORDER.map((mode) => (
                  <label
                    key={mode}
                    className={`cursor-pointer rounded-xl border p-4 ${
                      selectedModes.includes(mode)
                        ? 'border-purple bg-purple/5'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className='flex items-start gap-3'>
                      <input
                        type='checkbox'
                        checked={selectedModes.includes(mode)}
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

              <label className='mt-5 block text-sm font-medium'>
                Target Metronome API key
                <input
                  type='password'
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete='off'
                  placeholder='mtr_…'
                  className='mt-2 w-full rounded-lg border px-3 py-2 font-mono text-sm'
                />
              </label>

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
                    Optional. Requires a connected matching Stripe test
                    account.
                  </span>
                </span>
              </label>
              {stripeEnabled && (
                <div className='mt-3 space-y-3'>
                  <input
                    type='password'
                    value={stripeSecretKey}
                    onChange={(event) =>
                      setStripeSecretKey(event.target.value)
                    }
                    placeholder='Stripe test secret key'
                    className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
                  />
                  <input
                    value={deliveryMethodId}
                    onChange={(event) =>
                      setDeliveryMethodId(event.target.value)
                    }
                    placeholder='Delivery method ID (optional when unique)'
                    className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
                  />
                </div>
              )}
            </section>

            {orderedSelectedModes.map((mode, index) => {
              const config = configs[mode];
              const predecessor = orderedSelectedModes[index - 1];
              const locked =
                Boolean(predecessor) && !completedModes.includes(predecessor);
              const complete = completedModes.includes(mode);
              const isRunning = running?.mode === mode;
              return (
                <section
                  key={mode}
                  className={`rounded-2xl border bg-white p-6 ${
                    locked ? 'opacity-60' : ''
                  }`}
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-purple'>
                        {index + 2}. Configure and seed
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
                  </div>
                  {locked && (
                    <p className='mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900'>
                      Complete {MODE_LABELS[predecessor]} before seeding this
                      mode.
                    </p>
                  )}

                  <div className='mt-5 space-y-4'>
                    <label className='block text-sm font-medium'>
                      Resource prefix
                      <input
                        value={config.prefix}
                        disabled={locked}
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
                            disabled={locked}
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

                    <StarterPricingDimensionEditor
                      draft={config.pricing}
                      metricOptions={METRICS[mode]}
                      reservedKeys={RESERVED_PRICING_KEYS[mode]}
                      disabled={locked}
                      onChange={(pricing) =>
                        updateConfig(mode, { pricing })
                      }
                    />
                    <ModeReview mode={mode} config={config} />

                    <div className='grid grid-cols-2 gap-3'>
                      <button
                        type='button'
                        disabled={locked || !apiKey.trim() || Boolean(running)}
                        onClick={() => run(mode, 'plan')}
                        className='rounded-lg border border-purple px-4 py-2.5 font-semibold text-purple disabled:opacity-40'
                      >
                        Preview
                      </button>
                      <button
                        type='button'
                        disabled={locked || !apiKey.trim() || Boolean(running)}
                        onClick={() => run(mode, 'seed')}
                        className='flex items-center justify-center gap-2 rounded-lg bg-purple px-4 py-2.5 font-semibold text-white disabled:opacity-40'
                      >
                        {isRunning && running.action === 'seed' && (
                          <LoaderCircle className='h-4 w-4 animate-spin' />
                        )}
                        Seed {MODE_LABELS[mode]}
                      </button>
                    </div>
                  </div>
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
                  {orderedSelectedModes.map((mode) => (
                    <div key={mode} className='grid grid-cols-2 gap-3'>
                      <button
                        type='button'
                        disabled={!apiKey.trim() || Boolean(running)}
                        onClick={() => run(mode, 'reset', false)}
                        className='rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-40'
                      >
                        Preview {MODE_LABELS[mode]} reset
                      </button>
                      <button
                        type='button'
                        disabled={
                          resetConfirmationText !== 'metronome-starter' ||
                          !apiKey.trim() ||
                          Boolean(running)
                        }
                        onClick={() => run(mode, 'reset', true)}
                        className='rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40'
                      >
                        Reset {MODE_LABELS[mode]}
                      </button>
                    </div>
                  ))}
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
