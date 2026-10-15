/* eslint-disable i18next/no-literal-string */
'use client';

import { Plus, Trash2 } from 'lucide-react';

export type StarterPricingValue = {
  value: string;
  multiplier: string;
};

export type StarterPricingDimensionDraft = {
  enabled: boolean;
  propertyKey: string;
  values: StarterPricingValue[];
  metrics: string[];
};

export function validateStarterPricingDimension(
  draft: StarterPricingDimensionDraft,
  reservedKeys: readonly string[] = [],
): string | null {
  if (!draft.enabled) return null;
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(draft.propertyKey.trim())) {
    return 'Use a lowercase property key with letters, numbers, and underscores.';
  }
  if (reservedKeys.includes(draft.propertyKey.trim())) {
    return `"${draft.propertyKey.trim()}" is already a canonical pricing property for this mode.`;
  }
  if (draft.values.length < 2 || draft.values.length > 4) {
    return 'Define between two and four property values.';
  }
  const values = draft.values.map((entry) => entry.value.trim());
  if (
    values.some(
      (value) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value),
    )
  ) {
    return 'Values may use letters, numbers, underscores, and hyphens.';
  }
  if (new Set(values).size !== values.length) {
    return 'Property values must be unique.';
  }
  if (
    draft.values.some(
      (entry) =>
        !Number.isFinite(Number(entry.multiplier)) ||
        Number(entry.multiplier) <= 0,
    )
  ) {
    return 'Every multiplier must be greater than zero.';
  }
  if (draft.metrics.length === 0) {
    return 'Select at least one usage metric.';
  }
  return null;
}

export default function StarterPricingDimensionEditor({
  draft,
  metricOptions,
  reservedKeys = [],
  disabled = false,
  onChange,
}: {
  draft: StarterPricingDimensionDraft;
  metricOptions: Array<{ key: string; label: string }>;
  reservedKeys?: readonly string[];
  disabled?: boolean;
  onChange: (draft: StarterPricingDimensionDraft) => void;
}) {
  const error = validateStarterPricingDimension(draft, reservedKeys);
  const updateValue = (
    index: number,
    field: keyof StarterPricingValue,
    value: string,
  ) => {
    onChange({
      ...draft,
      values: draft.values.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    });
  };

  return (
    <div className='rounded-xl border border-violet-200 bg-violet-50 p-4'>
      <label className='flex items-start gap-3'>
        <input
          type='checkbox'
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, enabled: event.target.checked })
          }
          className='mt-1'
        />
        <span>
          <span className='block text-sm font-semibold text-violet-950'>
            Add a custom pricing property
          </span>
          <span className='mt-1 block text-xs text-violet-800'>
            Optional and disabled by default. This affects starter-created
            rates and seeded events only; the live app will not emit arbitrary
            custom properties.
          </span>
        </span>
      </label>

      {draft.enabled && (
        <div className='mt-4 space-y-4 border-t border-violet-200 pt-4'>
          <label className='block text-xs font-semibold text-violet-950'>
            Property key
            <input
              value={draft.propertyKey}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...draft, propertyKey: event.target.value })
              }
              placeholder='time_band'
              className='mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-sm'
            />
          </label>

          <div>
            <div className='flex items-center justify-between'>
              <p className='text-xs font-semibold text-violet-950'>
                Values and rate multipliers
              </p>
              <button
                type='button'
                disabled={disabled || draft.values.length >= 4}
                onClick={() =>
                  onChange({
                    ...draft,
                    values: [
                      ...draft.values,
                      { value: '', multiplier: '1' },
                    ],
                  })
                }
                className='flex items-center gap-1 text-xs font-semibold text-purple disabled:opacity-40'
              >
                <Plus className='h-3.5 w-3.5' />
                Add value
              </button>
            </div>
            <div className='mt-2 space-y-2'>
              {draft.values.map((entry, index) => (
                <div
                  key={index}
                  className='grid grid-cols-[1fr_7rem_auto] gap-2'
                >
                  <input
                    value={entry.value}
                    disabled={disabled}
                    onChange={(event) =>
                      updateValue(index, 'value', event.target.value)
                    }
                    placeholder='standard'
                    className='rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono text-sm'
                  />
                  <input
                    type='number'
                    disabled={disabled}
                    min='0.01'
                    step='0.05'
                    value={entry.multiplier}
                    onChange={(event) =>
                      updateValue(index, 'multiplier', event.target.value)
                    }
                    className='rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm'
                  />
                  <button
                    type='button'
                    disabled={disabled || draft.values.length <= 2}
                    onClick={() =>
                      onChange({
                        ...draft,
                        values: draft.values.filter(
                          (_, entryIndex) => entryIndex !== index,
                        ),
                      })
                    }
                    className='rounded-lg p-2 text-violet-700 disabled:opacity-30'
                    aria-label='Remove value'
                  >
                    <Trash2 className='h-4 w-4' />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className='text-xs font-semibold text-violet-950'>
              Apply to usage metrics
            </legend>
            <div className='mt-2 grid gap-2 sm:grid-cols-2'>
              {metricOptions.map((metric) => (
                <label
                  key={metric.key}
                  className='flex items-center gap-2 text-sm text-violet-950'
                >
                  <input
                    type='checkbox'
                    checked={draft.metrics.includes(metric.key)}
                    disabled={disabled}
                    onChange={() =>
                      onChange({
                        ...draft,
                        metrics: draft.metrics.includes(metric.key)
                          ? draft.metrics.filter(
                              (candidate) => candidate !== metric.key,
                            )
                          : [...draft.metrics, metric.key],
                      })
                    }
                  />
                  {metric.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className='text-xs text-red-700'>{error}</p>}
        </div>
      )}
    </div>
  );
}
