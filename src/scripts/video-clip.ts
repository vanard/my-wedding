// Video clip in "Our Moment", hosted on YouTube. The page shows our own poster; the YouTube
// player is created only when the guest presses play, so nothing is requested from YouTube
// before that and the invitation loads as fast as before.
const ID = /^[A-Za-z0-9_-]{11}$/;

export function initVideoClip() {
  const facade = document.querySelector<HTMLAnchorElement>('[data-video-clip]');
  const frame = facade?.parentElement;
  const id = facade?.dataset.youtubeId;
  if (!facade || !frame || !id || !ID.test(id)) return;

  // The floating buttons (menu, QR, fullscreen, music) sit over the right edge of the column,
  // where the player's own controls are. Hide them while the clip is on screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      document.documentElement.classList.toggle('clip-in-view', Boolean(entry?.isIntersecting));
    }, { threshold: 0.2 }).observe(frame);
  }

  facade.addEventListener('click', (event) => {
    event.preventDefault();
    const player = document.createElement('iframe');
    // youtube-nocookie: no YouTube cookies until the guest interacts with the player.
    player.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
    player.title = facade.dataset.title ?? 'Video';
    player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    player.allowFullscreen = true;
    // The site sends no referrer, but YouTube's player refuses to play without one (error 153).
    // This sends only the site's origin, never the path or the guest's ?to=/?k= query.
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    // Pressing play means sound is coming: pause the background music.
    document.dispatchEvent(new Event('invitation:media-play'));
    facade.replaceWith(player);
    player.focus();
  });
}
