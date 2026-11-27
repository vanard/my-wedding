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
      : route.fulfill(json({ rsvp: { attendance: 'attending', guestCount: 2, updatedAt: '2026-11-14T02:00:00Z' } }));
  });

  await openInvitation(page, `?to=Budi&k=${CODE}`);
  // Nothing is requested before the guest scrolls toward the forms.
  expect(guestCalls).toBe(0);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  const form = page.locator('[data-rsvp-form]');
  await expect(form.locator('[data-rsvp-party-name]')).toHaveText('Keluarga Budi');
  await expect(page.locator('#party-size option')).toHaveCount(3);

  await form.getByRole('radio', { name: 'Hadir', exact: true }).check();
  await page.locator('#party-size').selectOption('2');
  const submit = page.getByRole('button', { name: 'Kirim konfirmasi' });
  await submit.click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Layanan sedang tidak tersedia.');
  await expect(form.locator('input[value="attending"]')).toBeChecked();
  await expect(page.locator('#party-size')).toHaveValue('2');

  await submit.click();
  await expect(form.locator('[data-rsvp-status]')).toContainText('Kehadiran 2 orang telah tercatat');
  await expect(page.getByRole('button', { name: 'Perbarui konfirmasi' })).toBeEnabled();
  expect(posts).toHaveLength(2);
  expect(posts[1]!.postDataJSON()).toEqual({ attendance: 'attending', guestCount: 2 });
  expect(posts[1]!.url()).not.toContain(CODE);
  // Both forms share one party request.
  expect(guestCalls).toBe(1);

  // Declining hides the guest count.
  await form.getByRole('radio', { name: 'Tidak hadir' }).check();
  await expect(page.locator('#party-size')).toBeHidden();
});

test('an existing RSVP is shown for updating', async ({ page }) => {
  await page.route('**/api/guest', (route) => route.fulfill(json({ party: { name: 'Ibu Sari', maxGuests: 4, rsvp: { attendance: 'attending', guestCount: 3, updatedAt: '2026-11-14T02:00:00Z' } } })));
  await page.route('**/api/wishes?*', (route) => route.fulfill(json({ wishes: [], next: null })));
  await openInvitation(page, `?to=Sari&k=${CODE}`);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-rsvp-form] input[value="attending"]')).toBeChecked();
  await expect(page.locator('#party-size')).toHaveValue('3');
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
  await page.locator('#party-size').selectOption('2');
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  // The name is required on a group link (the browser's own check); nothing is sent without it.
  expect(await page.getByLabel('Nama Anda').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(posts).toHaveLength(0);

  await page.getByLabel('Nama Anda').fill('Budi');
  await page.getByRole('button', { name: 'Kirim konfirmasi' }).click();
  await expect(form.locator('[data-rsvp-status]')).toHaveText('Terima kasih, Budi! Kehadiran 2 orang telah tercatat.');
  expect(posts[0]).toEqual({ attendance: 'attending', guestCount: 2, name: 'Budi', respondentKey: keys[0] });
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);

  // Reopening on the same phone shows this person's own answer, using the same key.
  await openInvitation(page, `?to=Teman%20Kantor&k=${CODE}`);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Nama Anda')).toHaveValue('Budi');
  await expect(page.locator('#party-size')).toHaveValue('2');
  await expect(page.locator('#wish-name')).toHaveValue('Budi');
  expect(keys[1]).toBe(keys[0]);
});

test('wishes: listed as plain text with paging; a retried wish reuses its key and shows at once', async ({ page }) => {
  await page.route('**/api/guest', (route) => route.fulfill(json({ party: { name: 'Rina', maxGuests: 1, rsvp: null } })));
  await page.route('**/api/wishes?*', (route) => {
    const before = new URL(route.request().url()).searchParams.get('before');
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
});
