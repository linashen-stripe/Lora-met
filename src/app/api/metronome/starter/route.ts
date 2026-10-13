import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import {
  API_INSPECTOR_CHILD_TRACE_PREFIX,
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
  type ApiTraceEntry,
} from '@/utils/apiInspector';
import { publishApiTrace } from '@/utils/apiInspectorServer';

export const runtime = 'nodejs';
export const maxDuration = 300;

type StarterMode = 'plan' | 'seed' | 'reset';
type PricingMetric = 'image' | 'video' | '3d';
type PricingDimension = {
  propertyKey: string;
  values: Array<{ value: string; multiplier: number }>;
  metrics: PricingMetric[];
};
const RESERVED_PROPERTY_KEYS = new Set([
  'quantity',
  'modality',
  'operation',
  'quality',
  'model',
  'workspace_id',
  'project_id',
  'user_id',
  'customer_id',
]);

interface StarterRequest {
  apiKey?: string;
  mode?: StarterMode;
  confirmReset?: boolean;
  pricingDimension?: unknown;
  resourcePrefix?: string;
  quickstartName?: string;
  proName?: string;
  powerUserName?: string;
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizePricingDimension(value: unknown): PricingDimension | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') {
    throw new Error('Custom pricing property is invalid.');
  }
  const candidate = value as {
    propertyKey?: unknown;
    values?: unknown;
    metrics?: unknown;
  };
  const propertyKey = clean(candidate.propertyKey);
  if (!propertyKey || !/^[a-z][a-z0-9_]{0,63}$/.test(propertyKey)) {
    throw new Error(
      'Property key must use lowercase letters, numbers, and underscores.',
    );
  }
  if (RESERVED_PROPERTY_KEYS.has(propertyKey)) {
    throw new Error(`Property key "${propertyKey}" is reserved.`);
  }
  if (
    !Array.isArray(candidate.values) ||
    candidate.values.length < 2 ||
    candidate.values.length > 4
  ) {
    throw new Error('Custom pricing property requires 2–4 values.');
  }
  const values = candidate.values.map((entry, index) => {
    const row =
      entry && typeof entry === 'object'
        ? (entry as { value?: unknown; multiplier?: unknown })
        : {};
    const item = clean(row.value);
    const multiplier = Number(row.multiplier);
    if (!item || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item)) {
      throw new Error(`Custom pricing value ${index + 1} is invalid.`);
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`Multiplier for "${item}" must be greater than zero.`);
    }
    return { value: item, multiplier };
  });
  if (new Set(values.map((entry) => entry.value)).size !== values.length) {
    throw new Error('Custom pricing property values must be unique.');
  }
  const rawMetrics = Array.isArray(candidate.metrics) ? candidate.metrics : [];
  const metrics = rawMetrics.filter(
    (metric): metric is PricingMetric =>
      metric === 'image' || metric === 'video' || metric === '3d',
  );
  if (
    metrics.length === 0 ||
    metrics.length !== rawMetrics.length ||
    new Set(metrics).size !== metrics.length
  ) {
    throw new Error('Select Image, Video, 3D, or a combination for custom pricing.');
  }
  return { propertyKey, values, metrics };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as StarterRequest;
  const inspectorSessionId = request.headers.get(
    API_INSPECTOR_SESSION_HEADER,
  );
  const parentTraceId =
    request.headers.get(API_INSPECTOR_TRACE_HEADER) ?? undefined;
  const apiKey = clean(body.apiKey);
  const mode: StarterMode =
    body.mode === 'seed' || body.mode === 'reset' ? body.mode : 'plan';

  return ndjsonStreamResponse(async (onLog) => {
    if (!apiKey) throw new Error('Target Metronome API key is required.');
    const pricingDimension = normalizePricingDimension(body.pricingDimension);

    const args = [
      '--import',
      'tsx',
      resolve(process.cwd(), 'scripts/metronome-starter.ts'),
    ];
    if (mode === 'seed') args.push('--apply');
    if (mode === 'reset') {
      args.push('--reset');
      if (body.confirmReset) args.push('--confirm=metronome-starter');
    }
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        METRONOME_API_KEY: apiKey,
        METRONOME_STARTER_RESOURCE_PREFIX:
          clean(body.resourcePrefix) ?? 'Generate',
        METRONOME_STARTER_QUICKSTART_NAME:
          clean(body.quickstartName) ?? 'Enterprise Quickstart',
        METRONOME_STARTER_PRO_NAME:
          clean(body.proName) ?? 'Pro',
        METRONOME_STARTER_POWER_USER_NAME:
          clean(body.powerUserName) ?? 'B2B Power User',
        METRONOME_STARTER_PRICING_DIMENSION: pricingDimension
          ? JSON.stringify(pricingDimension)
          : '',
        API_INSPECTOR_TRACE_ENABLED: inspectorSessionId ? '1' : '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const forward = (
      chunk: Buffer,
      pending: { value: string },
      prefix = '',
    ) => {
      pending.value += chunk.toString();
      const lines = pending.value.split('\n');
      pending.value = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        if (
          inspectorSessionId &&
          !prefix &&
          line.startsWith(API_INSPECTOR_CHILD_TRACE_PREFIX)
        ) {
          try {
            const entry = JSON.parse(
              line.slice(API_INSPECTOR_CHILD_TRACE_PREFIX.length),
            ) as ApiTraceEntry;
            publishApiTrace(inspectorSessionId, {
              ...entry,
              parentId: parentTraceId,
            });
          } catch {
            onLog('Inspector could not parse one upstream trace.');
          }
          continue;
        }
        onLog(`${prefix}${line}`);
      }
    };
    const stdout = { value: '' };
    const stderr = { value: '' };
    child.stdout.on('data', (chunk: Buffer) => forward(chunk, stdout));
    child.stderr.on('data', (chunk: Buffer) =>
      forward(chunk, stderr, 'error: '),
    );

    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolveExit(code ?? 1));
    });
    if (stdout.value.trim()) onLog(stdout.value.trim());
    if (stderr.value.trim()) onLog(`error: ${stderr.value.trim()}`);
    if (exitCode !== 0) {
      throw new Error(`Starter ${mode} failed with exit code ${exitCode}.`);
    }

    return { mode, ok: true };
  });
}
