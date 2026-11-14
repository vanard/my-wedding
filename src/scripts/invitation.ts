import { initMusic } from './music';
import { initReveals } from './reveal';
import { initMenu } from './menu';
import { initCountdown } from './countdown';
import { initGallery } from './gallery';
import { initCopy } from './copy';
import { initFullscreen } from './fullscreen';
import { initBackdrop } from './backdrop';
import { initAccessCard } from './access-card';
import { initVideoClip } from './video-clip';
import { initGuestForms } from './guest-forms';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initInvitation() {
  const cover = document.querySelector<HTMLElement>('#cover');
  const main = document.querySelector<HTMLElement>('#invitation');
  const opener = document.querySelector<HTMLAnchorElement>('[data-open-invitation]');
  if (!cover || !main || !opener) return;

  // `?to=` is only a display greeting. textContent keeps it from being parsed as HTML.
  const guest = new URLSearchParams(window.location.search).get('to')?.trim().slice(0, 100);
  if (guest) document.querySelectorAll('[data-guest-name]').forEach((element) => { element.textContent = guest; });

  const music = initMusic();
  const startBackdrop = initBackdrop();
  const showAccessCard = initAccessCard();
  document.querySelector('[data-access-open]')?.addEventListener('click', () => showAccessCard());
  initCountdown();
  initGallery();
  initVideoClip();
  initGuestForms();
  initCopy();

  let opened = false;
  const open = (playMusic: boolean, animate: boolean) => {
    if (opened) return;
    opened = true;
    main.hidden = false;
    document.querySelectorAll<HTMLElement>('[data-menu-toggle], [data-side-controls]').forEach((element) => { element.hidden = false; });
    music.open(playMusic);
    startBackdrop();
    initMenu();
    initFullscreen();
    main.focus({ preventScroll: true });
    initReveals();
    if (animate && !reducedMotion()) {
      cover.classList.add('is-leaving');
      // Visibility is restored by `hidden`; the transition is purely decorative.
      window.setTimeout(() => { cover.hidden = true; cover.classList.remove('is-leaving'); }, 900);
    } else {
      cover.hidden = true;
    }
  };

  opener.addEventListener('click', (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: 'auto' });
    open(true, true);
    // Instead of a greeting pop-up, show the guest's Entry Access Card; closing it returns to the invitation.
    showAccessCard(() => main.focus({ preventScroll: true }));
  });
  document.querySelector('.skip-link')?.addEventListener('click', () => open(false, false));

  // Every visit starts at the cover (who is invited + "Buka Undangan"). Only a link to a
  // specific section such as #rsvp skips it, and never bypasses the music gesture rules.
  const section = document.getElementById(location.hash.slice(1));
  if (section && section !== main && main.contains(section)) {
    open(false, false);
    section.scrollIntoView();
  } else {
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
    // Applied only after the opening handler is ready. Without JS all content stays readable.
    main.hidden = true;
  }
}
