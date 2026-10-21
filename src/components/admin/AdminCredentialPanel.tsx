'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { useAdminCredentials } from '@/contexts/AdminCredentialsContext';
import {
  buildAdminCredentialHeaders,
  type AdminCredentialSource,
} from '@/utils/adminCredentials';

type CredentialStatus = {
  requestedSource: AdminCredentialSource;
  metronome: {
    configured: boolean;
    connected: boolean;
    source: string;
    fingerprint: string | null;
    error: string | null;
  };
  stripe: {
    configured: boolean;
    connected: boolean;
    source: string;
    accountId: string | null;
    error: string | null;
  };
};

export default function AdminCredentialPanel({
  explicitOnly = false,
}: {
  explicitOnly?: boolean;
}) {
  const {
    source,
    setSource,
    explicit,
    updateExplicit,
    setResolvedTarget,
  } =
    useAdminCredentials();
  const effectiveSource: AdminCredentialSource = explicitOnly
    ? 'explicit'
    : source;
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async () => {
    if (
      effectiveSource === 'explicit' &&
      !explicit.metronomeApiKey.trim()
    ) {
      setStatus(null);
      return;
    }
    setChecking(true);
    try {
      const response = await fetch('/api/admin/credential-status', {
        headers: buildAdminCredentialHeaders(effectiveSource, explicit),
      });
      const body = (await response.json()) as CredentialStatus;
      setStatus(body);
      setResolvedTarget(
        body.metronome.connected
          ? `Metronome ${body.metronome.fingerprint}${
              body.stripe.connected ? ` · Stripe ${body.stripe.accountId}` : ''
            }`
          : null,
      );
    } finally {
      setChecking(false);
    }
  }, [effectiveSource, explicit, setResolvedTarget]);

  useEffect(() => {
    setStatus(null);
    setResolvedTarget(null);
    if (effectiveSource === 'configured') void verify();
  }, [effectiveSource, explicit, setResolvedTarget, verify]);

  return (
    <section className='rounded-2xl border border-gray-200 bg-white p-5'>
      <div className='flex items-center gap-3'>
        <KeyRound className='h-5 w-5 text-purple' />
        <div>
          <h2 className='font-semibold text-gray-900'>Admin target</h2>
          <p className='text-xs text-gray-600'>
            {explicitOnly
              ? 'Account setup and reset always use explicit, memory-only credentials.'
              : 'Choose the account that this page will modify.'}
          </p>
        </div>
      </div>

      {!explicitOnly && (
        <div className='mt-4 grid gap-2 sm:grid-cols-2'>
          <label className='flex cursor-pointer gap-2 rounded-lg border p-3 text-sm'>
            <input
              type='radio'
              checked={source === 'configured'}
              onChange={() => setSource('configured')}
            />
            <span>
              <span className='block font-semibold'>
                Configured demo environment
              </span>
              <span className='text-xs text-gray-500'>
                Tools Panel override, then server environment
              </span>
            </span>
          </label>
          <label className='flex cursor-pointer gap-2 rounded-lg border p-3 text-sm'>
            <input
              type='radio'
              checked={source === 'explicit'}
              onChange={() => setSource('explicit')}
            />
            <span>
              <span className='block font-semibold'>Another account</span>
              <span className='text-xs text-gray-500'>
                Explicit credentials, cleared on refresh
              </span>
            </span>
          </label>
        </div>
      )}

      {effectiveSource === 'explicit' && (
        <div className='mt-4 grid gap-3'>
          <input
            type='password'
            value={explicit.metronomeApiKey}
            onChange={(event) =>
              updateExplicit({ metronomeApiKey: event.target.value })
            }
            autoComplete='off'
            placeholder='Metronome API key'
            aria-label='Target Metronome API key'
            className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
          />
          <input
            type='password'
            value={explicit.stripeSecretKey}
            onChange={(event) =>
              updateExplicit({ stripeSecretKey: event.target.value })
            }
            autoComplete='off'
            placeholder='Stripe test secret key (optional)'
            aria-label='Target Stripe secret key'
            className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
          />
          <input
            value={explicit.deliveryMethodId}
            onChange={(event) =>
              updateExplicit({ deliveryMethodId: event.target.value })
            }
            placeholder='Metronome delivery method ID (optional)'
            aria-label='Target delivery method ID'
            className='w-full rounded-lg border px-3 py-2 font-mono text-sm'
          />
        </div>
      )}

      <button
        type='button'
        onClick={() => void verify()}
        disabled={
          checking ||
          (effectiveSource === 'explicit' &&
            !explicit.metronomeApiKey.trim())
        }
        className='mt-3 rounded-lg border border-purple px-3 py-2 text-xs font-semibold text-purple disabled:opacity-40'
      >
        {checking ? 'Verifying…' : 'Verify target'}
      </button>

      {status && (
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          <TargetStatus
            label='Metronome'
            connected={status.metronome.connected}
            detail={
              status.metronome.connected
                ? `${status.metronome.source} · target ${status.metronome.fingerprint}`
                : status.metronome.error || `${status.metronome.source}`
            }
          />
          <TargetStatus
            label='Stripe'
            connected={status.stripe.connected}
            optional={!status.stripe.configured}
            detail={
              status.stripe.connected
                ? `${status.stripe.source} · ${status.stripe.accountId}`
                : status.stripe.error || `${status.stripe.source} · optional`
            }
          />
        </div>
      )}
    </section>
  );
}

function TargetStatus({
  label,
  connected,
  optional = false,
  detail,
}: {
  label: string;
  connected: boolean;
  optional?: boolean;
  detail: string;
}) {
  const Icon = connected ? CheckCircle2 : XCircle;
  return (
    <div className='flex min-w-0 items-start gap-2 rounded-lg bg-gray-50 p-3'>
      <Icon
        className={`mt-0.5 h-4 w-4 flex-none ${
          connected ? 'text-green-600' : optional ? 'text-gray-400' : 'text-red-600'
        }`}
      />
      <div className='min-w-0'>
        <p className='text-xs font-semibold text-gray-900'>{label}</p>
        <p className='break-words text-[11px] text-gray-600'>{detail}</p>
      </div>
    </div>
  );
}
