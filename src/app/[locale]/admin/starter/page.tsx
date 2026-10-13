/* eslint-disable i18next/no-literal-string */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Database, LoaderCircle, RotateCcw, Sprout } from 'lucide-react';
import TerminalPanel from '@/components/admin/TerminalPanel';
import { useConfigContext } from '@/contexts/ConfigContext';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { useTerminalLines } from '@/utils/useTerminalLines';

type StarterMode = 'plan' | 'seed' | 'reset';

export default function MetronomeStarterPage() {
  const { settings } = useConfigContext();
  const language = settings?.language || 'en';
  const { lines, outputRef, appendLine, appendLines } = useTerminalLines();
  const [apiKey, setApiKey] = useState('');
  const [resourcePrefix, setResourcePrefix] = useState('Generate');
  const [quickstartName, setQuickstartName] = useState('Enterprise Quickstart');
  const [proName, setProName] = useState('Pro');
  const [powerUserName, setPowerUserName] = useState('B2B Power User');
  const [timeBasedPricing, setTimeBasedPricing] = useState(false);
  const [running, setRunning] = useState<StarterMode | null>(null);
  const [resetConfirming, setResetConfirming] = useState(false);

  const run = async (mode: StarterMode, confirmReset = false) => {
    if (!apiKey.trim() || running) return;
    setRunning(mode);
    setResetConfirming(false);
    appendLines([
      '',
      `$ starter:${mode}${timeBasedPricing ? ' --time-based-pricing' : ''}`,
    ]);
    try {
      const response = await fetch('/api/metronome/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          mode,
          confirmReset,
          timeBasedPricing,
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

            <label className='mt-5 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4'>
              <input
                type='checkbox'
                checked={timeBasedPricing}
                onChange={(event) => setTimeBasedPricing(event.target.checked)}
                className='mt-1'
              />
              <span>
                <span className='block text-sm font-semibold text-violet-950'>
                  Time-based pricing
                </span>
                <span className='mt-1 block text-xs text-violet-800'>
                  Adds peak/off-peak pricing. Peak is weekdays 09:00–17:00 in
                  America/Los_Angeles.
                </span>
              </span>
            </label>

            <div className='mt-5 grid grid-cols-2 gap-3'>
              <button
                type='button'
                onClick={() => run('plan')}
                disabled={!apiKey.trim() || running !== null}
                className='rounded-lg border border-purple px-4 py-2.5 font-semibold text-purple disabled:opacity-50'
              >
                Preview
              </button>
              <button
                type='button'
                onClick={() => run('seed')}
                disabled={!apiKey.trim() || running !== null}
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
            <TerminalPanel lines={lines} outputRef={outputRef} className='h-[42rem]' />
          </section>
        </div>
      </div>
    </main>
  );
}
