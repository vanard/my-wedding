// Background music. `wanted` is the guest's choice: on after the opening tap (when music is
// chosen) or the music button, off only through the music button. Everything else (the video
// clip, leaving the page, the phone pausing the audio by itself) pauses the music for a while
// and never changes that choice, so the music comes back afterwards.
//
// Phones pause page audio on their own when another sound starts (the YouTube clip), often
// before the clip reports that it is playing. Checking "is the music playing?" at that moment
// would say no and the music would never return, so the choice is kept separately here.
export function initMusic() {
  const player = document.querySelector<HTMLElement>('[data-music-player]');
  const audio = document.querySelector<HTMLAudioElement>('[data-audio]');
  const button = document.querySelector<HTMLButtonElement>('[data-music-toggle]');
  const label = document.querySelector<HTMLElement>('[data-music-label]');
  const status = document.querySelector<HTMLElement>('[data-music-status]');
  if (!player || !audio || !button || !label || !status) return { open(_playMusic: boolean) {} };

  let wanted = false;
  let videoPlaying = false;
  let waitingForTap = false;

  const update = () => {
    const playing = !audio.paused;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Jeda musik' : 'Putar musik');
    label.textContent = playing ? 'Jeda musik' : 'Putar musik';
  };
  const play = () => {
    if (!audio.getAttribute('src')) return;
    status.textContent = '';
    // From a tap this runs synchronously inside it (iOS needs that for the first play).
    void audio.play().then(() => { waitingForTap = false; }, () => {
      if (audio.error) status.textContent = 'Musik tidak dapat dimuat. Coba lagi nanti.';
      else {
        // The browser refused a resume that was not inside a tap: continue on the next tap.
        waitingForTap = true;
        status.textContent = 'Ketuk layar untuk memutar musik.';
      }
      update();
    });
  };
  // Play if the guest wants music and nothing else needs the sound right now.
  const resume = () => { if (wanted && !videoPlaying && !document.hidden && audio.paused) play(); };

  audio.addEventListener('play', update);
  audio.addEventListener('pause', update);
  audio.addEventListener('error', () => { status.textContent = 'Musik tidak dapat dimuat. Coba lagi nanti.'; update(); });

  button.addEventListener('click', () => {
    waitingForTap = false;
    if (audio.paused) { wanted = true; play(); } else { wanted = false; audio.pause(); }
  });
  // A refused resume continues on the guest's next tap or key press anywhere (a real user
  // gesture, which browsers accept). Taps on the music button are left to the button.
  const onGesture = (event: Event) => {
    if (!waitingForTap || button.contains(event.target as Node)) return;
    waitingForTap = false;
    resume();
  };
  document.addEventListener('pointerup', onGesture, true);
  document.addEventListener('keydown', onGesture, true);

  // Leaving the page (another tab or app, screen off) pauses the music; coming back resumes it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else resume();
  });
  // The video clip started: pause the music rather than play over it.
  document.addEventListener('invitation:media-play', () => {
    videoPlaying = true;
    waitingForTap = false;
    audio.pause();
  });
  // The clip was paused or finished: continue the music if the guest wants it.
  document.addEventListener('invitation:media-stop', () => {
    videoPlaying = false;
    resume();
  });
  return { open(playMusic: boolean) { player.hidden = false; if (playMusic) { wanted = true; play(); } } };
}
