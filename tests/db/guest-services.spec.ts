// Database checks for supabase/migrations against a designated TEST project. Skipped unless
//   TEST_SUPABASE_URL, TEST_SUPABASE_SECRET_KEY and TEST_SUPABASE_PUBLISHABLE_KEY
// are set. Creates synthetic parties named "zz-test-…" and deletes them afterwards.
// Never point this at the production project with real guests.
import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const URL_ = process.env.TEST_SUPABASE_URL?.replace(/\/+$/, '');
const SECRET = process.env.TEST_SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
test.skip(!URL_ || !SECRET || !PUBLISHABLE, 'Set TEST_SUPABASE_* to run database checks against a test project.');

const run = `zz-test-${Date.now().toString(36)}`;
const hash = (code: string) => createHash('sha256').update(code).digest('hex');

async function call(path: string, body: unknown, key = SECRET!, method = 'POST') {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const response = await fetch(`${URL_}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const rpc = (name: string, args: Record<string, unknown>, key?: string) => call(`rpc/${name}`, args, key);

async function party(suffix: string, maxGuests = 3, isGroup = false) {
  const code = randomBytes(32).toString('base64url');
  const created = await call('invitation_parties', { display_name: `${run} ${suffix}`, max_guests: maxGuests, is_group: isGroup, token_hash: hash(code) });
  expect(created.status).toBe(201);
  return { code, tokenHash: hash(code), id: created.body[0].id as string };
}

test.afterAll(async () => {
  if (!URL_ || !SECRET) return;
  await fetch(`${URL_}/rest/v1/invitation_parties?display_name=like.${encodeURIComponent(`${run}%`)}`, {
    method: 'DELETE', headers: { apikey: SECRET },
  });
});

test('concurrent and repeated RSVPs leave exactly one current response per party', async () => {
  const p = await party('rsvp', 3);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    rpc('submit_rsvp', { p_token_hash: p.tokenHash, p_attendance: 'attending', p_guest_count: (i % 3) + 1 })));
  expect(results.every((r) => r.status === 200)).toBe(true);
  const rows = await call(`rsvps?party_id=eq.${p.id}&select=attendance,guest_count`, undefined, SECRET, 'GET');
  expect(rows.body).toHaveLength(1);

  const tooMany = await rpc('submit_rsvp', { p_token_hash: p.tokenHash, p_attendance: 'attending', p_guest_count: 4 });
  expect(tooMany.body.message).toBe('INVALID_GUEST_COUNT');
  const declined = await rpc('submit_rsvp', { p_token_hash: p.tokenHash, p_attendance: 'declined', p_guest_count: 2 });
  expect(declined.body).toMatchObject({ attendance: 'declined', guestCount: 0 });

  // The 10-per-10-minutes limit holds across parallel requests (9 used above, plus failures do not count).
  const burst = await Promise.all(Array.from({ length: 5 }, () =>
    rpc('submit_rsvp', { p_token_hash: p.tokenHash, p_attendance: 'declined', p_guest_count: 0 })));
  expect(burst.filter((r) => r.status === 200)).toHaveLength(1);
  expect(burst.filter((r) => r.body?.message === 'RATE_LIMITED')).toHaveLength(4);

  const unknown = await rpc('submit_rsvp', { p_token_hash: hash('nope'), p_attendance: 'declined', p_guest_count: 0 });
  expect(unknown.body.message).toBe('INVALID_TOKEN');
});

test('group link: answers from different people add up, the same person updates their own', async () => {
  const g = await party('group', 3, true);
  const budi = randomUUID();
  const sari = randomUUID();
  const answer = (key: string | null, name: string | null, attendance: string, count: number) =>
    rpc('submit_rsvp', { p_token_hash: g.tokenHash, p_attendance: attendance, p_guest_count: count, p_respondent_key: key, p_name: name });

  // Budi retries his answer at the same time Sari sends hers.
  const first = await Promise.all([
    ...Array.from({ length: 4 }, () => answer(budi, 'Budi', 'attending', 2)),
    answer(sari, 'Sari', 'attending', 1),
  ]);
  expect(first.every((r) => r.status === 200)).toBe(true);
  expect(first[4]!.body).toMatchObject({ attendance: 'attending', guestCount: 1, name: 'Sari' });
  let rows = await call(`group_rsvps?party_id=eq.${g.id}&select=name,guest_count&order=name`, undefined, SECRET, 'GET');
  expect(rows.body).toEqual([{ name: 'Budi', guest_count: 2 }, { name: 'Sari', guest_count: 1 }]);

  // Budi changes his answer: still two answers, now 3 + 1.
  expect((await answer(budi, 'Budi S.', 'attending', 3)).status).toBe(200);
  rows = await call(`group_rsvps?party_id=eq.${g.id}&select=name,guest_count&order=name`, undefined, SECRET, 'GET');
  expect(rows.body).toEqual([{ name: 'Budi S.', guest_count: 3 }, { name: 'Sari', guest_count: 1 }]);

  // Per-person limit, and a name plus key are required on a group link.
  expect((await answer(sari, 'Sari', 'attending', 4)).body.message).toBe('INVALID_GUEST_COUNT');
  expect((await answer(null, 'Andi', 'declined', 0)).body.message).toBe('GROUP_DETAILS_REQUIRED');
  expect((await answer(randomUUID(), '  ', 'declined', 0)).body.message).toBe('GROUP_DETAILS_REQUIRED');
  // Group answers never land in the one-per-party table.
  expect((await call(`rsvps?party_id=eq.${g.id}&select=party_id`, undefined, SECRET, 'GET')).body).toHaveLength(0);

  // Each browser sees only its own answer.
  const own = await rpc('guest_party', { p_token_hash: g.tokenHash, p_respondent_key: sari });
  expect(own.body).toMatchObject({ group: true, maxGuests: 3, rsvp: { name: 'Sari', guestCount: 1 } });
  const stranger = await rpc('guest_party', { p_token_hash: g.tokenHash, p_respondent_key: randomUUID() });
  expect(stranger.body.rsvp).toBeNull();

  // Staff: the shared QR never reads as "already checked in" and shows the totals.
  const scan = await rpc('check_in', { p_token_hash: g.tokenHash });
  const scanAgain = await rpc('check_in', { p_token_hash: g.tokenHash });
  expect(scan.body).toMatchObject({ already: false, group: { responses: 2, guests: 4 } });
  expect(scanAgain.body).toMatchObject({ already: false, checkedInAt: scan.body.checkedInAt });

  // A personal invitation still works as before and has no group summary.
  const personal = await party('personal', 2);
  const reply = await rpc('submit_rsvp', { p_token_hash: personal.tokenHash, p_attendance: 'attending', p_guest_count: 2 });
  expect(reply.body).toMatchObject({ attendance: 'attending', guestCount: 2 });
  expect((await rpc('guest_party', { p_token_hash: personal.tokenHash })).body).toMatchObject({ group: false });
});

test('retried wishes are stored once, shown right away and hidden when unapproved', async () => {
  const p = await party('wish');
  const key = randomUUID();
  const same = await Promise.all(Array.from({ length: 4 }, () =>
    rpc('submit_wish', { p_token_hash: p.tokenHash, p_idempotency_key: key, p_name: 'Tamu Uji', p_message: `Pesan ${run}` })));
  expect(same.every((r) => r.status === 200)).toBe(true);
  expect(same.filter((r) => r.body.duplicate === false)).toHaveLength(1);
  const stored = await call(`wishes?party_id=eq.${p.id}&select=id,approved`, undefined, SECRET, 'GET');
  expect(stored.body).toHaveLength(1);

  expect(stored.body[0].approved).toBe(true);
  expect(same.every((r) => r.body.approved === true)).toBe(true);

  const shownList = await rpc('public_wishes', { p_limit: 50 });
  const shown = shownList.body.find((w: { message: string }) => w.message === `Pesan ${run}`);
  expect(Object.keys(shown).sort()).toEqual(['created_at', 'id', 'message', 'name']);
  await call(`wishes?id=eq.${stored.body[0].id}`, { approved: false }, SECRET, 'PATCH');
  const hidden = await rpc('public_wishes', { p_limit: 50 });
  expect(hidden.body.some((w: { message: string }) => w.message === `Pesan ${run}`)).toBe(false);
});

test('check-in records the first arrival and reports repeats', async () => {
  const p = await party('checkin', 2);
  const first = await rpc('check_in', { p_token_hash: p.tokenHash });
  expect(first.body).toMatchObject({ name: `${run} checkin`, already: false });
  const again = await rpc('check_in', { p_party_id: p.id });
  expect(again.body).toMatchObject({ already: true, checkedInAt: first.body.checkedInAt });
  const found = await rpc('staff_find_parties', { p_query: `${run} CHECK` });
  expect(found.body).toHaveLength(1);
});

test('browser keys cannot read guest data or call the server functions', async () => {
  const p = await party('anon');
  for (const table of ['invitation_parties', 'rsvps', 'group_rsvps', 'wishes', 'request_events']) {
    const response = await call(`${table}?select=*`, undefined, PUBLISHABLE, 'GET');
    expect(response.status, table).not.toBe(200);
  }
  for (const [name, args] of [
    ['guest_party', { p_token_hash: p.tokenHash }],
    ['submit_rsvp', { p_token_hash: p.tokenHash, p_attendance: 'declined', p_guest_count: 0 }],
    ['public_wishes', {}],
    ['check_in', { p_token_hash: p.tokenHash }],
    ['staff_find_parties', { p_query: run }],
  ] as const) {
    const response = await rpc(name, args, PUBLISHABLE);
    expect(response.status, name).not.toBe(200);
  }
  const checked = await call(`invitation_parties?id=eq.${p.id}&select=checked_in_at`, undefined, SECRET, 'GET');
  expect(checked.body[0].checked_in_at).toBeNull();
});
