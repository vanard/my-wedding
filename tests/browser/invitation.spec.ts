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
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('[data-music-player]')).toBeVisible();
  await expect(page.locator('[data-music-toggle]')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kirim konfirmasi' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kirim ucapan' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
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
  const toggle = page.getByRole('button', { name: 'Buka menu' });
  await toggle.click();
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navigasi undangan' })).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
