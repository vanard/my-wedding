// GET /api/wishes?before=<cursor>&limit=<1-50> — approved wishes, newest first (public, cached
//   briefly at Vercel's CDN; contains only name, message and date).
// POST /api/wishes — { name, message, idempotencyKey } with `Authorization: Bearer <code>`.
//   The wish is shown after the couple approves it. Retrying with the same key never duplicates.
import { handle, json, readJson } from './_lib/http.js';
import { guestCodeHash } from './_lib/auth.js';
import { rpc } from './_lib/supabase.js';
import { pageSize, wishInput, wishesCursor } from './_lib/validate.js';
import type { WishesPage } from '../src/lib/contracts.js';

interface Row { id: string; name: string; message: string; created_at: string }

export const GET = handle(async (request) => {
  const params = new URL(request.url).searchParams;
  const limit = pageSize(params.get('limit'));
  const before = wishesCursor(params.get('before'));
  // One extra row tells whether there is another page.
  const rows = await rpc<Row[]>('public_wishes', {
    p_before_created: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
    p_limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const body: WishesPage = {
    wishes: page.map(({ name, message, created_at }) => ({ name, message, createdAt: created_at })),
    next: rows.length > limit && last ? `${last.created_at}_${last.id}` : null,
  };
  return json(body, 200, {
    // Shared cache only for this public list; a new approval shows up within about a minute.
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
  });
});

export const POST = handle(async (request) => {
  const codeHash = guestCodeHash(request);
  const wish = wishInput(await readJson(request, 8192));
  const result = await rpc<{ approved: boolean; duplicate: boolean }>('submit_wish', {
    p_token_hash: codeHash,
    p_idempotency_key: wish.idempotencyKey,
    p_name: wish.name,
    p_message: wish.message,
  });
  return json({ wish: { approved: result.approved } }, result.duplicate ? 200 : 201);
});
