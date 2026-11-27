export function initMusic() {
  const player = document.querySelector<HTMLElement>('[data-music-player]');
  const audio = document.querySelector<HTMLAudioElement>('[data-audio]');
  const button = document.querySelector<HTMLButtonElement>('[data-music-toggle]');
  const label = document.querySelector<HTMLElement>('[data-music-label]');
  const status = document.querySelector<HTMLElement>('[data-music-status]');
  if (!player || !audio || !button || !label || !status) return { open(_playMusic: boolean) {} };

  const update = () => {
    const playing = !audio.paused;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Jeda musik' : 'Putar musik');
    label.textContent = playing ? 'Jeda musik' : 'Putar musik';
  };
  const play = () => {
    if (!audio.getAttribute('src')) return;
    status.textContent = '';
    // Called synchronously from the user's click to preserve iOS activation.
    void audio.play().catch(() => {
      status.textContent = audio.error ? 'Musik tidak dapat dimuat. Coba lagi nanti.' : 'Ketuk tombol untuk memutar musik.';
      update();
    });
  };
  audio.addEventListener('play', update);
  audio.addEventListener('pause', update);
  audio.addEventListener('error', () => { status.textContent = 'Musik tidak dapat dimuat. Coba lagi nanti.'; update(); });
  // True while the video clip has paused music that was playing; the music continues when the
  // clip is paused or ends. A tap on the music button overrides this either way.
  let resumeAfterMedia = false;
  button.addEventListener('click', () => { resumeAfterMedia = false; if (audio.paused) play(); else audio.pause(); });
  // Leaving the page (another tab or app, screen off) pauses the music; coming back resumes it,
  // but only if it was playing when the guest left (not after they paused it themselves).
  // The first play came from the opening tap, so browsers allow this resume; if one refuses,
  // the status asks for a tap.
  let resumeWhenVisible = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeWhenVisible = !audio.paused;
      audio.pause();
    } else if (resumeWhenVisible) {
      resumeWhenVisible = false;
      play();
    }
  });
  // Another sound source (the video clip) started: pause the music rather than play over it.
  document.addEventListener('invitation:media-play', () => {
    if (!audio.paused) resumeAfterMedia = true;
    resumeWhenVisible = false;
    audio.pause();
  });
  // The clip was paused or finished: continue the music if the clip is what paused it.
  // This play() is not inside a tap, but the audio was already started by one, so browsers
  // allow it; if one refuses, the status asks for a tap.
  document.addEventListener('invitation:media-stop', () => {
    if (!resumeAfterMedia) return;
    resumeAfterMedia = false;
    if (document.hidden) resumeWhenVisible = true;
    else play();
  });
  return { open(playMusic: boolean) { player.hidden = false; if (playMusic) play(); } };
}
