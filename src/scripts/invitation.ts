import { initMusic } from './music';
import { initReveals } from './reveal';
import { initMenu } from './menu';
import { initCountdown } from './countdown';
import { initGallery } from './gallery';
import { initCopy } from './copy';
import { initFullscreen } from './fullscreen';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showToast() {
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  if (!toast) return;
  const close = () => { toast.hidden = true; };
  toast.querySelector('[data-toast-close]')?.addEventListener('click', close);
  window.setTimeout(() => { toast.hidden = false; }, reducedMotion() ? 0 : 900);
  window.setTimeout(close, 7000);
}

export function initInvitation() {
  const cover = document.querySelector<HTMLElement>('#cover');
  const main = document.querySelector<HTMLElement>('#invitation');
  const opener = document.querySelector<HTMLAnchorElement>('[data-open-invitation]');
  if (!cover || !main || !opener) return;

  // `?to=` is only a display greeting. textContent keeps it from being parsed as HTML.
  const guest = new URLSearchParams(window.location.search).get('to')?.trim().slice(0, 100);
  if (guest) document.querySelectorAll('[data-guest-name]').forEach((element) => { element.textContent = guest; });

  const music = initMusic();
  initCountdown();
  initGallery();
  initCopy();

  let opened = false;
  const open = (playMusic: boolean, animate: boolean) => {
    if (opened) return;
    opened = true;
    main.hidden = false;
    document.querySelectorAll<HTMLElement>('[data-menu-toggle], [data-side-controls]').forEach((element) => { element.hidden = false; });
    music.open(playMusic);
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
    showToast();
    history.replaceState(null, '', `${location.pathname}${location.search}#invitation`);
  });
  document.querySelector('.skip-link')?.addEventListener('click', () => open(false, false));

  // Direct section links work, but never bypass the browser's music gesture rules.
  const section = document.getElementById(location.hash.slice(1));
  if (section && (section === main || main.contains(section))) {
    open(false, false);
    section.scrollIntoView();
  } else {
    // Applied only after the opening handler is ready. Without JS all content stays readable.
    main.hidden = true;
  }
}
