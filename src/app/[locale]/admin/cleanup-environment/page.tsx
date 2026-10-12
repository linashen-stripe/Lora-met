/* eslint-disable i18next/no-literal-string */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildDemoRequestHeaders } from '@/utils/demoRequestHeaders';
import { consumeNdjsonStream } from '@/utils/ndjsonClient';
import { useTerminalLines } from '@/utils/useTerminalLines';
import TerminalPanel from '@/components/admin/TerminalPanel';
import { useConfigContext } from '@/contexts/ConfigContext';

// 3-step admin wizard, in one page, run in order:
//   1. Archive Metronome customers (archive ONLY — never deletes anything)
//   2. Delete Stripe customers
//   3. Create a new power user
//
// Steps 1 and 2 are destructive/irreversible, so each requires an explicit
// two-click confirmation (select rows -> "Archive/Delete Selected" ->
// "Confirm ..." ) before anything is sent to the API. Step 3 is additive and
// runs immediately. All progress streams into one shared terminal panel.

interface MetronomeCustomerSummary {
  id: string;
  name: string;
  createdAt: string;
  ingestAliases: string[];
}

interface StripeCustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  created: number;
}

const STEPS = [
  { n: 1, label: 'Archive Metronome customers' },
  { n: 2, label: 'Delete Stripe customers' },
  { n: 3, label: 'Add power user' },
] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className='mb-6 flex gap-4 text-sm'>
      {STEPS.map((s) => (
        <li
          key={s.n}
          className={`flex items-center gap-2 ${
            s.n === step ? 'font-semibold text-indigo-600' : 'text-gray-400'
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
              s.n === step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {s.n}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export default function CleanupEnvironmentPage() {
  const { demoMode } = useConfigContext();
  const metronomeCustomersUrl = `/api/metronome/demo/customers?demoMode=${demoMode}`;
  const stripeCustomersUrl = `/api/stripe/demo/customers?demoMode=${demoMode}`;
  const [step, setStep] = useState(1);
  const { lines, outputRef, appendLine, appendLines } = useTerminalLines();

  // Step 1 — archive Metronome customers
  const [metronomeCustomers, setMetronomeCustomers] = useState<MetronomeCustomerSummary[] | null>(null);
  const [loadingMetronome, setLoadingMetronome] = useState(false);
  const [selectedMetronomeIds, setSelectedMetronomeIds] = useState<Set<string>>(new Set());
  const [archiveConfirming, setArchiveConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Step 2 — delete Stripe customers
  const [stripeCustomers, setStripeCustomers] = useState<StripeCustomerSummary[] | null>(null);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [selectedStripeIds, setSelectedStripeIds] = useState<Set<string>>(new Set());
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Step 3 — add power user
  const [customerName, setCustomerName] = useState('Bufo');
  const [creatingPowerUser, setCreatingPowerUser] = useState(false);

  const loadMetronomeCustomers = useCallback(async () => {
    setLoadingMetronome(true);
    try {
      const res = await fetch(metronomeCustomersUrl, {
        headers: buildDemoRequestHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to list Metronome customers');
      setMetronomeCustomers(data.customers);
    } catch (err: unknown) {
      const e = err as { message?: string };
      appendLine(`✗ error loading Metronome customers: ${e?.message ?? 'unknown'}`);
      setMetronomeCustomers([]);
    } finally {
      setLoadingMetronome(false);
    }
  }, [appendLine, metronomeCustomersUrl]);

  const loadStripeCustomers = useCallback(async () => {
    setLoadingStripe(true);
    try {
      const res = await fetch(stripeCustomersUrl, {
        headers: buildDemoRequestHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to list Stripe customers');
      setStripeCustomers(data.customers);
    } catch (err: unknown) {
      const e = err as { message?: string };
      appendLine(`✗ error loading Stripe customers: ${e?.message ?? 'unknown'}`);
      setStripeCustomers([]);
    } finally {
      setLoadingStripe(false);
    }
  }, [appendLine, stripeCustomersUrl]);

  useEffect(() => {
    if (step === 1 && metronomeCustomers === null) loadMetronomeCustomers();
    if (step === 2 && stripeCustomers === null) loadStripeCustomers();
  }, [step, metronomeCustomers, stripeCustomers, loadMetronomeCustomers, loadStripeCustomers]);

  const toggleSelected = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const handleArchiveClick = async () => {
    if (selectedMetronomeIds.size === 0) return;
    if (!archiveConfirming) {
      setArchiveConfirming(true);
      return;
    }
    setArchiveConfirming(false);
    setArchiving(true);
    const ids = Array.from(selectedMetronomeIds);
    appendLines(['', `$ archive ${ids.length} Metronome customer(s)`]);
    try {
      const res = await fetch('/api/metronome/demo/customers', {
        method: 'POST',
        headers: buildDemoRequestHeaders(),
        body: JSON.stringify({ customerIds: ids }),
      });
      await consumeNdjsonStream(res, (msg) => {
        if (msg.type === 'log') msg.line.split('\n').forEach(appendLine);
        else if (msg.type === 'result') {
          appendLine(
            `✓ archived ${(msg.archived as string[]).length}, failed ${(msg.failed as unknown[]).length}`,
          );
        } else if (msg.type === 'error') appendLine(`✗ error: ${msg.error}`);
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      appendLine(`✗ error: ${e?.message ?? 'unknown'}`);
    } finally {
      setArchiving(false);
      setSelectedMetronomeIds(new Set());
      loadMetronomeCustomersSilently();
    }
  };

  // Refresh the list after archiving, without re-triggering the initial-load effect noise.
  const loadMetronomeCustomersSilently = async () => {
    try {
      const res = await fetch(metronomeCustomersUrl, { headers: buildDemoRequestHeaders() });
      const data = await res.json();
      if (res.ok) setMetronomeCustomers(data.customers);
    } catch {
      // best-effort refresh only
    }
  };

  const handleDeleteClick = async () => {
    if (selectedStripeIds.size === 0) return;
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }
    setDeleteConfirming(false);
    setDeleting(true);
    const ids = Array.from(selectedStripeIds);
    appendLines(['', `$ delete ${ids.length} Stripe customer(s)`]);
    try {
      const res = await fetch('/api/stripe/demo/customers', {
        method: 'DELETE',
        headers: buildDemoRequestHeaders(),
        body: JSON.stringify({ customerIds: ids }),
      });
      await consumeNdjsonStream(res, (msg) => {
        if (msg.type === 'log') msg.line.split('\n').forEach(appendLine);
        else if (msg.type === 'result') {
          appendLine(
            `✓ deleted ${(msg.deleted as string[]).length}, failed ${(msg.failed as unknown[]).length}`,
          );
        } else if (msg.type === 'error') appendLine(`✗ error: ${msg.error}`);
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      appendLine(`✗ error: ${e?.message ?? 'unknown'}`);
    } finally {
      setDeleting(false);
      setSelectedStripeIds(new Set());
      loadStripeCustomersSilently();
    }
  };

  const loadStripeCustomersSilently = async () => {
    try {
      const res = await fetch(stripeCustomersUrl, { headers: buildDemoRequestHeaders() });
      const data = await res.json();
      if (res.ok) setStripeCustomers(data.customers);
    } catch {
      // best-effort refresh only
    }
  };

  const handleCreatePowerUser = async () => {
    const name = customerName.trim();
    if (!name || creatingPowerUser) return;
    setCreatingPowerUser(true);
    appendLines(['', `$ create power user "${name}"`]);
    try {
      const res = await fetch('/api/metronome/demo/power-user', {
        method: 'POST',
        headers: buildDemoRequestHeaders(),
        body: JSON.stringify({ customerName: name }),
      });
      await consumeNdjsonStream(res, (msg) => {
        if (msg.type === 'log') msg.line.split('\n').forEach(appendLine);
        else if (msg.type === 'result') {
          appendLine(`✓ done — customer ${msg.customerId}, contract ${msg.contractId}`);
          if (msg.eventsIngested != null) {
            appendLine(`  ${msg.eventsIngested} events seeded`);
          }
        } else if (msg.type === 'error') appendLine(`✗ error: ${msg.error}`);
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      appendLine(`✗ error: ${e?.message ?? 'unknown'}`);
    } finally {
      setCreatingPowerUser(false);
    }
  };

  return (
    <div className='container mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-2 text-2xl font-bold'>Clean Up Environment</h1>
      <p className='mb-6 text-sm text-gray-600'>
        Run in order: archive Metronome customers, delete Stripe customers, then create a fresh
        power user. Archiving and deletion are irreversible — both require an explicit
        confirmation before anything runs.
      </p>

      <Stepper step={step} />

      {step === 1 && (
        <div className='mb-6'>
          <p className='mb-3 text-sm text-gray-600'>
            Select Metronome customers to archive. This <strong>only archives</strong> — it never
            deletes or modifies anything else.
          </p>
          {loadingMetronome && <p className='text-sm text-gray-500'>Loading customers…</p>}
          {!loadingMetronome && metronomeCustomers?.length === 0 && (
            <p className='text-sm text-gray-500'>No active Metronome customers found.</p>
          )}
          {!loadingMetronome && metronomeCustomers && metronomeCustomers.length > 0 && (
            <div className='mb-3 max-h-64 overflow-y-auto rounded-md border border-gray-200'>
              <table className='w-full text-left text-sm'>
                <thead className='sticky top-0 bg-gray-50'>
                  <tr>
                    <th className='w-8 p-2'>
                      <input
                        type='checkbox'
                        checked={selectedMetronomeIds.size === metronomeCustomers.length}
                        onChange={(e) =>
                          setSelectedMetronomeIds(
                            e.target.checked ? new Set(metronomeCustomers.map((c) => c.id)) : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className='p-2'>Name</th>
                    <th className='p-2'>ID</th>
                    <th className='p-2'>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {metronomeCustomers.map((c) => (
                    <tr key={c.id} className='border-t border-gray-100'>
                      <td className='p-2'>
                        <input
                          type='checkbox'
                          checked={selectedMetronomeIds.has(c.id)}
                          onChange={() => {
                            setSelectedMetronomeIds((prev) => toggleSelected(prev, c.id));
                            setArchiveConfirming(false);
                          }}
                        />
                      </td>
                      <td className='p-2'>{c.name}</td>
                      <td className='p-2 font-mono text-xs text-gray-500'>{c.id}</td>
                      <td className='p-2 text-gray-500'>{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className='flex gap-2'>
            <button
              type='button'
              onClick={handleArchiveClick}
              onBlur={() => setArchiveConfirming(false)}
              disabled={selectedMetronomeIds.size === 0 || archiving}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-gray-400 ${
                archiveConfirming ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {archiving
                ? 'Archiving…'
                : archiveConfirming
                  ? `Confirm archive of ${selectedMetronomeIds.size}`
                  : `Archive selected (${selectedMetronomeIds.size})`}
            </button>
            <button
              type='button'
              onClick={() => setStep(2)}
              className='ml-auto rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300'
            >
              Next: delete Stripe customers →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='mb-6'>
          <p className='mb-3 text-sm text-gray-600'>
            Select Stripe customers to permanently delete.
          </p>
          {loadingStripe && <p className='text-sm text-gray-500'>Loading customers…</p>}
          {!loadingStripe && stripeCustomers?.length === 0 && (
            <p className='text-sm text-gray-500'>No Stripe customers found.</p>
          )}
          {!loadingStripe && stripeCustomers && stripeCustomers.length > 0 && (
            <div className='mb-3 max-h-64 overflow-y-auto rounded-md border border-gray-200'>
              <table className='w-full text-left text-sm'>
                <thead className='sticky top-0 bg-gray-50'>
                  <tr>
                    <th className='w-8 p-2'>
                      <input
                        type='checkbox'
                        checked={selectedStripeIds.size === stripeCustomers.length}
                        onChange={(e) =>
                          setSelectedStripeIds(
                            e.target.checked ? new Set(stripeCustomers.map((c) => c.id)) : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className='p-2'>Name</th>
                    <th className='p-2'>Email</th>
                    <th className='p-2'>ID</th>
                    <th className='p-2'>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {stripeCustomers.map((c) => (
                    <tr key={c.id} className='border-t border-gray-100'>
                      <td className='p-2'>
                        <input
                          type='checkbox'
                          checked={selectedStripeIds.has(c.id)}
                          onChange={() => {
                            setSelectedStripeIds((prev) => toggleSelected(prev, c.id));
                            setDeleteConfirming(false);
                          }}
                        />
                      </td>
                      <td className='p-2'>{c.name ?? '—'}</td>
                      <td className='p-2 text-gray-500'>{c.email ?? '—'}</td>
                      <td className='p-2 font-mono text-xs text-gray-500'>{c.id}</td>
                      <td className='p-2 text-gray-500'>
                        {new Date(c.created * 1000).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => setStep(1)}
              className='rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300'
            >
              ← Back
            </button>
            <button
              type='button'
              onClick={handleDeleteClick}
              onBlur={() => setDeleteConfirming(false)}
              disabled={selectedStripeIds.size === 0 || deleting}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-gray-400 ${
                deleteConfirming ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {deleting
                ? 'Deleting…'
                : deleteConfirming
                  ? `Confirm delete of ${selectedStripeIds.size}`
                  : `Delete selected (${selectedStripeIds.size})`}
            </button>
            <button
              type='button'
              onClick={() => setStep(3)}
              className='ml-auto rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300'
            >
              Next: add power user →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className='mb-6'>
          <p className='mb-3 text-sm text-gray-600'>
            Creates a Stripe customer (tax address + default test card matched to this
            account&apos;s currency), a linked Metronome customer, a large commitment + seat
            contract, and ~30 days of seeded usage.
          </p>
          <label htmlFor='power-user-name' className='mb-1 block text-sm font-medium text-gray-700'>
            Power user name
          </label>
          <div className='flex gap-2'>
            <input
              id='power-user-name'
              type='text'
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={creatingPowerUser}
              autoComplete='off'
              placeholder='Power user name'
              className='flex-1 rounded-md border border-gray-300 p-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100'
            />
            <button
              type='button'
              onClick={handleCreatePowerUser}
              disabled={creatingPowerUser || !customerName.trim()}
              className='rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400'
            >
              {creatingPowerUser ? 'Running…' : 'Run'}
            </button>
            <button
              type='button'
              onClick={() => setStep(2)}
              className='ml-auto rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300'
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      <TerminalPanel lines={lines} outputRef={outputRef} />
    </div>
  );
}
