import { test, expect } from '@playwright/test';

// A well-formed personal code: RSVP, Wedding Gift and the Entry Access Card appear only with one.
const CODE = 'kpk_0hkCQQOrXLaeUWPjp8NW2WoydQPBql6QLbhj9WA';

test('opens the invitation, safely greets the guest, and keeps unconnected forms disabled', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?to=%3Cscript%3EGuest%3C%2Fscript%3E&k=${CODE}`);
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
  await expect(page.locator('[data-music-toggle]')).toBeEnabled();
  // RSVP stays disabled until the party loads from the API (not running here). Wishes without a
  // personal code are covered in guest-forms.spec.ts.
  await expect(page.getByRole('button', { name: 'Kirim konfirmasi' })).toBeDisabled();
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
  await page.goto(`/?k=${CODE}#rsvp`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#cover')).toBeHidden();
  await expect(page.locator('[data-music-player]')).toBeVisible();
  await expect(page.locator('.reveal-active')).toHaveCount(0);
  // Without a personal code the RSVP section is hidden, so its link starts at the cover.
  await page.goto('/#rsvp');
  await expect(page.locator('#cover')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
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

test('the background video shows only while it really plays, so a paused or frozen video never covers the photo', async ({ page }) => {
  // Stand-in players: tests control playing, pausing and a silent freeze (time stops).
  await page.addInitScript(() => {
    const paused = new WeakMap<HTMLMediaElement, boolean>();
    const w = window as unknown as { plays: number; frozen: boolean; time: number };
    w.plays = 0; w.frozen = false; w.time = 0;
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return paused.get(this) ?? true; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get() { return w.time; }, set() {} });
    HTMLMediaElement.prototype.play = function () {
      if (this.tagName === 'VIDEO') w.plays++;
      paused.set(this, false);
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { paused.set(this, true); this.dispatchEvent(new Event('pause')); };
    setInterval(() => { if (!w.frozen) w.time += 0.25; }, 250);
  });
  await page.goto('/?to=Budi');
  const main = page.locator('video.whole');
  await expect(main).toHaveClass(/is-playing/);

  // iOS pauses it (a call, another app): the photo shows again, and it restarts on return.
  await main.evaluate((video: HTMLVideoElement) => video.pause());
  await expect(main).not.toHaveClass(/is-playing/);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(main).toHaveClass(/is-playing/);

  // Frozen without a pause event: the watchdog fades it out and restarts it.
  const plays = await page.evaluate(() => (window as unknown as { plays: number }).plays);
  await page.evaluate(() => { (window as unknown as { frozen: boolean }).frozen = true; });
  await expect.poll(() => page.evaluate(() => (window as unknown as { plays: number }).plays), { timeout: 8000 }).toBeGreaterThan(plays);
});

test('requests music from the opening gesture and reports rejected playback', async ({ page }) => {
  // Test the player wiring, not an absent soundtrack or the browser's real autoplay policy.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('Blocked in test', 'NotAllowedError'));
    };
  });
  const audioRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/audio/')) audioRequests.push(request.url()); });
  await page.goto('/');
  // The soundtrack is configured but not downloaded before the guest opens the invitation.
  await expect(page.locator('audio')).toHaveAttribute('src', '/audio/music.mp3');
  // Not 'networkidle': the background video keeps streaming.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);
  expect(audioRequests).toEqual([]);
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await expect(page.locator('[data-music-status]')).toHaveText('Ketuk layar untuk memutar musik.');
  await expect(page.locator('main')).toBeVisible();
});

test('music pauses while the guest is away and resumes on return, unless they paused it', async ({ page }) => {
  // A stand-in player, so this checks the wiring rather than real audio output.
  await page.addInitScript(() => {
    const state = new WeakMap<HTMLMediaElement, boolean>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return state.get(this) ?? true; } });
    HTMLMediaElement.prototype.play = function () { state.set(this, false); this.dispatchEvent(new Event('play')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { state.set(this, true); this.dispatchEvent(new Event('pause')); };
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });
    (window as unknown as { setHidden: (value: boolean) => void }).setHidden = (value) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  const setHidden = (value: boolean) => page.evaluate((v) => (window as unknown as { setHidden: (value: boolean) => void }).setHidden(v), value);
  const paused = () => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused);
  await page.goto('/');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  expect(await paused()).toBe(false);

  await setHidden(true);
  expect(await paused()).toBe(true);
  await setHidden(false);
  expect(await paused()).toBe(false);

  // Paused by the guest: it stays paused after they come back.
  await page.keyboard.press('Escape'); // close the Entry Access Card
  await page.locator('[data-music-toggle]').click();
  expect(await paused()).toBe(true);
  await setHidden(true);
  await setHidden(false);
  expect(await paused()).toBe(true);
});

test('music comes back after the video clip, even when the phone paused it first', async ({ page }) => {
  // Stand-in audio (as above) and a stand-in YouTube player on the real player origin, which
  // reports its state the way the IFrame API does.
  await page.addInitScript(() => {
    const state = new WeakMap<HTMLMediaElement, boolean>();
    const w = window as unknown as { rejectNextPlay: boolean };
    w.rejectNextPlay = false;
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return state.get(this) ?? true; } });
    HTMLMediaElement.prototype.play = function () {
      if (w.rejectNextPlay) { w.rejectNextPlay = false; return Promise.reject(new DOMException('Blocked in test', 'NotAllowedError')); }
      state.set(this, false); this.dispatchEvent(new Event('play')); return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { state.set(this, true); this.dispatchEvent(new Event('pause')); };
  });
  await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }));
  const paused = () => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused);
  const status = page.locator('[data-music-status]');
  await page.goto('/?to=Budi');
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  expect(await paused()).toBe(false);

  await page.locator('[data-video-clip]').scrollIntoViewIfNeeded();
  await page.locator('[data-video-clip]').click();
  expect(await paused()).toBe(true);
  const frame = page.frameLocator('#gallery iframe').locator('body');
  const report = (state: number) => frame.evaluate((_, info) => parent.postMessage(JSON.stringify({ event: 'onStateChange', info }), '*'), state);
  await report(1);
  await report(2); // guest paused the clip
  await expect.poll(paused).toBe(false);

  // Played again from inside the player: the phone pauses the music before YouTube reports.
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.pause());
  await report(1);
  await report(0); // clip ended
  await expect.poll(paused).toBe(false);

  // The browser refuses the automatic resume: the next tap anywhere continues the music.
  await report(1);
  await page.evaluate(() => { (window as unknown as { rejectNextPlay: boolean }).rejectNextPlay = true; });
  await report(2);
  await expect(status).toHaveText('Ketuk layar untuk memutar musik.');
  expect(await paused()).toBe(true);
  await page.locator('#gallery-heading').click();
  await expect.poll(paused).toBe(false);
  await expect(status).toHaveText('');

  // Turned off by the guest: the clip no longer brings it back.
  await page.locator('#wishes').scrollIntoViewIfNeeded();
  await page.locator('[data-music-toggle]').click();
  expect(await paused()).toBe(true);
  await report(1);
  await report(2);
  await page.waitForTimeout(300);
  expect(await paused()).toBe(true);
});

test('the soundtrack file is served and plays as audio', async ({ page, browserName }) => {
  const response = await page.request.get('/audio/music.mp3');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('audio/mpeg');
  // Chromium in Playwright lacks proprietary codecs; WebKit decodes MP3 like real browsers.
  test.skip(browserName === 'chromium', 'MP3 decoding is checked in WebKit');
  await page.goto('/');
  const duration = await page.locator('audio').evaluate((audio: HTMLAudioElement) => new Promise<number>((resolve, reject) => {
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
    audio.addEventListener('error', () => reject(new Error('audio error')), { once: true });
    audio.load();
  }));
  expect(duration).toBeGreaterThan(110);
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
  const toggle = page.getByRole('button', { name: 'Buka menu' });
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('access card shows a QR only for a well-formed personal code', async ({ page }) => {
  await page.goto(`/?to=Budi&k=${CODE}`);
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  const card = page.getByRole('dialog', { name: 'Vian & Ghea' });
  await expect(card.getByRole('img', { name: 'Kode QR akses masuk' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Simpan Kartu' })).toBeVisible();
  await card.getByRole('button', { name: 'Tutup kartu akses' }).click();
  // Keyboard users: the card reopens from the QR button and focus returns there on Escape.
  const qrButton = page.getByRole('button', { name: 'Kartu akses masuk', exact: true });
  await qrButton.focus();
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(qrButton).toBeFocused();
  await page.getByRole('button', { name: 'Kartu akses masuk', exact: true }).click();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');

  // Closed by accident: the menu has a labelled item that reopens it and then closes the menu.
  const menuToggle = page.getByRole('button', { name: 'Buka menu' });
  await menuToggle.click();
  await page.getByRole('button', { name: 'Kartu Akses Masuk (QR)' }).click();
  await expect(card).toBeVisible();
  await expect(page.locator('[data-menu]')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(menuToggle).toBeFocused();

  // A malformed or missing code: no card, no QR buttons, and no RSVP or Wedding Gift (nothing
  // from ?k= is rendered as markup). The rest of the invitation, including Ucapan, stays.
  for (const query of ['?to=Budi&k=%3Cimg%20src%3Dx%3E', '?to=Budi']) {
    await page.goto(`/${query}`);
    await page.getByRole('link', { name: 'Buka Undangan' }).click();
    await expect(page.locator('main')).toBeVisible();
    await expect(card).toBeHidden();
    await expect(page.getByRole('button', { name: 'Kartu akses masuk', exact: true })).toBeHidden();
    for (const id of ['#rsvp', '#gift']) await expect(page.locator(id)).toBeHidden();
    await expect(page.locator('#wishes')).toBeVisible();
    await page.getByRole('button', { name: 'Buka menu' }).click();
    const menu = page.locator('[data-menu]');
    await expect(menu.getByRole('link', { name: 'Ucapan' })).toBeVisible();
    for (const name of ['RSVP', 'Hadiah']) await expect(menu.getByRole('link', { name })).toBeHidden();
    await expect(menu.getByRole('button', { name: 'Kartu Akses Masuk (QR)' })).toBeHidden();
    expect(await page.locator('img[src*="%3C"], img[src="x"]').count()).toBe(0);
  }
});

test('video clip loads YouTube only after the guest presses play, without leaking the guest link', async ({ page }) => {
  const youtube: string[] = [];
  page.on('request', (request) => { if (/youtube|ytimg|googlevideo/.test(request.url())) youtube.push(request.url()); });
  // Keep the test offline: answer the embed request locally.
  await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }));
  await page.goto(`/?to=Budi&k=${CODE}#gallery`);
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
  const side = page.locator('[data-side-controls]');
  await expect(side).toBeVisible();
  await page.locator('[data-video-clip]').scrollIntoViewIfNeeded();
  await expect(side).toBeHidden();
  await page.locator('#wishes').scrollIntoViewIfNeeded();
  await expect(side).toBeVisible();
});

test('album keeps its order in justified rows, and the viewer follows the order', async ({ page }) => {
  const order = async () => page.locator('[data-gallery-item]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  await page.goto('/?to=Budi');
  const first = await order();
  await page.reload();
  expect(await order()).toEqual(first); // no shuffle
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.locator('#gallery').scrollIntoViewIfNeeded();
  // Every row is one height and fills the grid's width (the last row may be shorter).
  const rows = await page.locator('[data-gallery]').evaluate((grid) => {
    const width = grid.getBoundingClientRect().width;
    const byTop = new Map<number, DOMRect[]>();
    for (const li of grid.querySelectorAll('li:not(.break):not(.spare)')) {
      const box = li.getBoundingClientRect();
      byTop.set(Math.round(box.top), [...(byTop.get(Math.round(box.top)) ?? []), box]);
    }
    return [...byTop.values()].map((boxes) => ({
      heights: boxes.map((b) => Math.round(b.height)),
      span: Math.round(boxes.at(-1)!.right - boxes[0]!.left) / width,
    }));
  });
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows) expect(Math.max(...row.heights) - Math.min(...row.heights)).toBeLessThanOrEqual(1);
  for (const row of rows.slice(0, -1)) expect(row.span).toBeGreaterThan(0.99);
  const third = page.locator('[data-gallery-item]').nth(2);
  const href = await third.getAttribute('href');
  // Photos do not enlarge on hover.
  await third.hover();
  expect(await third.locator('img').evaluate((img) => getComputedStyle(img).transform)).toBe('none');
  await third.click();
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(/^3 \/ \d+$/);
  expect(await page.locator('[data-lightbox-image]').getAttribute('src')).toContain(href!);

  // The viewer is a slideshow only: no pinch/double-tap zoom, no trackpad (ctrl + wheel) zoom.
  const viewer = page.locator('[data-lightbox]');
  expect(await viewer.evaluate((dialog) => getComputedStyle(dialog).touchAction)).toBe('none');
  expect(await viewer.evaluate((dialog) => {
    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true });
    return dialog.querySelector('img')!.dispatchEvent(wheel);
  })).toBe(false);
  await page.getByRole('button', { name: 'Foto berikutnya' }).click();
  await expect(page.locator('[data-lightbox-counter]')).toHaveText(/^4 \/ \d+$/);
});

test('only Superbank is shown; the other accounts and their button are not', async ({ page }) => {
  await page.goto(`/?to=Budi&k=${CODE}`);
  await page.getByRole('link', { name: 'Buka Undangan' }).click();
  await page.keyboard.press('Escape'); // close the Entry Access Card
  const gift = page.locator('#gift');
  await gift.scrollIntoViewIfNeeded();
  await expect(gift.getByText('000001628502')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lihat rekening lainnya' })).toHaveCount(0);
  // Not just hidden: the other account numbers are not in the page at all.
  const html = await page.content();
  for (const value of ['1310015634357', '0700237524', '901279716707', '082237058889']) expect(html).not.toContain(value);
});

// Without JavaScript the personal-code check cannot run, so the gift section stays readable.
test('without JavaScript only Superbank is listed too', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/');
  const gift = page.locator('#gift');
  await expect(gift.getByText('000001628502')).toBeVisible();
  await expect(gift.getByText('0700237524')).toHaveCount(0);
  await expect(gift.getByText('1310015634357')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lihat rekening lainnya' })).toHaveCount(0);
  await context.close();
});
