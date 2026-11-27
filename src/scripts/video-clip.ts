// Video clip in "Our Moment", hosted on YouTube. The page shows our own poster; the YouTube
// player is created only when the guest presses play, so nothing is requested from YouTube
// before that and the invitation loads as fast as before.
const ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';
// YouTube player states (see the IFrame Player API): ended, playing, paused.
const ENDED = 0, PLAYING = 1, PAUSED = 2;

// Follow the player's state through the IFrame API's postMessage channel, without loading
// YouTube's API script: playing pauses the background music, paused/ended lets it continue.
// If YouTube never answers, the music simply stays paused, as before.
function watchPlayer(player: HTMLIFrameElement) {
  let lastState: number | null = null;
  let answered = false;
  const send = (message: object) => player.contentWindow?.postMessage(JSON.stringify(message), PLAYER_ORIGIN);
  const listen = () => {
    send({ event: 'listening', id: 'video-clip', channel: 'widget' });
    send({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'video-clip', channel: 'widget' });
  };
  const onState = (state: number) => {
    if (state === lastState) return;
    lastState = state;
    if (state === PLAYING) document.dispatchEvent(new Event('invitation:media-play'));
    else if (state === PAUSED || state === ENDED) document.dispatchEvent(new Event('invitation:media-stop'));
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== PLAYER_ORIGIN || event.source !== player.contentWindow || typeof event.data !== 'string') return;
    let data: { event?: unknown; info?: unknown };
    try { data = JSON.parse(event.data); } catch { return; }
    answered = true;
    if (data.event === 'onStateChange' && typeof data.info === 'number') onState(data.info);
    else if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
      const state = (data.info as { playerState?: unknown }).playerState;
      if (typeof state === 'number') onState(state);
    }
  });
  // The player only reports to a page that has said it is listening; repeat until it answers.
  player.addEventListener('load', listen);
  let tries = 0;
  const timer = window.setInterval(() => {
    if (answered || ++tries > 120) { window.clearInterval(timer); return; }
    listen();
  }, 500);
}

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
    player.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    player.title = facade.dataset.title ?? 'Video';
    player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    player.allowFullscreen = true;
    // The site sends no referrer, but YouTube's player refuses to play without one (error 153).
    // This sends only the site's origin, never the path or the guest's ?to=/?k= query.
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    // Pressing play means sound is coming: pause the background music.
    document.dispatchEvent(new Event('invitation:media-play'));
    facade.replaceWith(player);
    watchPlayer(player);
    player.focus();
  });
}
