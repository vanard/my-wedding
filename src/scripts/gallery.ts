function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Pairs of photos from the same moment (data-moment, set from `gallery.moments`) that touch on
 * screen: one directly above the other, or side by side (overlapping by more than a fifth of
 * the shorter photo, so diagonal corners do not count). Measured, because browsers balance CSS
 * columns slightly differently.
 */
function clashes(tiles: HTMLElement[]): HTMLElement[] {
  const boxes = tiles.map((el) => ({ el, moment: el.dataset.moment, box: el.getBoundingClientRect() }));
  const found = new Set<HTMLElement>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      if (a.moment === undefined || a.moment !== b.moment) continue;
      const sameColumn = Math.abs(a.box.left - b.box.left) < 5;
      const gap = Math.max(a.box.top, b.box.top) - Math.min(a.box.bottom, b.box.bottom);
      const overlap = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (sameColumn ? gap < 20 : overlap > 0.2 * Math.min(a.box.height, b.box.height)) { found.add(a.el); found.add(b.el); }
    }
  }
  return [...found];
}

function swap(a: Element, b: Element) {
  const marker = document.createComment('');
  a.replaceWith(marker);
  b.replaceWith(a);
  marker.replaceWith(b);
}

function renumber(grid: HTMLElement) {
  Array.from(grid.children).forEach((tile, index) => {
    const label = tile.querySelector('.sr-only');
    if (label) label.textContent = `Perbesar foto ${index + 1}`;
  });
}

/**
 * New random order on every visit. Once the gallery has a size (it is hidden until the
 * invitation opens), photos from the same moment that ended up touching are swapped with
 * other photos until none touch. This happens long before a guest scrolls to the gallery.
 */
function shuffleAlbum(grid: HTMLElement) {
  const tiles = Array.from(grid.children) as HTMLElement[];
  if (tiles.length < 3) return;
  grid.append(...shuffled(tiles));
  renumber(grid);

  const separate = () => {
    if (!grid.offsetWidth) return;
    for (let step = 0; step < 120; step++) {
      const current = Array.from(grid.children) as HTMLElement[];
      const bad = clashes(current);
      if (!bad.length) break;
      const tile = bad[Math.floor(Math.random() * bad.length)]!;
      const others = current.filter((other) => other !== tile && other.dataset.moment !== tile.dataset.moment);
      const other = others[Math.floor(Math.random() * others.length)];
      if (!other) break;
      swap(tile, other);
      // Keep the swap only if it did not make things worse.
      if (clashes(Array.from(grid.children) as HTMLElement[]).length > bad.length) swap(tile, other);
    }
    renumber(grid);
  };
  let width = 0;
  if ('ResizeObserver' in window) {
    // Rearrange in the next frame, not inside the observer callback (avoids a ResizeObserver loop).
    new ResizeObserver(() => {
      if (!grid.offsetWidth || grid.offsetWidth === width) return;
      width = grid.offsetWidth;
      requestAnimationFrame(separate);
    }).observe(grid);
  }
}

export function initGallery() {
  const grid = document.querySelector<HTMLElement>('[data-gallery]');
  if (grid) shuffleAlbum(grid);
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
