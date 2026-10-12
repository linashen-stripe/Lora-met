/* eslint-disable i18next/no-literal-string */
'use client';

import { useState, useCallback } from 'react';
import fetchClient from '@/utils/fetchClient';
import { useUsageChartRefresh } from '@/contexts/UsageChartRefreshContext';
import { useConfigContext } from '@/contexts/ConfigContext';

export default function SeedingTab() {
  const { bumpInvoicePacingChart } = useUsageChartRefresh();
  const { demoMode } = useConfigContext();

  const [customerId, setCustomerId] = useState('');
  const [story, setStory] = useState<'healthy' | 'at-risk' | 'burst'>('healthy');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSeed = useCallback(async () => {
    const cid = customerId.trim();
    if (!cid) return;
    setLoading(true);
    setResult(null);
    const q = new URLSearchParams({
      customerId: cid,
      story:
        demoMode === 'ai-builder' && story === 'burst' ? 'at-risk' : story,
    });
    try {
      const endpoint =
        demoMode === 'generation'
          ? '/api/metronome/seed-usage-multi-project'
          : '/api/metronome/seed-usage-multi-seat';
      const { data } = await fetchClient.get(
        `${endpoint}?${q.toString()}`,
      );
      setResult(
        data.message ??
          `Seeded ${data.eventsIngested ?? '?'} generation jobs (${data.creditsConsumed ?? '?'} credits) — refreshing charts…`,
      );
      await new Promise((r) => setTimeout(r, 3000));
      bumpInvoicePacingChart();
      setResult(
        data.message ??
          `Seeded ${data.eventsIngested ?? '?'} generation jobs (${data.creditsConsumed ?? '?'} credits)`,
      );
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setResult(
        `Error: ${e?.response?.data?.error ?? e?.message ?? 'unknown'}`,
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, story, demoMode, bumpInvoicePacingChart]);

  return (
    <div className='space-y-4'>
      <p className='text-xs text-gray-600'>
        Seed deterministic {demoMode === 'generation' ? 'generation jobs' : 'token usage'}{' '}
        across multiple users and projects. Events use{' '}
        <code className='rounded bg-gray-100 px-0.5'>model</code> and{' '}
        <code className='rounded bg-gray-100 px-0.5'>user_id</code>.
      </p>

      <div>
        <label
          htmlFor='tools-seed-customer-id'
          className='mb-1.5 block text-sm font-medium text-gray-700'
        >
          Metronome customer ID
        </label>
        <input
          id='tools-seed-customer-id'
          type='text'
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          autoComplete='off'
          className='w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500'
        />
      </div>

      <div>
        <label
          htmlFor='tools-seed-story'
          className='mb-1.5 block text-sm font-medium text-gray-700'
        >
          Usage story
        </label>
        <select
          id='tools-seed-story'
          value={story}
          onChange={(e) =>
            setStory(e.target.value as 'healthy' | 'at-risk' | 'burst')
          }
          className='w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500'
        >
          <option value='healthy'>Healthy growth</option>
          <option value='at-risk'>At risk of exceeding commitment</option>
          {demoMode === 'generation' && (
            <option value='burst'>Late-month burst</option>
          )}
        </select>
      </div>

      <button
        type='button'
        onClick={handleSeed}
        disabled={loading || !customerId.trim()}
        className='w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400'
      >
        {loading ? 'Seeding…' : 'Seed'}
      </button>

      {result && (
        <p
          className={`whitespace-pre-wrap break-words text-xs ${
            result.startsWith('Error')
              ? 'text-red-600'
              : 'text-green-700'
          }`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
