// Background video behind the invitation column: the whole teaser over a blurred copy of it.
// Both start once the page has loaded (after the cover and its photo), play before and after
// "Buka Undangan", and fade in over the poster photo when their first frames are ready.
// Skipped for reduced motion and Data Saver; the poster photo stays instead.
interface NetworkInformation { saveData?: boolean }

const interactions = ['pointerdown', 'touchstart', 'keydown', 'scroll'] as const;

function start(video: HTMLVideoElement) {
  if (!video.src) {
    const src = video.dataset.src;
    if (!src) return;
    video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
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
  return begin;
}
