import { NextRequest, NextResponse } from 'next/server';
import { initializeMetronome } from '@/utils/metronome';
import { ensureAiBuilderPackages } from '@/server/aiBuilderPackages';

export async function POST(request: NextRequest) {
  const metronome = initializeMetronome(request.headers);
  if (!metronome) {
    return NextResponse.json(
      { error: 'Metronome API key is not configured.' },
      { status: 503 },
    );
  }
  try {
    const packages = await ensureAiBuilderPackages(metronome);
    return NextResponse.json({ ok: true, packages });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI Builder package setup failed.';
    console.error('[ai-builder-packages]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

