import type { NextRequest } from 'next/server';

const APP_ORIGIN_HEADER = 'x-app-origin';

/**
 * True when the Host header refers to loopback / local dev (any port).
 */
function isLocalDevHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    /^localhost(:\d+)?$/.test(h) ||
    /^127\.\d+\.\d+\.\d+(:\d+)?$/.test(h) ||
    /^\[::1\](:\d+)?$/.test(h)
  );
}

/**
 * Browser sends this (via fetchClient) so API routes can mirror the tab’s origin even when
 * proxies set X-Forwarded-Host to a deployed URL while you run on localhost:3000.
 */
function originFromTrustedAppHeader(
  request: NextRequest,
  hostHeader: string | null,
): string | null {
  const raw = request.headers.get(APP_ORIGIN_HEADER);
  if (!raw || !hostHeader) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.host.toLowerCase() !== hostHeader.toLowerCase()) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Builds the public origin for Stripe redirect URLs (success_url, cancel_url, return_url).
 *
 * - Prefer the real browser origin in local dev: do **not** let `X-Forwarded-Host` override
 *   `Host: localhost:3000` (common when .env or a proxy still points at a deployed host).
 * - Optional `x-app-origin` (set by fetchClient) must match `Host` before it is trusted.
 * - Avoid relying on `NEXT_PUBLIC_BASE_URL` for these URLs — it is often the wrong port
 *   (e.g. :8080) or a production URL while developing locally.
 */
export function getPublicOriginFromRequest(request: NextRequest): string {
  const hostHeader = request.headers.get('host');
  const fromClient = originFromTrustedAppHeader(request, hostHeader);
  if (fromClient) return fromClient;

  if (hostHeader && isLocalDevHost(hostHeader)) {
    return `http://${hostHeader}`;
  }

  const forwardedHost =
    request.headers.get('x-forwarded-host') || hostHeader;
  if (forwardedHost) {
    const protoHeader = request.headers.get('x-forwarded-proto');
    const isLocal =
      /^localhost(:\d+)?$/i.test(forwardedHost) ||
      /^127\.\d+\.\d+\.\d+(:\d+)?$/i.test(forwardedHost) ||
      /^\[::1\](:\d+)?$/i.test(forwardedHost);
    const proto = protoHeader || (isLocal ? 'http' : 'https');
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
