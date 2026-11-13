// Background video behind the invitation column. It starts once the page has loaded
// (after the cover and its photo), plays before and after "Buka Undangan", and fades in
// over the poster photo when the first frames are ready. Skipped for reduced motion and
// Data Saver; the poster photo stays instead.
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
  const video = document.querySelector<HTMLVideoElement>('[data-backdrop-video]');
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches || connection?.saveData) return () => {};

  const begin = () => start(video);
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin, { once: true });
  return begin;
}
