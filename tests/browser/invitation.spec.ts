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
  await expect(page.locator('video.whole[data-backdrop-video]')).toHaveAttribute('src', /\/background\.[^/]*\.mp4$/);
  await expect(page.locator('video.fill-blur[data-backdrop-video]')).toHaveAttribute('src', /\/background-blur\.[^/]*\.mp4$/);
  await expect(page.locator('#cover')).toBeVisible();

  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto('/?to=Budi');
  await reduced.waitForLoadState('load');
  for (const video of await reduced.locator('[data-backdrop-video]').all()) await expect(video).not.toHaveAttribute('src', /.+/);
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
  // Keyboard users: the card reopens from the QR button and focus returns there on Escape.
  const qrButton = page.getByRole('button', { name: 'Kartu akses masuk' });
  await qrButton.focus();
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(qrButton).toBeFocused();
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

test('video clip loads YouTube only after the guest presses play, without leaking the guest link', async ({ page }) => {
  const youtube: string[] = [];
  page.on('request', (request) => { if (/youtube|ytimg|googlevideo/.test(request.url())) youtube.push(request.url()); });
  // Keep the test offline: answer the embed request locally.
  await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }));
  await page.goto('/?to=Budi&k=kpk_0hkCQQOrXLaeUWPjp8NW2WoydQPBql6QLbhj9WA#gallery');
  const play = page.getByRole('link', { name: /^Putar Video klip/ });
  await expect(play).toHaveAttribute('href', 'https://www.youtube.com/watch?v=gpVMepCXalA');
  await page.waitForLoadState('networkidle');
  expect(youtube).toEqual([]);
  await play.click();
  const player = page.locator('#gallery iframe');
  await expect(player).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/gpVMepCXalA\?autoplay=1/);
  await expect(player).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect(play).toHaveCount(0);
});

test('floating buttons step aside while the video clip is on screen', async ({ page }) => {
  await page.goto('/?to=Budi');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.getByRole('button', { name: 'Tutup kartu akses' }).click();
  const side = page.locator('[data-side-controls]');
  await expect(side).toBeVisible();
  await page.locator('[data-video-clip]').scrollIntoViewIfNeeded();
  await expect(side).toBeHidden();
  await page.locator('#rsvp').scrollIntoViewIfNeeded();
  await expect(side).toBeVisible();
});

test('album is shuffled so photos from the same moment never touch, and the viewer follows the order', async ({ page }) => {
  await page.goto('/?to=Budi');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.getByRole('button', { name: 'Tutup kartu akses' }).click();
  await page.locator('#gallery').scrollIntoViewIfNeeded();
  const touching = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-gallery] li')].map((li) => ({ moment: li.dataset.moment, box: li.getBoundingClientRect() }));
    let count = 0;
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i]!, b = tiles[j]!;
      if (a.moment === undefined || a.moment !== b.moment) continue;
      const sameColumn = Math.abs(a.box.left - b.box.left) < 5;
      const gap = Math.max(a.box.top, b.box.top) - Math.min(a.box.bottom, b.box.bottom);
      const overlap = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (sameColumn ? gap < 20 : overlap > 0.2 * Math.min(a.box.height, b.box.height)) count++;
    }
    return count;
  });
  expect(touching).toBe(0);
  const third = page.locator('[data-gallery-item]').nth(2);
  const href = await third.getAttribute('href');
  await third.click();
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(/^3 \/ \d+$/);
  expect(await page.locator('[data-lightbox-image]').getAttribute('src')).toContain(href!);
});

test('more gift accounts open in a pop-up with their own copy status, and close back to the button', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.keyboard.press('Escape'); // close the Entry Access Card
  const gift = page.locator('#gift');
  await gift.scrollIntoViewIfNeeded();
  await expect(gift.getByText('Superbank', { exact: true })).toBeVisible();
  // The extra accounts are not in the page itself, only behind the button.
  await expect(gift.getByText('Mandiri', { exact: true })).toHaveCount(0);

  const open = page.getByRole('button', { name: 'Lihat rekening lainnya' });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Rekening & Dompet Digital' });
  await expect(sheet).toBeVisible();
  for (const text of ['Mandiri', '1310015634357', 'BCA', '0700237524', 'Seabank', '901279716707', '082237058889']) {
    await expect(sheet.getByText(text, { exact: true })).toBeVisible();
  }
  await sheet.getByRole('button', { name: 'Salin BCA' }).click();
  // Copied, or the manual fallback where the clipboard is unavailable; shown inside the pop-up either way.
  await expect(sheet.locator('[data-copy-status]')).toContainText(/BCA berhasil disalin|0700237524/);
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0700237524');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
});

test('without JavaScript the extra gift accounts are listed in the page', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/');
  const gift = page.locator('#gift');
  await expect(gift.getByText('1310015634357')).toBeVisible();
  await expect(gift.getByText('082237058889')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lihat rekening lainnya' })).toBeHidden();
  await context.close();
});
