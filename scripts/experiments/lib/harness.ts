import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ExperimentAction = 'plan' | 'apply' | 'check' | 'cleanup';

export type ExperimentArgs = {
  action: ExperimentAction;
  confirmed: boolean;
};

export function parseExperimentArgs(
  confirmationName: string,
): ExperimentArgs {
  const flags = new Set(process.argv.slice(2));
  const actions: ExperimentAction[] = [
    flags.has('--apply') ? 'apply' : null,
    flags.has('--check') ? 'check' : null,
    flags.has('--cleanup') ? 'cleanup' : null,
  ].filter((value): value is ExperimentAction => value !== null);
  if (actions.length > 1) {
    throw new Error('Choose only one of --apply, --check, or --cleanup.');
  }
  const confirmation = process.argv
    .slice(2)
    .find((value) => value.startsWith('--confirm='))
    ?.slice('--confirm='.length);
  return {
    action: actions[0] ?? 'plan',
    confirmed: confirmation === confirmationName,
  };
}

export function keyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

export function shortRunId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12);
}

export function experimentStatePath(
  experimentName: string,
  apiKey: string,
): string {
  return resolve(
    process.cwd(),
    '.metronome',
    'experiments',
    experimentName,
    keyFingerprint(apiKey),
    'state.json',
  );
}

export async function readExperimentState<T>(
  path: string,
): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeExperimentState<T>(
  path: string,
  state: T,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function listAll<T>(source: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of source) rows.push(row);
  return rows;
}

export function stableTransactionId(seed: string): string {
  return `exp-${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

export async function poll<T>(
  read: () => Promise<T>,
  settled: (value: T) => boolean,
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 30;
  const intervalMs = options.intervalMs ?? 2_000;
  let value = await read();
  for (let attempt = 1; attempt < attempts && !settled(value); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
    value = await read();
  }
  return value;
}
