import { test, expect, type Page, type Request } from '@playwright/test';

// The static preview does not serve api/, so these tests answer the endpoints in the browser.
const CODE = 'Gx7_k2'.padEnd(43, 'q');
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function openInvitation(page: Page, query: string) {
  await page.goto(`/${query}`);
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.keyboard.press('Escape'); // close the Entry Access Card
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#cover')).toBeHidden();
}

test('RSVP from a personal link: loads the party, keeps input after a failure, then saves', async ({ page }) => {
  const posts: Request[] = [];
  let guestCalls = 0;
  await page.route('**/api/guest', (route) => {
    guestCalls++;
    expect(route.request().headers().authorization).toBe(`Bearer ${CODE}`);
    return route.fulfill(json({ party: { name: 'Keluarga Budi', maxGuests: 3, rsvp: null } }));
  });
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));
  let attempt = 0;
  await page.route('**/api/rsvp', (route) => {
    posts.push(route.request());
    return ++attempt === 1
      ? route.fulfill(json({ error: { code: 'DB_UNAVAILABLE', message: 'Layanan sedang tidak tersedia.' } }, 503))
      : route.fulfill(json({ rsvp: { attendance: 'attending', guestCount: 3, updatedAt: '2026-11-14T02:00:00Z' } }));
  });

  await openInvitation(page, `?to=Budi&k=${CODE}`);
  // Nothing is requested before the guest scrolls toward the forms.
  expect(guestCalls).toBe(0);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  const form = page.locator('[data-rsvp-form]');
  await expect(form.locator('[data-rsvp-party-name]')).toHaveText('Keluarga Budi');
  // Only hadir / tidak hadir: no head-count field.
  await expect(form.getByLabel(/jumlah/i)).toHaveCount(0);

  await form.getByRole('radio', { name: 'Hadir', exact: true }).check();
  const submit = page.getByRole('button', { name: 'Kirim konfirmasi' });
  await submit.click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Layanan sedang tidak tersedia.');
  await expect(form.locator('input[value="attending"]')).toBeChecked();

  await submit.click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Terima kasih! Kehadiran Anda telah tercatat.');
  await expect(page.getByRole('button', { name: 'Perbarui konfirmasi' })).toBeEnabled();
  expect(posts).toHaveLength(2);
  // "Hadir" counts the whole invitation (maxGuests).
  expect(posts[1]!.postDataJSON()).toEqual({ attendance: 'attending', guestCount: 3 });
  expect(posts[1]!.url()).not.toContain(CODE);
  // Both forms share one party request.
  expect(guestCalls).toBe(1);

  await form.getByRole('radio', { name: 'Tidak hadir' }).check();
  await page.getByRole('button', { name: 'Perbarui konfirmasi' }).click();
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2]!.postDataJSON()).toEqual({ attendance: 'declined', guestCount: 0 });
});

test('a short link /i/<name>-<code> greets by name and authorizes with its code', async ({ page }) => {
  const SHORT = 'x7k2p9q4mb';
  // Vercel rewrites /i/* to the invitation page (vercel.json); the static preview does not.
  await page.route('**/i/**', async (route) => route.fulfill({ response: await route.fetch({ url: new URL('/', route.request().url()).href }) }));
  const auth: (string | undefined)[] = [];
  await page.route('**/api/guest', (route) => {
    auth.push(route.request().headers().authorization);
    return route.fulfill(json({ party: { name: 'Dwi Asti Febrianti, SKM., M.AK.', maxGuests: 2, rsvp: null } }));
  });
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));

  await page.goto(`/i/Dwi-Asti-Febrianti_SKM._M.AK.-${SHORT}`);
  await expect(page.locator('#cover [data-guest-name]')).toHaveText('Dwi Asti Febrianti, SKM., M.AK.');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  // The Entry Access Card opens with a QR for this guest.
  await expect(page.locator('[data-access-qr] path')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-rsvp-party-name]')).toHaveText('Dwi Asti Febrianti, SKM., M.AK.');
  expect(auth).toEqual([`Bearer ${SHORT}`]);
});

test('an existing RSVP is shown for updating', async ({ page }) => {
  await page.route('**/api/guest', (route) => route.fulfill(json({ party: { name: 'Ibu Sari', maxGuests: 4, rsvp: { attendance: 'attending', guestCount: 3, updatedAt: '2026-11-14T02:00:00Z' } } })));
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));
  await openInvitation(page, `?to=Sari&k=${CODE}`);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-rsvp-form] input[value="attending"]')).toBeChecked();
  await expect(page.locator('[data-rsvp-status]')).toHaveText('Konfirmasi tersimpan: hadir.');
  await expect(page.getByRole('button', { name: 'Perbarui konfirmasi' })).toBeVisible();
  await expect(page.locator('#wish-name')).toHaveValue('Ibu Sari');
});

test('group link: each person answers with their own name; this phone keeps its own answer', async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  const keys: string[] = [];
  let saved: Record<string, unknown> | null = null;
  await page.route('**/api/guest', (route) => {
    keys.push(route.request().headers()['x-respondent-key'] ?? '');
    return route.fulfill(json({ party: { name: 'Teman Kantor', maxGuests: 4, group: true, rsvp: saved } }));
  });
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));
  await page.route('**/api/rsvp', (route) => {
    const body = route.request().postDataJSON();
    posts.push(body);
    saved = { attendance: body.attendance, guestCount: body.guestCount, updatedAt: '2026-11-14T02:00:00Z', name: body.name };
    return route.fulfill(json({ rsvp: saved }));
  });

  await openInvitation(page, `?to=Teman%20Kantor&k=${CODE}`);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  const form = page.locator('[data-rsvp-form]');
  await expect(form.locator('[data-rsvp-party-label]')).toHaveText('Undangan grup');
  await expect(form.locator('[data-rsvp-party-name]')).toHaveText('Teman Kantor');
  await form.getByRole('radio', { name: 'Hadir', exact: true }).check();
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  // The name is required on a group link (the browser's own check); nothing is sent without it.
  expect(await page.getByLabel('Nama Anda', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(posts).toHaveLength(0);

  await page.getByLabel('Nama Anda', { exact: true }).fill('Budi');
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Terima kasih, Budi! Kehadiran Anda telah tercatat.');
  // On a group link each person answers for themselves: one person.
  expect(posts[0]).toEqual({ attendance: 'attending', guestCount: 1, name: 'Budi', respondentKey: keys[0] });
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);

  // Reopening on the same phone shows this person's own answer, using the same key.
  await openInvitation(page, `?to=Teman%20Kantor&k=${CODE}`);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Nama Anda', { exact: true })).toHaveValue('Budi');
  await expect(page.locator('[data-rsvp-status]')).toHaveText('Konfirmasi tersimpan atas nama Budi: hadir.');
  await expect(page.locator('#wish-name')).toHaveValue('Budi');
  expect(keys[1]).toBe(keys[0]);
});

test('group with members: each person picks their own name, taken names are locked, and the card QR follows the name', async ({ page }) => {
  const BUDI = '3c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
  const SARI = '4d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
  const ANDI = '5e3f4a5b-6c7d-4e8f-9a0b-b2c3d4e5f6a7';
  const posts: Record<string, unknown>[] = [];
  await page.route('**/api/guest', (route) => route.fulfill(json({ party: { name: 'Teman Kantor', maxGuests: 1, group: true, rsvp: null, members: [
    { id: ANDI, name: 'Andi', taken: true, mine: false },
    { id: BUDI, name: 'Budi', taken: false, mine: false },
    { id: SARI, name: 'Sari', taken: false, mine: false },
  ] } })));
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));
  await page.route('**/api/rsvp', (route) => {
    const body = route.request().postDataJSON();
    posts.push(body);
    if (body.memberId === SARI) return route.fulfill(json({ error: { code: 'NAME_TAKEN', message: 'Nama ini sudah dipilih dari ponsel lain.' } }, 409));
    return route.fulfill(json({ rsvp: { attendance: body.attendance, guestCount: 1, updatedAt: '2026-11-27T02:00:00Z', name: 'Budi', memberId: BUDI } }));
  });

  await openInvitation(page, `?to=Teman%20Kantor&k=${CODE}`);
  const qrPath = () => page.locator('[data-access-qr] path').getAttribute('d');
  await page.getByRole('button', { name: 'Kartu akses masuk', exact: true }).click();
  await expect(page.locator('[data-access-qr] path')).toHaveCount(1);
  const groupQr = await qrPath();
  await page.keyboard.press('Escape');

  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  const form = page.locator('[data-rsvp-form]');
  const picker = page.getByLabel('Pilih nama Anda');
  await expect(picker).toBeEnabled();
  await expect(page.getByLabel('Nama Anda', { exact: true })).toBeHidden();
  await expect(picker.locator('option[disabled]')).toHaveText('Andi (sudah dipilih)');

  // Taken meanwhile by another phone: shown as taken, nothing else changes.
  await picker.selectOption(SARI);
  await form.getByRole('radio', { name: 'Hadir', exact: true }).check();
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Nama ini sudah dipilih dari ponsel lain.');
  await expect(picker.locator(`option[value="${SARI}"]`)).toBeDisabled();
  await expect(picker).toHaveValue('');

  await picker.selectOption(BUDI);
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Terima kasih, Budi! Kehadiran Anda telah tercatat.');
  expect(posts.at(-1)).toEqual({ attendance: 'attending', guestCount: 1, memberId: BUDI, respondentKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });

  // The Entry Access Card now carries Budi, so its QR changes.
  await page.getByRole('button', { name: 'Kartu akses masuk', exact: true }).click();
  await expect.poll(qrPath).not.toBe(groupQr);
});

test('wishes: listed as plain text with paging; a retried wish reuses its key and shows at once', async ({ page }) => {
  await page.route('**/api/guest', (route) => route.fulfill(json({ party: { name: 'Rina', maxGuests: 1, rsvp: null } })));
  const limits: (string | null)[] = [];
  await page.route('**/api/wishes?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    limits.push(params.get('limit'));
    const before = params.get('before');
    return route.fulfill(json(before
      ? { wishes: [{ name: 'Andi', message: 'Bahagia selalu', createdAt: '2026-11-12T02:00:00Z' }], next: null }
      : { wishes: [{ name: '<img src=x onerror=alert(1)>', message: 'Selamat!\nSemoga sakinah', createdAt: '2026-11-13T02:00:00Z' }], next: '2026-11-13T02:00:00+00:00_00000000-0000-4000-8000-000000000001' }));
  });
  const keys: string[] = [];
  await page.route('**/api/wishes', (route) => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    return keys.length === 1 ? route.abort('internetdisconnected') : route.fulfill(json({ wish: { approved: true } }, 201));
  });

  await openInvitation(page, `?to=Rina&k=${CODE}`);
  await page.locator('#wishes').scrollIntoViewIfNeeded();
  const list = page.locator('[data-wishes-list]');
  await expect(list.locator('.wish')).toHaveCount(1);
  await expect(list.locator('.wish-name').first()).toHaveText('<img src=x onerror=alert(1)>');
  expect(await list.locator('img').count()).toBe(0);
  await page.getByRole('button', { name: 'Muat ucapan lainnya' }).click();
  await expect(list.locator('.wish')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Muat ucapan lainnya' })).toBeHidden();
  expect(limits).toEqual(['5', '5']); // 5 wishes per page

  await page.locator('#wish-message').fill('Selamat menempuh hidup baru');
  await page.getByRole('button', { name: 'Kirim ucapan' }).click();
  await expect(page.locator('[data-wishes-status]')).toContainText('Koneksi terputus');
  await expect(page.locator('#wish-message')).toHaveValue('Selamat menempuh hidup baru');
  await page.getByRole('button', { name: 'Kirim ucapan' }).click();
  await expect(page.locator('[data-wishes-status]')).toHaveText('Terima kasih atas ucapan dan doanya!');
  await expect(page.locator('#wish-message')).toHaveValue('');
  await expect(list.locator('.wish')).toHaveCount(3);
  await expect(list.locator('.wish-message').first()).toHaveText('Selamat menempuh hidup baru');
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test('without a personal code RSVP is hidden, wishes cannot be sent, and the invitation still works if the API is down', async ({ page }) => {
  let guestCalls = 0;
  await page.route('**/api/guest', (route) => { guestCalls++; return route.abort(); });
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ error: { code: 'DB_UNAVAILABLE', message: 'Layanan sedang tidak tersedia.' } }, 503)));
  await openInvitation(page, '?to=Tamu');
  await page.locator('#wishes').scrollIntoViewIfNeeded();
  await expect(page.locator('#rsvp')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Kirim ucapan' })).toBeDisabled();
  await expect(page.locator('[data-wishes-list-status]')).toHaveText('Layanan sedang tidak tersedia.');
  expect(guestCalls).toBe(0);
});

test('check-in: staff sign in once, scanned codes are confirmed and repeats flagged', async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  let checkedIn = false;
  // On the context: every scan opens a new tab.
  await page.context().route('**/api/checkin', (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (route.request().headers()['x-staff-key'] !== 'correct-staff-key-0123456789') {
      return route.fulfill(json({ error: { code: 'STAFF_UNAUTHORIZED', message: 'Kunci petugas salah.' } }, 401));
    }
    if (body.ping) return route.fulfill(json({ ok: true }));
    const already = checkedIn;
    checkedIn = true;
    return route.fulfill(json({ party: { id: '00000000-0000-4000-8000-00000000000a', name: 'Keluarga Budi', maxGuests: 4, checkedInAt: '2026-12-20T00:40:00Z', already, rsvp: { attendance: 'attending', guestCount: 3, updatedAt: '2026-11-14T02:00:00Z' } } }));
  });

  await page.goto(`/checkin/#${CODE}`);
  // The guest code leaves the address bar immediately; only the sign-in is shown.
  await expect(page).toHaveURL(/\/checkin\/$/);
  const login = page.locator('[data-staff-login]');
  await expect(login).toBeVisible();
  await page.getByLabel('Kunci petugas').fill('wrong-key');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(login.locator('[data-login-status]')).toHaveText('Kunci petugas salah.');

  await page.getByLabel('Kunci petugas').fill('correct-staff-key-0123456789');
  await page.getByRole('button', { name: 'Masuk' }).click();
  const result = page.locator('[data-result]');
  await expect(result.locator('[data-result-name]')).toHaveText('Keluarga Budi');
  await expect(result).toHaveAttribute('data-state', 'ok');
  await expect(result.locator('[data-result-rsvp]')).toHaveText('Hadir, 3 orang');
  expect(bodies.at(-1)).toEqual({ code: CODE });

  // The next scan opens a new tab: no sign-in needed, and a repeat is flagged.
  const next = await page.context().newPage();
  await next.goto(`/checkin/#${CODE}`);
  await expect(next.locator('[data-staff-login]')).toBeHidden();
  await expect(next.locator('[data-result]')).toHaveAttribute('data-state', 'already');
  await expect(next.locator('[data-result-title]')).toHaveText('Sudah check-in sebelumnya');

  // A short link's QR (/checkin/#<10-character code>) is sent the same way.
  const third = await page.context().newPage();
  await third.goto('/checkin/#x7k2p9q4mb');
  await expect(third.locator('[data-result]')).toBeVisible();
  expect(bodies.at(-1)).toEqual({ code: 'x7k2p9q4mb' });
});

test('check-in: a member card records that person; a group QR lists the members to tap', async ({ page }) => {
  const BUDI = '3c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
  const SARI = '4d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
  const group = { id: '00000000-0000-4000-8000-00000000000b', name: 'Teman Kantor', maxGuests: 1, checkedInAt: null, rsvp: null, group: { responses: 1, guests: 1 } };
  const members = [
    { id: BUDI, name: 'Budi', attendance: 'attending', checkedInAt: null },
    { id: SARI, name: 'Sari', attendance: null, checkedInAt: null },
  ];
  const bodies: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('wedding-staff-key', 'correct-staff-key-0123456789'));
  await page.context().route('**/api/checkin', (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    if (body.memberId) {
      const member = members.find((m) => m.id === body.memberId)!;
      return route.fulfill(json({ party: { ...group, already: false, member: { ...member, checkedInAt: '2026-12-20T00:45:00Z' } } }));
    }
    return route.fulfill(json({ party: { ...group, already: false, members } }));
  });

  // Budi's own card: his arrival is recorded by name.
  await page.goto(`/checkin/#${CODE}.${BUDI}`);
  await expect(page).toHaveURL(/\/checkin\/$/);
  const result = page.locator('[data-result]');
  await expect(result.locator('[data-result-name]')).toHaveText('Budi');
  await expect(result.locator('[data-result-title]')).toHaveText('Selamat datang · Teman Kantor');
  await expect(result.locator('[data-result-rsvp]')).toHaveText('Hadir');
  expect(bodies.at(-1)).toEqual({ code: CODE, memberId: BUDI });

  // The group's own QR (each scan opens a new tab): staff choose who arrived.
  const next = await page.context().newPage();
  await next.goto(`/checkin/#${CODE}`);
  const groupResult = next.locator('[data-result]');
  await expect(groupResult.locator('[data-result-name]')).toHaveText('Teman Kantor');
  const list = groupResult.locator('[data-result-member-list] li');
  await expect(list).toHaveCount(2);
  await expect(list.nth(1)).toContainText('Belum konfirmasi');
  await list.nth(1).getByRole('button', { name: 'Check-in' }).click();
  await expect(groupResult.locator('[data-result-name]')).toHaveText('Sari');
  await expect(groupResult.locator('[data-result-member-list] li')).toHaveCount(0);
  expect(bodies.at(-1)).toEqual({ partyId: group.id, memberId: SARI });
});
