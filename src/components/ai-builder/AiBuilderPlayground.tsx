/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Code2,
  Coins,
  LoaderCircle,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import {
  consumptionData,
  restaurantCodeSteps,
  restaurantPrompts,
  restaurantResponses,
  type Message,
} from '@/app/[locale]/chat/data';
import { useConfigContext } from '@/contexts/ConfigContext';
import { getEffectiveMetronomeCustomerId } from '@/config/metronomeDefaults';
import fetchClient from '@/utils/fetchClient';
import { CHAT_TIER_TO_METRONOME_MODEL } from '@/config/metronomeModelLabels';
import { getAiBuilderChatStorageKey } from '@/utils/aiBuilderOptimisticBalance';

interface BuilderState {
  storyRunId: string;
  step: number;
  messages: Message[];
  balanceContractId?: string;
  availableBalanceCents?: number;
  pendingSpendCents?: number;
  pendingSpendAt?: string;
  trialSpendCents: number;
  planSpendCents: number;
}

function initialState(): BuilderState {
  return {
    storyRunId:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    step: 0,
    messages: [],
    trialSpendCents: 0,
    planSpendCents: 0,
  };
}

function buildRestaurantPreview(completedSteps: number): string | null {
  if (completedSteps === 0) return null;

  let html = restaurantCodeSteps[0].html;
  if (completedSteps >= 2) {
    html = html.replace(
      /<header>[\s\S]*?<\/header>/,
      restaurantCodeSteps[1].html,
    );
  }
  if (completedSteps >= 3) {
    html = html.replace(
      /<section id="home"[\s\S]*?<\/section>/,
      restaurantCodeSteps[2].html,
    );
  }
  if (completedSteps >= 4) {
    html = html.replace(
      /<section id="menu"[\s\S]*?<\/section>/,
      restaurantCodeSteps[3].html,
    );
  }
  if (completedSteps >= 5) {
    html = html.replace(
      /<section id="reservations"[\s\S]*?<\/section>/,
      restaurantCodeSteps[4].html,
    );
  }
  if (completedSteps >= 6) {
    html = html.replace(
      /<section id="about"[\s\S]*?<\/section>/,
      restaurantCodeSteps[5].html,
    );
  }

  const completed = restaurantCodeSteps.slice(0, completedSteps);
  const css = completed.map((step) => step.css).join('\n');
  const js = completed.map((step) => step.js).filter(Boolean).join('\n');

  return html
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('</body>', `<script>${js}</script></body>`);
}

export default function AiBuilderPlayground() {
  const router = useRouter();
  const {
    customer,
    settings,
    plan,
    metronomeContract,
    metronomeContractLoaded,
    triggerMetronomeContractRefresh,
  } = useConfigContext();
  const [state, setState] = useState<BuilderState>(initialState);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = getAiBuilderChatStorageKey(customer?.id);
  const currentStep = Math.min(state.step, restaurantPrompts.length - 1);
  const preview = useMemo(
    () => buildRestaurantPreview(state.step),
    [state.step],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<BuilderState>;
        const storedMessages = parsed.messages ?? [];
        const migratedSpend = storedMessages.reduce(
          (totals, message) => {
            const cents = Math.round(
              Number(message.consumptionData?.creditsCost ?? 0) * 100,
            );
            if (message.creditSource === 'trial') totals.trial += cents;
            if (message.creditSource === 'plan') totals.plan += cents;
            return totals;
          },
          { trial: 0, plan: 0 },
        );
        setState({
          ...initialState(),
          ...parsed,
          storyRunId: parsed.storyRunId ?? initialState().storyRunId,
          trialSpendCents:
            parsed.trialSpendCents ?? migratedSpend.trial,
          planSpendCents: parsed.planSpendCents ?? migratedSpend.plan,
        });
      } else {
        setState(initialState());
      }
    } catch {
      setState(initialState());
    } finally {
      setLoadedStorageKey(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (loadedStorageKey === storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [loadedStorageKey, state, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [generating, state.messages]);

  const totalCost = useMemo(
    () =>
      state.messages
        .filter((message) => message.type === 'assistant')
        .reduce(
          (sum, message) => sum + Number(message.consumptionData?.creditsCost ?? 0),
          0,
        ),
    [state.messages],
  );
  useEffect(() => {
    const contractId = metronomeContract?.id;
    const availableCents = metronomeContract?.creditBalance?.totalAvailable;
    if (!contractId || availableCents == null) return;
    setState((current) => {
      const contractChanged = current.balanceContractId !== contractId;
      const hasPendingSpend = (current.pendingSpendCents ?? 0) > 0;

      if (
        !contractChanged &&
        hasPendingSpend &&
        current.availableBalanceCents != null &&
        availableCents > current.availableBalanceCents
      ) {
        return current;
      }
      if (
        !contractChanged &&
        !hasPendingSpend &&
        current.availableBalanceCents === availableCents
      ) {
        return current;
      }
      return {
        ...current,
        balanceContractId: contractId,
        availableBalanceCents: availableCents,
        pendingSpendCents: 0,
        pendingSpendAt: undefined,
      };
    });
  }, [
    metronomeContract?.creditBalance?.totalAvailable,
    metronomeContract?.id,
  ]);

  const displayedAvailableCents =
    state.availableBalanceCents ??
    metronomeContract?.creditBalance?.totalAvailable;
  const contractName = metronomeContract?.name?.trim().toLowerCase() ?? '';
  const hasPaidPlan =
    /\b(pro|premium|enterprise|quickstart|power)\b/.test(contractName) ||
    /\b(pro|premium|enterprise)\b/.test(
      plan?.lookupKey?.trim().toLowerCase() ?? '',
    );
  const shouldUpgrade =
    metronomeContractLoaded &&
    totalCost >= 5 &&
    (displayedAvailableCents ?? 0) <= 0 &&
    !hasPaidPlan;

  const runStep = async () => {
    if (generating || state.step >= restaurantPrompts.length) return;
    const step = state.step;
    const prompt = restaurantPrompts[step];
    const response = restaurantResponses[step];
    const usage = consumptionData[step];
    const userMessage: Message = {
      id: `builder-${step}-user`,
      type: 'user',
      content: prompt,
    };

    setGenerating(true);
    setState((current) => ({
      ...current,
      messages: [...current.messages, userMessage],
    }));
    await new Promise((resolve) => setTimeout(resolve, 900));

    const assistantMessage: Message = {
      id: `builder-${step}-assistant`,
      type: 'assistant',
      content: response,
      consumptionData: usage,
      creditSource: hasPaidPlan ? 'plan' : 'trial',
    };
    const usageCostCents = Math.round(usage.creditsCost * 100);
    const contractId = metronomeContract?.id;
    const metronomeAvailableCents =
      metronomeContract?.creditBalance?.totalAvailable;
    setState((current) => {
      const contractChanged =
        Boolean(contractId) && current.balanceContractId !== contractId;
      const balanceBeforeUsage = contractChanged
        ? metronomeAvailableCents
        : (current.availableBalanceCents ?? metronomeAvailableCents);
      return {
        ...current,
        step: current.step + 1,
        messages: [...current.messages, assistantMessage],
        ...(contractId ? { balanceContractId: contractId } : {}),
        ...(balanceBeforeUsage != null
          ? {
              availableBalanceCents: Math.max(
                0,
                balanceBeforeUsage - usageCostCents,
              ),
              pendingSpendCents:
                (contractChanged ? 0 : (current.pendingSpendCents ?? 0)) +
                usageCostCents,
              pendingSpendAt: new Date().toISOString(),
            }
          : {}),
        trialSpendCents:
          (current.trialSpendCents ?? 0) +
          (hasPaidPlan ? 0 : usageCostCents),
        planSpendCents:
          (current.planSpendCents ?? 0) +
          (hasPaidPlan ? usageCostCents : 0),
      };
    });
    setGenerating(false);

    const metronomeCustomerId = getEffectiveMetronomeCustomerId(customer);
    if (!metronomeCustomerId) return;

    const model =
      CHAT_TIER_TO_METRONOME_MODEL[
        usage.modelType as keyof typeof CHAT_TIER_TO_METRONOME_MODEL
      ] ?? usage.modelType;
    const baseProperties = {
      api_product: 'chat',
      upstream_provider: 'lora',
      model,
      processing_tier: 'standard',
      user_id: customer?.email ?? 'builder@example.com',
      workspace_id: `workspace-${metronomeCustomerId}`,
      team_id: metronomeCustomerId,
      project_id: 'project-savory-seasons',
    };
    const usageTimestamp = new Date();
    if (!hasPaidPlan) {
      usageTimestamp.setUTCHours(usageTimestamp.getUTCHours() - 1, 59, 0, 0);
    }
    const timestamp = usageTimestamp.toISOString();
    const events = [
      {
        transactionId: `builder-${metronomeCustomerId}-${state.storyRunId}-${step}-input`,
        customerId: metronomeCustomerId,
        eventType: 'ai_platform.usage',
        timestamp,
        properties: {
          ...baseProperties,
          input_tokens: usage.inputTokens,
        },
      },
      {
        transactionId: `builder-${metronomeCustomerId}-${state.storyRunId}-${step}-output`,
        customerId: metronomeCustomerId,
        eventType: 'ai_platform.usage',
        timestamp,
        properties: {
          ...baseProperties,
          output_tokens: usage.outputTokens,
        },
      },
    ];

    try {
      await fetchClient.post('/api/metronome/ingest', { events });
      setTimeout(() => {
        void triggerMetronomeContractRefresh();
      }, 2_000);
    } catch (error) {
      console.warn('AI Builder completed locally; usage ingest is unavailable.', error);
    }
  };

  const reset = () => {
    setState((current) => ({
      ...initialState(),
      balanceContractId: current.balanceContractId,
      availableBalanceCents: current.availableBalanceCents,
      pendingSpendCents: current.pendingSpendCents,
      pendingSpendAt: current.pendingSpendAt,
      trialSpendCents: current.trialSpendCents ?? 0,
      planSpendCents: current.planSpendCents ?? 0,
    }));
  };

  return (
    <div className='min-h-[calc(100vh-64px)] bg-background px-5 py-8 lg:px-10'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <div className='flex items-center gap-2 text-sm font-semibold text-purple'>
              <Code2 className='h-4 w-4' />
              AI Builder
            </div>
            <h1 className='mt-2 text-4xl font-bold tracking-tight'>
              Build an application through conversation
            </h1>
            <p className='mt-2 text-muted-foreground'>
              Token-priced prompts demonstrate Lora’s original usage-based billing model.
            </p>
          </div>
          <div className='flex items-center gap-4 rounded-xl border border-violet-200 bg-white px-5 py-3'>
            <Coins className='h-6 w-6 text-purple' />
            <div>
              <p className='text-xs font-medium uppercase tracking-wide text-gray-500'>
                Available credit
              </p>
              <p className='text-2xl font-bold tabular-nums'>
                {displayedAvailableCents != null
                  ? `$${(displayedAvailableCents / 100).toFixed(2)}`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className='grid items-start gap-6 lg:grid-cols-[420px_1fr]'>
          <section className='flex h-[760px] max-h-[760px] min-h-0 flex-col overflow-hidden rounded-2xl border bg-white'>
            <div className='min-h-0 flex-1 space-y-4 overflow-y-scroll overscroll-contain p-5'>
              {state.messages.length === 0 && (
                <div className='rounded-xl bg-violet-50 p-4 text-sm text-violet-900'>
                  Run the curated six-step story to create the Savory Seasons website.
                </div>
              )}
              {state.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : ''}`}
                >
                  {message.type === 'assistant' && (
                    <div className='mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple text-white'>
                      <Bot className='h-4 w-4' />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.type === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p>{message.content}</p>
                    {message.consumptionData && (
                      <p className='mt-2 text-xs opacity-65'>
                        {message.consumptionData.inputTokens.toLocaleString()} input ·{' '}
                        {message.consumptionData.outputTokens.toLocaleString()} output tokens ·
                        ${message.consumptionData.creditsCost.toFixed(2)} ·{' '}
                        {message.creditSource === 'plan'
                          ? 'Pro plan credit'
                          : message.creditSource === 'trial'
                            ? 'Trial Credit'
                            : 'Credit source unavailable'}
                      </p>
                    )}
                  </div>
                  {message.type === 'user' && (
                    <div className='mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200'>
                      <User className='h-4 w-4' />
                    </div>
                  )}
                </div>
              ))}
              {generating && (
                <div className='flex items-center gap-3 text-sm text-gray-500'>
                  <LoaderCircle className='h-5 w-5 animate-spin text-purple' />
                  Lora is building the next version…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className='border-t p-4'>
              <div className='rounded-xl border bg-gray-50 p-3 text-sm text-gray-700'>
                {state.step < restaurantPrompts.length
                  ? restaurantPrompts[currentStep]
                  : 'The curated application story is complete.'}
              </div>
              <div className='mt-3 flex gap-2'>
                <button
                  type='button'
                  onClick={runStep}
                  disabled={generating || state.step >= restaurantPrompts.length}
                  className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple px-4 py-3 font-semibold text-white disabled:opacity-50'
                >
                  {state.step === 0 ? <Sparkles className='h-4 w-4' /> : <Send className='h-4 w-4' />}
                  {state.step === 0 ? 'Start building' : 'Run next prompt'}
                </button>
                <button
                  type='button'
                  onClick={reset}
                  className='rounded-xl border px-4 py-3 text-sm font-medium'
                >
                  Reset
                </button>
              </div>
              <div className='mt-2 flex justify-end gap-3 text-xs text-gray-400'>
                <span>
                  Trial Credit used: ${((state.trialSpendCents ?? 0) / 100).toFixed(2)}
                </span>
                <span>
                  Pro plan credit used: ${((state.planSpendCents ?? 0) / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </section>

          <section className='flex h-[760px] max-h-[760px] min-h-0 flex-col overflow-hidden rounded-2xl border bg-slate-950'>
            <div className='flex items-center justify-between border-b border-white/10 px-5 py-3 text-white'>
              <span className='font-medium'>Savory Seasons preview</span>
              <span className='text-xs text-slate-400'>Step {state.step} of 6</span>
            </div>
            {preview ? (
              <iframe
                title='AI Builder application preview'
                sandbox='allow-scripts'
                className='min-h-0 flex-1 w-full bg-white'
                srcDoc={preview}
              />
            ) : (
              <div className='flex min-h-0 flex-1 items-center justify-center text-center text-slate-400'>
                <div>
                  <Code2 className='mx-auto h-12 w-12 text-purple' />
                  <p className='mt-4 font-medium text-white'>Application preview</p>
                  <p className='mt-1 text-sm'>Run the first prompt to begin.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {shouldUpgrade &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className='fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4'>
          <div className='w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl'>
            <Sparkles className='mx-auto h-10 w-10 text-purple' />
            <h2 className='mt-4 text-2xl font-bold'>Your free usage credit is used</h2>
            <p className='mt-2 text-gray-600'>
              Upgrade AI Builder to continue the Savory Seasons application story.
            </p>
            <button
              type='button'
              onClick={() =>
                router.push(
                  `/${settings?.language || 'en'}/pricing?upgrade=true&demoMode=ai-builder`,
                )
              }
              className='mt-6 w-full rounded-xl bg-purple px-5 py-3 font-semibold text-white'
            >
              Upgrade AI Builder
            </button>
            <button
              type='button'
              onClick={reset}
              className='mt-3 text-sm font-medium text-gray-500 hover:text-gray-800'
            >
              Reset local story
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
