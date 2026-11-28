// Background video behind the invitation column: the whole teaser over a blurred copy of it.
// Both start once the page has loaded (after the cover and its photo), play before and after
// "Buka Undangan", and fade in over the poster photo when their first frames are ready.
// Skipped for reduced motion and Data Saver; the poster photo stays instead.
//
// A video is shown only while it is really playing. iOS pauses or freezes page videos on its
// own (a phone or FaceTime call, Low Power Mode, coming back from another app, memory
// pressure), and a paused or frozen video can paint black. So the videos fade out to the
// poster photo on pause, buffering or error, a watchdog catches a video whose time stops while
// it claims to play, and playback is retried when the guest returns to the page.
interface NetworkInformation { saveData?: boolean }

const FROZEN_AFTER = 3; // seconds without progress while "playing"
const hiddenOn = ['pause', 'waiting', 'emptied', 'error'] as const;

const interactions = ['pointerdown', 'touchstart', 'keydown', 'scroll'] as const;

function start(video: HTMLVideoElement) {
  if (!video.src) {
    const src = video.dataset.src;
    if (!src) return;
    video.addEventListener('playing', () => video.classList.add('is-playing'));
    hiddenOn.forEach((type) => video.addEventListener(type, () => video.classList.remove('is-playing')));
    video.preload = 'auto';
    video.src = src;
  }
  attempt(video);
}

function attempt(video: HTMLVideoElement) {
  if (!video.paused) return;
  // Muted autoplay can still be refused (early in page load, low-power mode). Keep the
  // poster photo and retry when data is ready, shortly after, or on the first interaction.
  video.play().catch(() => {
    const retry = () => {
      interactions.forEach((type) => window.removeEventListener(type, retry));
      if (video.paused) video.play().catch(() => {});
    };
    video.addEventListener('canplay', retry, { once: true });
    window.setTimeout(retry, 1500);
    interactions.forEach((type) => window.addEventListener(type, retry, { once: true, passive: true }));
  });
}

export function initBackdrop(): () => void {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('[data-backdrop-video]'));
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!videos.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches || connection?.saveData) return () => {};

  // The last video is the whole frame; any earlier one is its blurred fill. Keep the fill on
  // the same frame so the colours around the video always match it.
  const main = videos[videos.length - 1]!;
  const fills = videos.slice(0, -1);
  main.addEventListener('timeupdate', () => {
    for (const fill of fills) {
      if (!fill.paused && Math.abs(fill.currentTime - main.currentTime) > 0.3) fill.currentTime = main.currentTime;
    }
  });

  const begin = () => videos.forEach(start);
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });

  // Back on the page (another app, a call, the lock screen, back/forward cache): play again.
  // If the browser refuses (Low Power Mode), the poster photo simply stays.
  const resume = () => { if (!document.hidden) videos.forEach((video) => { if (video.src) attempt(video); }); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });

  // Frozen while "playing" (time stops, no pause event): fade to the poster and restart.
  let last = -1;
  let still = 0;
  window.setInterval(() => {
    if (document.hidden || !main.src || main.paused) { still = 0; last = -1; return; }
    still = main.currentTime === last ? still + 1 : 0;
    last = main.currentTime;
    if (still < FROZEN_AFTER) return;
    still = 0;
    for (const video of videos) {
      video.classList.remove('is-playing');
      video.pause();
      attempt(video);
    }
  }, 1000);
  return begin;
}
