// Replaces the poster link with a real <video> on the first press, so the clip (≈16 MB)
// downloads only for guests who choose to watch it. Playback starts inside that press.
export function initVideoClip() {
  const facade = document.querySelector<HTMLAnchorElement>('[data-video-clip]');
  const frame = facade?.parentElement;
  if (!facade || !frame) return;

  // The floating buttons (menu, QR, fullscreen, music) sit over the right edge of the column,
  // exactly where the player's own volume/fullscreen controls are. Hide them while the clip
  // is on screen so the whole video and its controls stay visible and clickable.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      document.documentElement.classList.toggle('clip-in-view', Boolean(entry?.isIntersecting));
    }, { threshold: 0.2 }).observe(frame);
  }
  facade.addEventListener('click', (event) => {
    event.preventDefault();
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.title = facade.dataset.title ?? '';
    video.poster = facade.querySelector('img')?.currentSrc ?? '';
    video.src = facade.href;
    video.addEventListener('play', () => document.dispatchEvent(new Event('invitation:media-play')));
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
    facade.replaceWith(video);
    video.focus();
    void video.play().catch(() => { /* Controls stay available; the guest can press play again. */ });
  });
}
