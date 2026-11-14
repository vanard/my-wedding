// "Lihat rekening lainnya": moves the extra gift accounts into a pop-up.
// Without <dialog> support the list stays visible in the page and the button stays hidden.
export function initGiftMore() {
  const more = document.querySelector<HTMLElement>('[data-gift-more]');
  const list = more?.querySelector<HTMLElement>('[data-gift-more-list]');
  const open = document.querySelector<HTMLButtonElement>('[data-gift-more-open]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-gift-dialog]');
  const body = dialog?.querySelector<HTMLElement>('[data-gift-dialog-body]');
  if (!more || !list || !open || !dialog || !body || typeof dialog.showModal !== 'function') return;

  body.append(list);
  more.hidden = true;
  open.hidden = false;

  open.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
  dialog.querySelector('[data-gift-close]')?.addEventListener('click', () => dialog.close());
  // Tapping the dimmed area outside the card closes it.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    dialog.querySelector<HTMLElement>('[data-copy-status]')?.replaceChildren();
    // WebKit does not always restore focus to the opener.
    open.focus();
  });
}
