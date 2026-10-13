/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  CheckCircle2,
  Clapperboard,
  Coins,
  Image as ImageIcon,
  LoaderCircle,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import {
  buildGenerationUsageEvent,
  GENERATION_SKUS,
  type GenerationModality,
} from '@/config/generationCatalog';
import fetchClient from '@/utils/fetchClient';

type CompletedJob = {
  taskId: string;
  skuId: string;
  label: string;
  credits: number;
  completedAt: string;
};

type WalletState = {
  balance: number;
  jobs: CompletedJob[];
  contractId?: string;
  pendingUsageCredits?: number;
  pendingUsageAt?: string;
  lastReconciledAt?: string;
};

const FREE_CREDITS = 100;

const modalityMeta: Record<
  GenerationModality,
  { label: string; icon: typeof ImageIcon; prompt: string }
> = {
  image: {
    label: 'Image',
    icon: ImageIcon,
    prompt: 'A sculptural lamp in a warm, editorial studio setting',
  },
  video: {
    label: 'Video',
    icon: Clapperboard,
    prompt: 'Slow cinematic orbit around a futuristic electric motorcycle',
  },
  '3d': {
    label: '3D',
    icon: Box,
    prompt: 'A friendly forest guardian character for an adventure game',
  },
};

function initialWallet(): WalletState {
  return { balance: FREE_CREDITS, jobs: [] };
}

function ResultPreview({
  modality,
  generating,
  completed,
}: {
  modality: GenerationModality;
  generating: boolean;
  completed: boolean;
}) {
  return (
    <div className='relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-violet-200 bg-slate-950'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(149,149,250,0.4),transparent_38%),radial-gradient(circle_at_75%_70%,rgba(99,91,255,0.28),transparent_42%)]' />
      <div className='absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:32px_32px]' />

      {generating ? (
        <div className='relative flex flex-col items-center gap-4 text-white'>
          <LoaderCircle className='h-12 w-12 animate-spin text-purple' />
          <div className='text-center'>
            <p className='font-semibold'>Building your {modality} result</p>
            <p className='mt-1 text-sm text-slate-400'>No model call—this output is simulated.</p>
          </div>
        </div>
      ) : completed ? (
        <div className='relative flex flex-col items-center px-8 text-center text-white'>
          {modality === '3d' && (
            <div className='relative mb-8 h-48 w-48 animate-[spin_14s_linear_infinite]'>
              <div className='absolute inset-5 rotate-45 rounded-[2rem] border-4 border-purple bg-violet-500/30 backdrop-blur-sm' />
              <div className='absolute inset-12 -rotate-12 rounded-3xl border-2 border-cyan-300/70 bg-cyan-300/20' />
              <div className='absolute inset-[5.5rem] rounded-full bg-white' />
            </div>
          )}
          {modality === 'image' && (
            <div className='mb-8 grid h-48 w-72 grid-cols-2 gap-2 rounded-2xl border border-white/20 bg-white/10 p-3'>
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className='rounded-xl bg-[linear-gradient(135deg,rgba(149,149,250,.9),rgba(34,211,238,.35),rgba(15,23,42,.9))]'
                  style={{ opacity: 1 - index * 0.12 }}
                />
              ))}
            </div>
          )}
          {modality === 'video' && (
            <div className='relative mb-8 flex h-48 w-80 items-center justify-center rounded-2xl border border-white/20 bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(99,91,255,.65))]'>
              <div className='h-20 w-32 -skew-x-12 rounded-[50%] border-4 border-cyan-200/80 bg-violet-400/40' />
              <div className='absolute bottom-4 left-5 right-5 h-1 overflow-hidden rounded-full bg-white/20'>
                <div className='h-full w-3/4 bg-white' />
              </div>
            </div>
          )}
          <div className='flex items-center gap-2 text-green-300'>
            <CheckCircle2 className='h-5 w-5' />
            <span className='font-medium'>Generation completed</span>
          </div>
        </div>
      ) : (
        <div className='relative max-w-sm text-center text-slate-300'>
          <Sparkles className='mx-auto h-12 w-12 text-purple' />
          <p className='mt-5 text-lg font-semibold text-white'>Your result will appear here</p>
          <p className='mt-2 text-sm text-slate-400'>
            Select a generation product and run a synthetic job.
          </p>
        </div>
      )}
    </div>
  );
}

export default function GenerationPlayground() {
  const router = useRouter();
  const {
    customer,
    settings,
    metronomeContract,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const [modality, setModality] = useState<GenerationModality>('3d');
  const [selectedSkuId, setSelectedSkuId] = useState('3d-ultra-bundle');
  const [prompt, setPrompt] = useState(modalityMeta['3d'].prompt);
  const [batchSize, setBatchSize] = useState(1);
  const [wallet, setWallet] = useState<WalletState>(initialWallet);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<'idle' | 'sent' | 'offline'>('idle');
  const lastLocalDebitAt = useRef(0);

  const walletKey = `lora-generation-wallet:${customer?.id ?? 'guest'}`;
  const selectedSku =
    GENERATION_SKUS.find((sku) => sku.id === selectedSkuId) ?? GENERATION_SKUS[0];
  const availableSkus = useMemo(
    () => GENERATION_SKUS.filter((sku) => sku.modality === modality),
    [modality],
  );
  const batchCredits = selectedSku.credits * batchSize;
  const outOfCredits = wallet.balance < batchCredits;
  const contractName = metronomeContract?.name?.trim().toLowerCase() ?? '';
  const isFreePlan = !contractName || contractName.includes('free');
  const shouldUpgrade =
    isFreePlan && wallet.balance === 0 && wallet.jobs.length >= 1;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(walletKey);
      setWallet(stored ? JSON.parse(stored) : initialWallet());
    } catch {
      setWallet(initialWallet());
    } finally {
      setHydrated(true);
    }
  }, [walletKey]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(walletKey, JSON.stringify(wallet));
  }, [hydrated, wallet, walletKey]);

  useEffect(() => {
    const metronomeBalance = metronomeContract?.creditBalance?.totalAvailable;
    const metronomeContractId = metronomeContract?.id;
    if (
      !hydrated ||
      metronomeBalance == null ||
      Date.now() - lastLocalDebitAt.current < 15_000
    ) {
      return;
    }
    setWallet((current) => {
      const contractChanged =
        Boolean(metronomeContractId) &&
        current.contractId !== metronomeContractId;
      const hasUnreconciledUsage = (current.pendingUsageCredits ?? 0) > 0;
      const pendingAgeMs = current.pendingUsageAt
        ? Date.now() - new Date(current.pendingUsageAt).getTime()
        : 0;
      if (
        !contractChanged &&
        hasUnreconciledUsage &&
        pendingAgeMs < 120_000 &&
        metronomeBalance > current.balance
      ) {
        return current;
      }
      return {
        ...current,
        balance: metronomeBalance,
        contractId: metronomeContractId,
        pendingUsageCredits: 0,
        pendingUsageAt: undefined,
        lastReconciledAt: new Date().toISOString(),
      };
    });
  }, [hydrated, metronomeContract]);

  const selectModality = (next: GenerationModality) => {
    setModality(next);
    const firstSku = GENERATION_SKUS.find((sku) => sku.modality === next);
    if (firstSku) setSelectedSkuId(firstSku.id);
    setPrompt(modalityMeta[next].prompt);
    setCompleted(false);
  };

  const runGeneration = async () => {
    if (generating || outOfCredits) return;

    lastLocalDebitAt.current = Date.now();
    setWallet((current) => ({
      ...current,
      balance: Math.max(0, current.balance - batchCredits),
    }));
    setGenerating(true);
    setCompleted(false);
    setIngestStatus('idle');
    const taskId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const job: CompletedJob = {
      taskId,
      skuId: selectedSku.id,
      label: batchSize === 1 ? selectedSku.label : `${batchSize}× ${selectedSku.label}`,
      credits: batchCredits,
      completedAt: new Date().toISOString(),
    };
    setWallet((current) => ({
      ...current,
      jobs: [job, ...current.jobs].slice(0, 8),
    }));
    setGenerating(false);
    setCompleted(true);

    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeCustomerId) {
      setIngestStatus('offline');
      return;
    }

    const events = Array.from({ length: batchSize }, (_, index) =>
      buildGenerationUsageEvent({
        taskId: `${taskId}_${index + 1}`,
        customerId: metronomeCustomerId,
        sku: selectedSku,
        userId: customer?.email ?? 'creator@example.com',
        workspaceId: metronomeCustomerId,
        projectId: 'project-lora-launch',
      }),
    );

    try {
      await fetchClient.post('/api/metronome/ingest', { events });
      setWallet((current) => ({
        ...current,
        pendingUsageCredits:
          (current.pendingUsageCredits ?? 0) + batchCredits,
        pendingUsageAt: new Date().toISOString(),
      }));
      setIngestStatus('sent');
      setTimeout(() => {
        void triggerMetronomeContractRefresh();
      }, 15_000);
    } catch (error) {
      console.warn('Generation completed locally; Metronome ingest is unavailable.', error);
      setWallet((current) => ({
        ...current,
        balance: current.balance + batchCredits,
      }));
      setIngestStatus('offline');
    }
  };

  const resetTrial = () => {
    const next = initialWallet();
    setWallet(next);
    localStorage.setItem(walletKey, JSON.stringify(next));
    setCompleted(false);
    setIngestStatus('idle');
  };

  return (
    <div className='min-h-[calc(100vh-64px)] bg-background px-5 py-8 text-foreground lg:px-10'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between'>
          <div>
            <div className='mb-2 flex items-center gap-2 text-sm font-semibold text-purple'>
              <Sparkles className='h-4 w-4' />
              Lora Generate
            </div>
            <h1 className='text-4xl font-bold tracking-tight'>Create production-ready media</h1>
            <p className='mt-2 max-w-2xl text-muted-foreground'>
              One workspace for image, video, and 3D generation—with transparent credit costs.
            </p>
          </div>
          <div className='flex items-center gap-4 rounded-xl border border-violet-200 bg-white px-5 py-3'>
            <Coins className='h-6 w-6 text-purple' />
            <div>
              <p className='text-xs font-medium uppercase tracking-wide text-gray-500'>
                Available credits
              </p>
              <p className='text-2xl font-bold tabular-nums'>{wallet.balance}</p>
            </div>
          </div>
        </div>

        <div className='grid gap-8 lg:grid-cols-[420px_1fr]'>
          <div className='space-y-5'>
            <div className='rounded-2xl border bg-white p-5'>
              <div className='mb-4 grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1'>
                {(Object.keys(modalityMeta) as GenerationModality[]).map((key) => {
                  const Icon = modalityMeta[key].icon;
                  return (
                    <button
                      key={key}
                      onClick={() => selectModality(key)}
                      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        modality === key
                          ? 'bg-white text-purple shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      <Icon className='h-4 w-4' />
                      {modalityMeta[key].label}
                    </button>
                  );
                })}
              </div>

              <label className='text-sm font-semibold text-gray-800'>Prompt</label>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className='mt-2 min-h-24 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/20'
              />

              <div className='mt-5 space-y-2'>
                <p className='text-sm font-semibold text-gray-800'>Generation product</p>
                {availableSkus.map((sku) => (
                  <button
                    key={sku.id}
                    onClick={() => {
                      setSelectedSkuId(sku.id);
                      setCompleted(false);
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedSkuId === sku.id
                        ? 'border-purple bg-purple/5 ring-1 ring-purple'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='font-semibold text-gray-900'>{sku.label}</p>
                        <p className='mt-1 text-xs leading-relaxed text-gray-500'>
                          {sku.description}
                        </p>
                      </div>
                      <span className='whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700'>
                        {sku.credits} credits
                      </span>
                    </div>
                    <div className='mt-3 flex gap-3 text-[11px] uppercase tracking-wide text-gray-400'>
                      <span>{sku.model}</span>
                      <span>{sku.quality}</span>
                      <span>
                        {sku.quantity} {sku.unit}
                        {sku.quantity === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className='mt-5'>
                <p className='text-sm font-semibold text-gray-800'>Demo batch</p>
                <div className='mt-2 grid grid-cols-3 gap-2'>
                  {[1, 5, 10].map((size) => (
                    <button
                      key={size}
                      onClick={() => setBatchSize(size)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        batchSize === size
                          ? 'border-purple bg-purple/5 text-purple'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {size}×
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={runGeneration}
                disabled={generating || outOfCredits}
                className='mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-purple px-5 py-3 font-semibold text-white transition hover:bg-purple-hover disabled:cursor-not-allowed disabled:bg-gray-300'
              >
                {generating ? (
                  <>
                    <LoaderCircle className='h-5 w-5 animate-spin' />
                    Generating…
                  </>
                ) : outOfCredits ? (
                  'Not enough credits'
                ) : (
                  <>
                    <Sparkles className='h-5 w-5' />
                    Generate {batchSize === 1 ? '' : `${batchSize}× `}for {batchCredits} credits
                  </>
                )}
              </button>

              <div className='mt-3 flex items-center justify-between text-xs text-gray-500'>
                <span>
                  {ingestStatus === 'sent'
                    ? 'Usage sent to Metronome'
                    : ingestStatus === 'offline'
                      ? 'Local demo usage'
                      : 'Charged only when the job succeeds'}
                </span>
                {isFreePlan && (
                  <button onClick={resetTrial} className='font-medium text-purple hover:underline'>
                    Reset trial
                  </button>
                )}
              </div>
            </div>

            {wallet.jobs.length > 0 && (
              <div className='rounded-2xl border bg-white p-5'>
                <div className='mb-3 flex items-center gap-2'>
                  <UserRound className='h-4 w-4 text-purple' />
                  <h2 className='font-semibold'>Recent usage</h2>
                </div>
                <div className='space-y-3'>
                  {wallet.jobs.slice(0, 4).map((job) => (
                    <div key={job.taskId} className='flex items-center justify-between text-sm'>
                      <div>
                        <p className='font-medium text-gray-800'>{job.label}</p>
                        <p className='text-xs text-gray-400'>
                          {new Date(job.completedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className='font-semibold text-gray-700'>−{job.credits}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <ResultPreview modality={modality} generating={generating} completed={completed} />
            <div className='mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900'>
              <span className='font-semibold'>Pricing preview:</span> {batchCredits} credits equals $
              {(batchCredits * 0.01).toFixed(2)} at list value. Enterprise
              discounts and included credits are applied by Metronome.
            </div>
          </div>
        </div>
      </div>

      {shouldUpgrade && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4'>
          <div className='w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl'>
            <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100'>
              <Sparkles className='h-6 w-6 text-purple' />
            </div>
            <h2 className='mt-4 text-2xl font-bold text-gray-900'>Your free credits are used</h2>
            <p className='mt-2 text-gray-600'>
              You created two production bundles with complete usage transparency. Upgrade to Pro
              for 1,000 credits every month.
            </p>
            <button
              onClick={() =>
                router.push(
                  `/${settings?.language || 'en'}/pricing?upgrade=true&demoMode=generation`,
                )
              }
              className='mt-6 w-full rounded-xl bg-purple px-5 py-3 font-semibold text-white hover:bg-purple-hover'
            >
              Upgrade to Pro
            </button>
            <p className='mt-3 text-xs text-gray-400'>
              {metronomeContract?.name
                ? `Current contract: ${metronomeContract.name}`
                : 'Free trial workspace'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
