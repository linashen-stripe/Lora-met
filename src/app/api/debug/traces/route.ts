import { NextRequest } from 'next/server';
import { subscribeToApiTraces } from '@/utils/apiInspectorServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session');
  if (!sessionId || sessionId.length > 128) {
    return Response.json({ error: 'Invalid inspector session.' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));
      unsubscribe = subscribeToApiTraces(sessionId, (entry) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(entry)}\n\n`),
        );
      });
      request.signal.addEventListener(
        'abort',
        () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            // The stream may already be closed by the runtime.
          }
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
