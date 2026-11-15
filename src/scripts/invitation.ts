import { initMusic } from './music';
import { initReveals } from './reveal';
import { initMenu } from './menu';
import { initCountdown } from './countdown';
import { initGallery } from './gallery';
import { initCopy } from './copy';
import { initGiftMore } from './gift-more';
import { initFullscreen } from './fullscreen';
import { initBackdrop } from './backdrop';
import { initAccessCard } from './access-card';
import { guestCode } from './guest-code';
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

  // Guest-only parts (RSVP, Wedding Gift, the Entry Access Card and its buttons, marked
  // data-personal) appear only for a link with a well-formed personal code: the same check
  // that lets the card show a QR. This tidies the page for visitors without a personal link;
  // it is not access control (the server checks the code, and the gift details stay in the HTML).
  // Without JavaScript nothing is hidden.
  const personal = guestCode() !== null;
  if (!personal) document.querySelectorAll<HTMLElement>('[data-personal]').forEach((element) => { element.hidden = true; });

  const music = initMusic();
  const startBackdrop = initBackdrop();
  const showAccessCard = initAccessCard();
  // The round QR button and the menu item both open the card. The menu closes when its item is
  // used, so focus then returns to the menu button instead of the hidden item.
  const menuToggle = document.querySelector<HTMLElement>('[data-menu-toggle]');
  document.querySelectorAll<HTMLElement>('[data-access-open]').forEach((button) => {
    const inMenu = button.closest('[data-menu]') !== null;
    button.addEventListener('click', () => showAccessCard(inMenu ? () => menuToggle?.focus() : undefined));
  });
  initCountdown();
  initGallery();
  initVideoClip();
  initGuestForms();
  initCopy();
  initGiftMore();

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
    if (personal) showAccessCard(() => main.focus({ preventScroll: true }));
  });
  document.querySelector('.skip-link')?.addEventListener('click', () => open(false, false));

  // Every visit starts at the cover (who is invited + "Buka Undangan"). Only a link to a
  // specific section such as #rsvp skips it, and never bypasses the music gesture rules.
  const section = document.getElementById(location.hash.slice(1));
  if (section && section !== main && main.contains(section) && !section.closest('[hidden]:not(main)')) {
    open(false, false);
    section.scrollIntoView();
  } else {
    if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);
    // Applied only after the opening handler is ready. Without JS all content stays readable.
    main.hidden = true;
  }
}
