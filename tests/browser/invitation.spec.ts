import { test, expect } from '@playwright/test';

test('opens the invitation, safely greets the guest, and keeps unconnected forms disabled', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?to=%3Cscript%3EGuest%3C%2Fscript%3E');
  const names = page.locator('[data-guest-name]');
  await expect(names.first()).toHaveText('<script>Guest</script>');
  expect(await names.allTextContents()).toEqual(Array(await names.count()).fill('<script>Guest</script>'));
  expect(await page.locator('script', { hasText: 'Guest' }).count()).toBe(0);
  await expect(page.locator('main')).toBeHidden();
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await expect(page.locator('#cover')).toBeHidden();
  await expect(page.locator('main')).toBeVisible();
  // The Entry Access Card replaces the greeting pop-up; closing it returns focus to the invitation.
  const card = page.getByRole('dialog', { name: 'Vian & Ghea' });
  await expect(card).toBeVisible();
  await expect(card.locator('[data-guest-name]')).toHaveText('<script>Guest</script>');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('[data-music-player]')).toBeVisible();
  await expect(page.locator('[data-music-toggle]')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kirim konfirmasi' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kirim ucapan' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('every visit starts at the cover, including a reload after opening', async ({ page }) => {
  await page.goto('/?to=Budi');
  await expect(page.locator('#cover')).toBeVisible();
  await expect(page.locator('#cover [data-guest-name]')).toHaveText('Budi');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await expect(page.locator('main')).toBeVisible();
  await page.reload();
  await expect(page.locator('#cover')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  await page.goto('/?to=Budi#invitation');
  await expect(page.locator('#cover')).toBeVisible();
});

test('background video starts loading before opening, but not with reduced motion', async ({ page, browser }) => {
  await page.goto('/?to=Budi');
  // Playback itself depends on the browser's H.264 support; the request is what we control.
  await expect(page.locator('[data-backdrop-video]')).toHaveAttribute('src', /background\..*\.mp4$/);
  await expect(page.locator('#cover')).toBeVisible();

  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto('/?to=Budi');
  await reduced.waitForLoadState('load');
  await expect(reduced.locator('[data-backdrop-video]')).not.toHaveAttribute('src', /.+/);
  await reduced.close();
});

test('direct section links open without autoplay and reduced motion skips reveals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#rsvp');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#cover')).toBeHidden();
  await expect(page.locator('[data-music-player]')).toBeVisible();
  await expect(page.locator('.reveal-active')).toHaveCount(0);
});

test('essential content remains readable without JavaScript at 320px', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/');
  await expect(page.locator('main')).toBeVisible();
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await expect(page).toHaveURL(/#invitation$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('requests music from the opening gesture and reports rejected playback', async ({ page }) => {
  // Test the player wiring, not an absent soundtrack or the browser's real autoplay policy.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('Blocked in test', 'NotAllowedError'));
    };
  });
  await page.goto('/');
  await page.locator('audio').evaluate((audio) => audio.setAttribute('src', '/audio/test.mp3'));
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await expect(page.locator('[data-music-status]')).toHaveText('Ketuk tombol untuk memutar musik.');
  await expect(page.locator('main')).toBeVisible();
});

test('countdown stops gracefully once the event has started', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00+07:00') });
  await page.goto('/#event');
  await expect(page.locator('[data-countdown]')).toBeHidden();
  await expect(page.locator('[data-countdown-done]')).toBeVisible();
});

test('menu opens, closes with Escape and returns focus', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.getByRole('button', { name: 'Tutup kartu akses' }).click();
  const toggle = page.getByRole('button', { name: 'Buka menu' });
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('access card shows a QR only for a well-formed personal code', async ({ page }) => {
  const code = 'kpk_0hkCQQOrXLaeUWPjp8NW2WoydQPBql6QLbhj9WA';
  await page.goto(`/?to=Budi&k=${code}`);
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  const card = page.getByRole('dialog', { name: 'Vian & Ghea' });
  await expect(card.getByRole('img', { name: 'Kode QR akses masuk' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Simpan Kartu' })).toBeVisible();
  await card.getByRole('button', { name: 'Tutup kartu akses' }).click();
  await page.getByRole('button', { name: 'Kartu akses masuk' }).click();
  await expect(card).toBeVisible();

  // A malformed or missing code never produces a QR (and nothing from ?k= is rendered as markup).
  for (const query of ['?to=Budi&k=%3Cimg%20src%3Dx%3E', '?to=Budi']) {
    await page.goto(`/${query}`);
    await page.getByRole('link', { name: 'Buka Undangan' }).click();
    await expect(card.getByText('Kode QR tersedia pada tautan undangan pribadi Anda.')).toBeVisible();
    await expect(card.getByRole('img', { name: 'Kode QR akses masuk' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Simpan Kartu' })).toBeHidden();
  }
});
