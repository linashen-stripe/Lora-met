import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ndjsonStreamResponse } from '@/utils/ndjsonStream';

export const runtime = 'nodejs';
export const maxDuration = 300;

type StarterMode = 'plan' | 'seed' | 'reset';

interface StarterRequest {
  apiKey?: string;
  mode?: StarterMode;
  confirmReset?: boolean;
  timeBasedPricing?: boolean;
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as StarterRequest;
  const apiKey = clean(body.apiKey);
  const mode: StarterMode =
    body.mode === 'seed' || body.mode === 'reset' ? body.mode : 'plan';

  return ndjsonStreamResponse(async (onLog) => {
    if (!apiKey) throw new Error('Target Metronome API key is required.');

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
    if (body.timeBasedPricing) args.push('--time-based-pricing');

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
        if (line.trim()) onLog(`${prefix}${line}`);
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
