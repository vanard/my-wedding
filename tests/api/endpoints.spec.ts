import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { GET as getGuest } from '../../api/guest.js';
import { POST as postRsvp } from '../../api/rsvp.js';
import { GET as getWishes, POST as postWish } from '../../api/wishes.js';
import { POST as postCheckIn } from '../../api/checkin.js';

const SITE = 'https://wedding.example';
const CODE = 'A'.repeat(43);
const CODE_HASH = createHash('sha256').update(CODE).digest('hex');
const STAFF_KEY = 'staff-key-for-tests-0123456789';

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
let calls: Call[] = [];
let replies: (() => Response)[] = [];
const realFetch = globalThis.fetch;

/** Queue the next Supabase reply: a JSON body, or a PostgREST error raised by the SQL functions. */
const reply = (body: unknown, status = 200) => replies.push(() => Response.json(body, { status }));
const raise = (message: string) => reply({ code: 'P0001', message }, 400);

test.beforeEach(() => {
  calls = [];
  replies = [];
  process.env.SUPABASE_URL = 'https://project.supabase.co/';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.CHECKIN_KEY = STAFF_KEY;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    const next = replies.shift();
    if (!next) throw new TypeError('fetch failed');
    return next();
  }) as typeof fetch;
});
test.afterEach(() => { globalThis.fetch = realFetch; });

function req(path: string, { method = 'GET', body, headers = {} }: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const init: RequestInit = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] ??= 'application/json';
  }
  return new Request(`${SITE}${path}`, init);
}
const guest = { authorization: `Bearer ${CODE}` };
const staff = { 'x-staff-key': STAFF_KEY };

test.describe('guest code authorization', () => {
  test('requests without a valid personal code never reach the database', async () => {
    for (const headers of [{}, { authorization: 'Bearer short' }, { authorization: `Basic ${CODE}` }, { authorization: `Bearer ${CODE}!` }] as Record<string, string>[]) {
      const response = await getGuest(req('/api/guest', { headers }));
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('INVALID_TOKEN');
    }
    const rsvp = await postRsvp(req('/api/rsvp', { method: 'POST', body: { attendance: 'declined' } }));
    expect(rsvp.status).toBe(401);
    const wish = await postWish(req('/api/wishes', { method: 'POST', body: { name: 'A', message: 'B', idempotencyKey: crypto.randomUUID() } }));
    expect(wish.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test('only the hash of the code is sent, with the secret key in the apikey header only', async () => {
    reply({ name: 'Keluarga Budi', maxGuests: 4, rsvp: null });
    const response = await getGuest(req('/api/guest', { headers: guest }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ party: { name: 'Keluarga Budi', maxGuests: 4, rsvp: null } });
    expect(calls[0]!.url).toBe('https://project.supabase.co/rest/v1/rpc/guest_party');
    expect(calls[0]!.body).toEqual({ p_token_hash: CODE_HASH });
    expect(JSON.stringify(calls[0]!.body)).not.toContain(CODE);
    expect(calls[0]!.headers.apikey).toBe('sb_secret_test');
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  test('an unknown code is a clear 401', async () => {
    raise('INVALID_TOKEN');
    const response = await getGuest(req('/api/guest', { headers: guest }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toContain('Tautan undangan tidak dikenali');
  });
});

test.describe('RSVP validation', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) => postRsvp(req('/api/rsvp', { method: 'POST', body, headers: { ...guest, ...headers } }));

  test('rejects invalid attendance and guest counts before the database', async () => {
    for (const body of [{}, { attendance: 'maybe', guestCount: 1 }, { attendance: 'attending' }, { attendance: 'attending', guestCount: 0 },
      { attendance: 'attending', guestCount: 1.5 }, { attendance: 'attending', guestCount: '2' }, { attendance: 'attending', guestCount: 101 }]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
    expect(calls).toHaveLength(0);
  });

  test('declining always records zero guests', async () => {
    reply({ attendance: 'declined', guestCount: 0, updatedAt: '2026-11-14T02:00:00Z' });
    const response = await post({ attendance: 'declined', guestCount: 3 });
    expect(response.status).toBe(200);
    expect(calls[0]!.body).toEqual({ p_token_hash: CODE_HASH, p_attendance: 'declined', p_guest_count: 0 });
  });

  test('passes database decisions through as recoverable errors', async () => {
    raise('INVALID_GUEST_COUNT');
    expect((await post({ attendance: 'attending', guestCount: 9 })).status).toBe(422);
    raise('RATE_LIMITED');
    expect((await post({ attendance: 'attending', guestCount: 1 })).status).toBe(429);
  });

  test('rejects wrong content types, oversized bodies, bad JSON and cross-site posts', async () => {
    expect((await post('attendance=declined', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(415);
    expect((await post(JSON.stringify({ attendance: 'declined', pad: 'x'.repeat(2000) }))).status).toBe(413);
    expect((await post('{not json')).status).toBe(400);
    expect((await post('[1]')).status).toBe(400);
    expect((await post({ attendance: 'declined' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect(calls).toHaveLength(0);
    reply({ attendance: 'declined', guestCount: 0, updatedAt: '2026-11-14T02:00:00Z' });
    expect((await post({ attendance: 'declined' }, { origin: SITE })).status).toBe(200);
  });
});

test.describe('group links', () => {
  const key = '0b7a3c9e-5d1f-4e2a-9b8c-7d6e5f4a3b2c';
  const post = (body: unknown) => postRsvp(req('/api/rsvp', { method: 'POST', body, headers: guest }));

  test('each person answers with their own name and browser key, which reach the database', async () => {
    reply({ attendance: 'attending', guestCount: 2, updatedAt: '2026-11-14T02:00:00Z', name: 'Budi' });
    const response = await post({ attendance: 'attending', guestCount: 2, name: '  Budi ', respondentKey: key.toUpperCase() });
    expect(response.status).toBe(200);
    expect(calls[0]!.body).toEqual({ p_token_hash: CODE_HASH, p_attendance: 'attending', p_guest_count: 2, p_respondent_key: key, p_name: 'Budi' });
  });

  test('a malformed key or name is rejected before the database; missing details are a clear 422', async () => {
    expect((await post({ attendance: 'declined', name: 'Budi', respondentKey: 'not-a-uuid' })).status).toBe(400);
    expect((await post({ attendance: 'declined', name: '   ', respondentKey: key })).status).toBe(422);
    expect((await post({ attendance: 'declined', name: 'B'.repeat(101), respondentKey: key })).status).toBe(422);
    expect((await getGuest(req('/api/guest', { headers: { ...guest, 'x-respondent-key': 'nope' } }))).status).toBe(400);
    expect(calls).toHaveLength(0);

    raise('GROUP_DETAILS_REQUIRED');
    const missing = await post({ attendance: 'declined' });
    expect(missing.status).toBe(422);
    expect((await missing.json()).error.message).toBe('Isi nama Anda.');
    raise('GROUP_FULL');
    expect((await post({ attendance: 'declined', name: 'Budi', respondentKey: key })).status).toBe(409);
  });

  test('the browser key selects that person\'s own answer', async () => {
    reply({ name: 'Teman Kantor', maxGuests: 5, group: true, rsvp: null });
    const response = await getGuest(req('/api/guest', { headers: { ...guest, 'x-respondent-key': key } }));
    expect((await response.json()).party.group).toBe(true);
    expect(calls[0]!.body).toEqual({ p_token_hash: CODE_HASH, p_respondent_key: key });
  });
});

test.describe('database failures', () => {
  test('missing configuration, outages and timeouts return 503 without leaking details', async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };
    try {
      delete process.env.SUPABASE_SECRET_KEY;
      let response = await getGuest(req('/api/guest', { headers: guest }));
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('NOT_CONFIGURED');

      process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
      reply({ message: 'relation "x" does not exist', details: 'internal' }, 500);
      response = await getGuest(req('/api/guest', { headers: guest }));
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).not.toContain('relation');

      response = await getGuest(req('/api/guest', { headers: guest })); // fetch throws (no reply queued)
      expect(response.status).toBe(503);
    } finally {
      console.error = original;
    }
    expect(errors.join('\n')).not.toContain(CODE);
    expect(errors.join('\n')).not.toContain(CODE_HASH);
  });
});

test.describe('wishes', () => {
  const key = '6f1c2a8e-1b2c-4d3e-8f90-123456789abc';

  test('the public list exposes only name, message and date, cached briefly at the CDN', async () => {
    reply([
      { id: '00000000-0000-4000-8000-000000000002', name: 'Rina', message: 'Selamat!', created_at: '2026-11-14T02:00:00+00:00' },
      { id: '00000000-0000-4000-8000-000000000001', name: 'Andi', message: 'Bahagia selalu', created_at: '2026-11-13T02:00:00+00:00' },
    ]);
    const response = await getWishes(req('/api/wishes?limit=1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    const body = await response.json();
    expect(body.wishes).toEqual([{ name: 'Rina', message: 'Selamat!', createdAt: '2026-11-14T02:00:00+00:00' }]);
    expect(body.next).toBe('2026-11-14T02:00:00+00:00_00000000-0000-4000-8000-000000000002');
    expect(calls[0]!.body).toEqual({ p_before_created: null, p_before_id: null, p_limit: 2 });

    reply([]);
    const params = new URLSearchParams({ before: body.next, limit: '500' });
    const nextPage = await getWishes(req(`/api/wishes?${params}`));
    expect(await nextPage.json()).toEqual({ wishes: [], next: null });
    // At most 50 per page (+1 to detect another page).
    expect(calls[1]!.body).toEqual({ p_before_created: '2026-11-14T02:00:00+00:00', p_before_id: '00000000-0000-4000-8000-000000000002', p_limit: 51 });
  });

  test('a malformed cursor is rejected', async () => {
    for (const before of ['nope', '2026-11-14_notauuid', `x_${key}`]) {
      expect((await getWishes(req(`/api/wishes?before=${encodeURIComponent(before)}`))).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  test('validates and cleans wishes; a retried submission is not a new wish', async () => {
    const post = (body: unknown) => postWish(req('/api/wishes', { method: 'POST', body, headers: guest }));
    expect((await post({ name: 'Rina', message: 'Hai', idempotencyKey: 'not-a-uuid' })).status).toBe(400);
    expect((await post({ name: '   ', message: 'Hai', idempotencyKey: key })).status).toBe(422);
    expect((await post({ name: 'Rina', message: '', idempotencyKey: key })).status).toBe(422);
    expect((await post({ name: 'R'.repeat(101), message: 'Hai', idempotencyKey: key })).status).toBe(422);
    expect(calls).toHaveLength(0);

    // 1000 emoji are 1000 characters (2000 UTF-16 units): allowed, matching char_length() in SQL.
    reply({ approved: false, duplicate: false });
    let response = await post({ name: '  Rina\u0007 ', message: ` Selamat\r\nmenempuh hidup baru ${'🎉'.repeat(900)} `, idempotencyKey: key });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ wish: { approved: false } });
    expect(calls[0]!.body).toMatchObject({ p_token_hash: CODE_HASH, p_idempotency_key: key, p_name: 'Rina' });
    expect(calls[0]!.body.p_message).toBe(`Selamat\nmenempuh hidup baru ${'🎉'.repeat(900)}`);

    reply({ approved: false, duplicate: true });
    response = await post({ name: 'Rina', message: 'Selamat', idempotencyKey: key });
    expect(response.status).toBe(200);

    raise('WISH_LIMIT');
    expect((await post({ name: 'Rina', message: 'Lagi', idempotencyKey: crypto.randomUUID() })).status).toBe(429);
  });
});

test.describe('staff check-in', () => {
  const post = (body: unknown, headers: Record<string, string> = staff) => postCheckIn(req('/api/checkin', { method: 'POST', body, headers }));

  test('is closed unless a long staff key is configured and given', async () => {
    delete process.env.CHECKIN_KEY;
    expect((await post({ ping: true })).status).toBe(503);
    process.env.CHECKIN_KEY = 'short';
    expect((await post({ ping: true }, { 'x-staff-key': 'short' })).status).toBe(503);
    process.env.CHECKIN_KEY = STAFF_KEY;
    expect((await post({ ping: true }, {})).status).toBe(401);
    expect((await post({ ping: true }, { 'x-staff-key': `${STAFF_KEY}x` })).status).toBe(401);
    // A guest's own code is not a staff key.
    expect((await post({ code: CODE }, { 'x-staff-key': CODE })).status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(await (await post({ ping: true })).json()).toEqual({ ok: true });
  });

  test('checks in by QR code (hashed), by party id, and searches by name', async () => {
    const party = { id: '00000000-0000-4000-8000-00000000000a', name: 'Keluarga Budi', maxGuests: 4, checkedInAt: '2026-12-20T00:40:00Z', already: false, rsvp: null };
    reply(party);
    expect(await (await post({ code: CODE })).json()).toEqual({ party });
    expect(calls[0]!.body).toEqual({ p_token_hash: CODE_HASH });

    reply({ ...party, already: true });
    expect((await (await post({ partyId: party.id })).json()).party.already).toBe(true);
    expect(calls[1]!.body).toEqual({ p_party_id: party.id });

    reply([party]);
    expect((await (await post({ query: ' bud ' })).json()).parties).toHaveLength(1);
    expect(calls[2]!.body).toEqual({ p_query: 'bud' });

    expect((await post({ query: 'b' })).status).toBe(422);
    expect((await post({ code: 'not a code' })).status).toBe(400);
    raise('NOT_FOUND');
    expect((await post({ code: 'B'.repeat(43) })).status).toBe(404);
  });
});
