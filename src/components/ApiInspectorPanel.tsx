/* eslint-disable i18next/no-literal-string */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useApiInspector } from '@/contexts/ApiInspectorContext';
import { useConfigContext } from '@/contexts/ConfigContext';
import type {
  ApiTraceEntry,
  ApiTraceSource,
} from '@/utils/apiInspector';
import { useTranslation } from 'react-i18next';

function formatJson(value: unknown): string {
  if (value === undefined) return 'No body';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sourceStyles(source: ApiTraceSource): string {
  if (source === 'metronome') return 'bg-violet-100 text-violet-800';
  if (source === 'stripe') return 'bg-indigo-100 text-indigo-800';
  return 'bg-gray-100 text-gray-700';
}

function statusStyles(entry: ApiTraceEntry): string {
  if (entry.state === 'pending') return 'text-amber-600';
  if (entry.state === 'error') return 'text-red-600';
  return 'text-emerald-600';
}

export default function ApiInspectorPanel() {
  const { t } = useTranslation();
  const { settings } = useConfigContext();
  const {
    entries,
    isOpen,
    isPaused,
    setIsOpen,
    setIsPaused,
    clear,
  } = useApiInspector();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<
    'upstream' | 'all' | ApiTraceSource
  >('upstream');
  const [method, setMethod] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [selected, setSelected] = useState<ApiTraceEntry | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const enabled = Boolean(settings?.apiInspectorEnabled);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setIsOpen]);

  const methods = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.method))).sort(),
    [entries],
  );
  const entriesById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...entries]
      .reverse()
      .filter(
        (entry) =>
          source === 'all' ||
          (source === 'upstream'
            ? entry.source === 'metronome' || entry.source === 'stripe'
            : entry.source === source),
      )
      .filter((entry) => method === 'all' || entry.method === method)
      .filter((entry) => outcome === 'all' || entry.state === outcome)
      .filter((entry) => {
        if (!needle) return true;
        return `${entry.method} ${entry.url} ${entry.status ?? ''} ${formatJson(
          entry.request,
        )} ${formatJson(entry.response)}`
          .toLowerCase()
          .includes(needle);
      });
  }, [entries, method, outcome, search, source]);

  if (!enabled) return null;

  return (
    <>
      {isOpen && (
        <button
          type='button'
          aria-label='Close API inspector backdrop'
          onClick={() => setIsOpen(false)}
          className='fixed inset-0 z-[55] bg-black/20 md:hidden'
        />
      )}
      <aside
        aria-labelledby='api-inspector-title'
        className={`fixed right-0 top-0 z-[60] flex h-full w-full max-w-[32rem] transform flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3'>
          <div>
            <h2
              id='api-inspector-title'
              className='text-base font-semibold text-gray-900'
            >
              {t('api_inspector.title')}
            </h2>
            <p className='text-xs text-gray-500'>
              {t('api_inspector.live_activity')} · {entries.length} calls
            </p>
          </div>
          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={() => setIsPaused(!isPaused)}
              aria-label={isPaused ? 'Resume API capture' : 'Pause API capture'}
              className='rounded p-2 text-gray-500 hover:bg-gray-100'
            >
              {isPaused ? (
                <PlayIcon className='h-5 w-5' />
              ) : (
                <PauseIcon className='h-5 w-5' />
              )}
            </button>
            <button
              type='button'
              onClick={() => {
                clear();
                setSelected(null);
              }}
              aria-label='Clear API activity'
              className='rounded p-2 text-gray-500 hover:bg-gray-100'
            >
              <TrashIcon className='h-5 w-5' />
            </button>
            <button
              ref={closeButtonRef}
              type='button'
              onClick={() => setIsOpen(false)}
              aria-label='Close API inspector'
              className='rounded p-2 text-gray-500 hover:bg-gray-100'
            >
              <XMarkIcon className='h-5 w-5' />
            </button>
          </div>
        </div>

        <div className='space-y-2 border-b border-gray-200 p-3'>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('api_inspector.search_placeholder')}
            aria-label='Search API activity'
            className='w-full rounded-md border border-gray-300 px-3 py-2 text-sm'
          />
          <div className='grid grid-cols-3 gap-2'>
            <select
              value={source}
              onChange={(event) =>
                setSource(
                  event.target.value as
                    | 'upstream'
                    | 'all'
                    | ApiTraceSource,
                )
              }
              aria-label='Filter by service'
              className='rounded-md border border-gray-300 px-2 py-1.5 text-xs'
            >
              <option value='upstream'>Upstream APIs</option>
              <option value='metronome'>Metronome</option>
              <option value='stripe'>Stripe</option>
              <option value='app'>App routes</option>
              <option value='all'>All activity</option>
            </select>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              aria-label='Filter by method'
              className='rounded-md border border-gray-300 px-2 py-1.5 text-xs'
            >
              <option value='all'>All methods</option>
              {methods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              aria-label='Filter by outcome'
              className='rounded-md border border-gray-300 px-2 py-1.5 text-xs'
            >
              <option value='all'>All outcomes</option>
              <option value='pending'>Pending</option>
              <option value='success'>Success</option>
              <option value='error'>Errors</option>
            </select>
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          {filtered.length === 0 ? (
            <p className='p-6 text-center text-sm text-gray-500'>
              {t('api_inspector.empty')}
            </p>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.id}
                type='button'
                onClick={() => setSelected(entry)}
                className={`flex w-full items-start gap-2 border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50 ${
                  selected?.id === entry.id ? 'bg-indigo-50' : ''
                }`}
              >
                {entry.parentId ? (
                  <ChevronRightIcon className='mt-1 h-3.5 w-3.5 shrink-0 text-gray-400' />
                ) : (
                  <span className='w-3.5 shrink-0' />
                )}
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${sourceStyles(
                        entry.source,
                      )}`}
                    >
                      {entry.source}
                    </span>
                    <span className='text-xs font-semibold text-gray-700'>
                      {entry.method}
                    </span>
                    <span
                      className={`ml-auto text-xs font-semibold ${statusStyles(
                        entry,
                      )}`}
                    >
                      {entry.status ?? entry.state}
                    </span>
                  </div>
                  <p className='mt-1 truncate font-mono text-xs text-gray-700'>
                    {entry.url}
                  </p>
                  {entry.parentId && entriesById.get(entry.parentId) && (
                    <p className='mt-1 truncate text-[11px] text-gray-500'>
                      via {entriesById.get(entry.parentId)?.url}
                    </p>
                  )}
                  <p className='mt-1 text-[11px] text-gray-400'>
                    {new Date(entry.startedAt).toLocaleTimeString()}
                    {entry.durationMs != null
                      ? ` · ${entry.durationMs} ms`
                      : ''}
                    {entry.stream ? ' · stream' : ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {selected && (
          <section className='max-h-[46%] overflow-y-auto border-t border-gray-300 bg-gray-950 p-3 text-gray-100'>
            <div className='mb-2 flex items-start justify-between gap-3'>
              <p className='break-all font-mono text-xs'>{selected.url}</p>
              <button
                type='button'
                onClick={() => setSelected(null)}
                className='shrink-0 text-gray-400 hover:text-white'
                aria-label='Close API call details'
              >
                <XMarkIcon className='h-4 w-4' />
              </button>
            </div>
            <details open>
              <summary className='cursor-pointer text-xs font-semibold text-gray-300'>
                Request
              </summary>
              <pre className='mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px]'>
                {formatJson(selected.request)}
              </pre>
            </details>
            <details className='mt-3' open>
              <summary className='cursor-pointer text-xs font-semibold text-gray-300'>
                Response
              </summary>
              <pre className='mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px]'>
                {formatJson(selected.response ?? selected.error)}
              </pre>
            </details>
          </section>
        )}
      </aside>

      <button
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close API inspector' : 'Open API inspector'}
        className='fixed bottom-16 right-0 z-50 rounded-l-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-gray-700'
      >
        {isOpen ? 'Close API' : 'API'}
        {entries.length > 0 && !isOpen ? ` ${entries.length}` : ''}
      </button>
    </>
  );
}
