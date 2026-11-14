// Shared helpers for the Vercel Functions in api/. Files under api/_lib are not routes.

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Private by default: personalized and error responses are never cached. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

const MESSAGES = {
  badRequest: 'Permintaan tidak valid. Muat ulang halaman lalu coba lagi.',
  server: 'Terjadi kesalahan. Silakan coba lagi beberapa saat lagi.',
};

/**
 * Reads a JSON body of at most `maxBytes`. Only same-origin requests are accepted: browsers
 * send Origin on cross-site POSTs, and this site never serves other origins.
 */
export async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'FORBIDDEN', MESSAGES.badRequest);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', MESSAGES.badRequest);
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'TOO_LARGE', 'Isian terlalu panjang.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'TOO_LARGE', 'Isian terlalu panjang.');
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new HttpError(400, 'INVALID_JSON', MESSAGES.badRequest); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_JSON', MESSAGES.badRequest);
  return body as Record<string, unknown>;
}

/**
 * Wraps a handler: known errors become clear JSON responses; anything else is logged without
 * request data (no tokens, names or messages) and returned as a generic, retryable error.
 */
export function handle(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.code, error.message);
      console.error('Unhandled API error:', error instanceof Error ? error.name : typeof error);
      return fail(500, 'SERVER_ERROR', MESSAGES.server);
    }
  };
}
