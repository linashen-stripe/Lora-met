/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Code2, LoaderCircle, Send, Sparkles, User } from 'lucide-react';
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

interface BuilderState {
  step: number;
  messages: Message[];
}

const STORAGE_KEY = 'lora-demo:ai-builder:chat';

function initialState(): BuilderState {
  return { step: 0, messages: [] };
}

export default function AiBuilderPlayground() {
  const router = useRouter();
  const { customer, settings, metronomeContract } = useConfigContext();
  const [state, setState] = useState<BuilderState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const currentStep = Math.min(state.step, restaurantPrompts.length - 1);
  const preview = restaurantCodeSteps[Math.max(0, state.step - 1)];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setState(JSON.parse(stored));
    } catch {
      setState(initialState());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

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
  const shouldUpgrade =
    totalCost >= 5 &&
    !metronomeContract?.name?.toLowerCase().includes('premium');

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
    };
    setState((current) => ({
      step: current.step + 1,
      messages: [...current.messages, assistantMessage],
    }));
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
    const timestamp = new Date().toISOString();
    const events = [
      {
        transactionId: `builder-${metronomeCustomerId}-${step}-input`,
        customerId: metronomeCustomerId,
        eventType: 'ai_platform.usage',
        timestamp,
        properties: {
          ...baseProperties,
          input_tokens: usage.inputTokens,
        },
      },
      {
        transactionId: `builder-${metronomeCustomerId}-${step}-output`,
        customerId: metronomeCustomerId,
        eventType: 'ai_platform.usage',
        timestamp,
        properties: {
          ...baseProperties,
          output_tokens: usage.outputTokens,
        },
      },
    ];

    fetchClient.post('/api/metronome/ingest', { events }).catch((error) => {
      console.warn('AI Builder completed locally; usage ingest is unavailable.', error);
    });
  };

  const reset = () => {
    setState(initialState());
    localStorage.removeItem(STORAGE_KEY);
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
          <div className='rounded-xl border bg-white px-5 py-3'>
            <p className='text-xs uppercase tracking-wide text-gray-500'>Synthetic spend</p>
            <p className='text-2xl font-bold'>${totalCost.toFixed(2)}</p>
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-[420px_1fr]'>
          <section className='flex min-h-[620px] flex-col rounded-2xl border bg-white'>
            <div className='flex-1 space-y-4 overflow-y-auto p-5'>
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
                        ${message.consumptionData.creditsCost.toFixed(2)}
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
            </div>
          </section>

          <section className='overflow-hidden rounded-2xl border bg-slate-950'>
            <div className='flex items-center justify-between border-b border-white/10 px-5 py-3 text-white'>
              <span className='font-medium'>Savory Seasons preview</span>
              <span className='text-xs text-slate-400'>Step {state.step} of 6</span>
            </div>
            {preview ? (
              <iframe
                title='AI Builder application preview'
                sandbox='allow-scripts'
                className='h-[620px] w-full bg-white'
                srcDoc={`<html><head><style>${preview.css}</style></head><body>${preview.html}<script>${preview.js}</script></body></html>`}
              />
            ) : (
              <div className='flex h-[620px] items-center justify-center text-center text-slate-400'>
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

      {shouldUpgrade && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4'>
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
        </div>
      )}
    </div>
  );
}
