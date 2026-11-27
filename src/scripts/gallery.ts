export function initGallery() {
  const dialog = document.querySelector<HTMLDialogElement>('[data-lightbox]');
  const image = dialog?.querySelector<HTMLImageElement>('[data-lightbox-image]');
  const counter = dialog?.querySelector<HTMLElement>('[data-lightbox-counter]');
  const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-gallery-item]'));
  // Without <dialog> support the links simply open the full-size photo.
  if (!dialog || !image || !counter || !links().length || typeof dialog.showModal !== 'function') return;

  let index = 0;
  let opener: HTMLElement | null = null;
  const show = (next: number) => {
    const items = links();
    index = (next + items.length) % items.length;
    const item = items[index];
    if (!item) return;
    image.src = item.href;
    image.alt = item.dataset.alt ?? '';
    counter.textContent = `${index + 1} / ${items.length}`;
  };

  links().forEach((item) => item.addEventListener('click', (event) => {
    event.preventDefault();
    opener = item;
    show(links().indexOf(item));
    dialog.showModal();
  }));
  dialog.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-lightbox-next]')?.addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-lightbox-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  // Tapping the dark area outside the photo closes the viewer.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus(); });

  // No zooming photos in the viewer. `touch-action: none` (Gallery.astro) covers touch
  // screens; these cover Safari's pinch gestures and trackpad pinch (ctrl + wheel).
  const noZoom = (event: Event) => event.preventDefault();
  dialog.addEventListener('gesturestart', noZoom);
  dialog.addEventListener('gesturechange', noZoom);
  dialog.addEventListener('wheel', (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });

  let startX: number | null = null;
  dialog.addEventListener('touchstart', (event) => { startX = event.touches[0]?.clientX ?? null; }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    const endX = event.changedTouches[0]?.clientX;
    if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 50) show(index + (endX < startX ? 1 : -1));
    startX = null;
  });
}
