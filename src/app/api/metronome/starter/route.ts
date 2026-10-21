import { ndjsonStreamResponse } from '@/utils/ndjsonStream';
import {
  API_INSPECTOR_SESSION_HEADER,
  API_INSPECTOR_TRACE_HEADER,
} from '@/utils/apiInspector';
import { publishApiTrace } from '@/utils/apiInspectorServer';
import {
  runAccountStarter,
  type AccountStarterMode,
} from '@/server/accountStarter';

export const runtime = 'nodejs';
export const maxDuration = 300;

type StarterMode = 'plan' | 'seed' | 'reset';

interface StarterRequest {
  apiKey?: string;
  mode?: StarterMode;
  starterMode?: AccountStarterMode;
  confirmReset?: boolean;
  resetScope?: 'demo-data' | 'full';
  resourcePrefix?: string;
  quickstartName?: string;
  proName?: string;
  powerUserName?: string;
  stripeSecretKey?: string;
  deliveryMethodId?: string;
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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
  const starterMode = body.starterMode;

  return ndjsonStreamResponse(async (onLog) => {
    if (!apiKey) throw new Error('Target Metronome API key is required.');
    if (starterMode !== 'ai-builder' && starterMode !== 'generation') {
      throw new Error('Select AI Builder or Generation.');
    }
    await runAccountStarter({
      starterMode,
      action: mode,
      apiKey,
      confirmReset: body.confirmReset,
      resetScope:
        body.resetScope === 'demo-data' ? 'demo-data' : 'full',
      resourcePrefix: clean(body.resourcePrefix),
      quickstartName: clean(body.quickstartName),
      proName: clean(body.proName),
      powerUserName: clean(body.powerUserName),
      stripeSecretKey: clean(body.stripeSecretKey),
      deliveryMethodId: clean(body.deliveryMethodId),
      onLog,
      onTrace: inspectorSessionId
        ? (entry) =>
            publishApiTrace(inspectorSessionId, {
              ...entry,
              parentId: parentTraceId,
            })
        : undefined,
    });
    return { mode, starterMode, ok: true };
  });
}
