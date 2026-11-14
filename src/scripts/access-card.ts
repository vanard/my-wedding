// Entry Access Card. The QR encodes a link to the staff check-in page carrying the guest's
// personal code from `?k=`. The code is only a lookup key: the check-in endpoint verifies
// its hash on the server, and staff must be signed in. `?to=` stays a display greeting.
import type { QrCodeGenerateResult } from 'uqr';

const CODE = /^[A-Za-z0-9_-]{32,64}$/;
const BODY_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DISPLAY_FONT = '"Cormorant Garamond", Garamond, Georgia, serif';

export function guestCode(): string | null {
  const code = new URLSearchParams(window.location.search).get('k');
  return code && CODE.test(code) ? code : null;
}

/** The check-in link. The code goes in the fragment, so it is never sent in a request line. */
export function checkInUrl(code: string): string {
  return `${window.location.origin}/checkin/#${code}`;
}

function qrSvg(qr: QrCodeGenerateResult): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${qr.size} ${qr.size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Kode QR akses masuk');
  let d = '';
  qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#1f1f1e');
  svg.append(path);
  return svg;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Centered text with letter spacing (canvas letterSpacing is not universally supported). */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const width = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let x = cx - width / 2;
  ctx.textAlign = 'left';
  for (const ch of chars) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
  ctx.textAlign = 'center';
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, size: number, maxWidth: number): void {
  let px = size;
  do { ctx.font = `500 ${px}px ${family}`; px -= 4; } while (px > 28 && ctx.measureText(text).width > maxWidth);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, lineHeight: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { ctx.fillText(line, cx, y); y += lineHeight; line = word; } else line = next;
  }
  if (line) ctx.fillText(line, cx, y);
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  try { await image.decode(); return image; } catch { return null; }
}

async function renderCard(dialog: HTMLElement, qr: QrCodeGenerateResult, guest: string): Promise<Blob> {
  const W = 1080, H = 1620, cx = W / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  await Promise.all([document.fonts.load(`500 96px ${DISPLAY_FONT}`, 'Vian & Ghea 0123456789'), document.fonts.ready]);

  ctx.fillStyle = '#1f1f1e';
  ctx.fillRect(0, 0, W, H);
  // The same photo as the page background, cropped to fill.
  const photo = await loadImage(document.querySelector<HTMLImageElement>('.backdrop img')?.currentSrc ?? '');
  if (photo) {
    const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
    const w = photo.naturalWidth * scale, h = photo.naturalHeight * scale;
    ctx.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
  }
  ctx.fillStyle = 'rgba(18, 18, 17, 0.74)';
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 56, 56, W - 112, H - 112, 28);
  ctx.strokeStyle = 'rgba(244, 240, 232, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const ink = '#f4f0e8', muted = '#cfc8bc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = `600 26px ${BODY_FONT}`;
  spaced(ctx, 'ENTRY ACCESS CARD', cx, 190, 9);
  fitFont(ctx, dialog.dataset.couple ?? '', DISPLAY_FONT, 120, W - 220);
  ctx.fillText(dialog.dataset.couple ?? '', cx, 330);
  ctx.font = `700 36px ${BODY_FONT}`;
  ctx.fillText(dialog.dataset.venue ?? '', cx, 410);
  ctx.fillStyle = muted;
  ctx.font = `32px ${BODY_FONT}`;
  ctx.fillText(dialog.dataset.date ?? '', cx, 465);
  ctx.fillText(dialog.dataset.time ?? '', cx, 510);

  const box = 500, bx = cx - box / 2, by = 570, pad = 34;
  roundRect(ctx, bx, by, box, box, 22);
  ctx.fillStyle = '#fbf9f5';
  ctx.fill();
  const cell = (box - pad * 2) / qr.size;
  ctx.fillStyle = '#1f1f1e';
  qr.data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) ctx.fillRect(bx + pad + x * cell, by + pad + y * cell, Math.ceil(cell), Math.ceil(cell));
  }));

  ctx.fillStyle = ink;
  ctx.font = `600 24px ${BODY_FONT}`;
  spaced(ctx, 'KEPADA YTH.', cx, 1150, 8);
  ctx.font = `30px ${BODY_FONT}`;
  ctx.fillText('Bapak/Ibu/Saudara/i', cx, 1198);
  fitFont(ctx, guest, DISPLAY_FONT, 72, W - 220);
  ctx.fillText(guest, cx, 1290);
  ctx.fillStyle = muted;
  ctx.font = `italic 28px ${BODY_FONT}`;
  wrap(ctx, 'Tunjukkan kode QR ini kepada penerima tamu di lokasi acara.', cx, 1390, W - 260, 40);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), 'image/jpeg', 0.92));
}

async function save(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], `kartu-akses-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tamu'}.jpg`, { type: 'image/jpeg' });
  // Phones: the share sheet offers "Save Image" to the photo library.
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (window.matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kartu Akses' }); return; } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Wires the card; returns a function that opens it. */
export function initAccessCard(): (onClose?: () => void) => void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-access-card]');
  if (!dialog || typeof dialog.showModal !== 'function') return () => {};
  const box = dialog.querySelector<HTMLElement>('[data-access-qr]');
  const download = dialog.querySelector<HTMLButtonElement>('[data-access-download]');
  const status = dialog.querySelector<HTMLElement>('[data-access-status]');
  const code = guestCode();
  let qr: QrCodeGenerateResult | null = null;
  let afterClose: (() => void) | undefined;
  let opener: HTMLElement | null = null;

  const prepare = async () => {
    if (!code || qr || !box) return;
    try {
      const { encode } = await import('uqr');
      qr = encode(checkInUrl(code), { ecc: 'M', border: 0 });
      box.replaceChildren(qrSvg(qr));
      dialog.querySelector<HTMLElement>('[data-access-note]')!.hidden = false;
      if (download) download.hidden = false;
    } catch {
      if (status) status.textContent = 'Kode QR gagal dimuat. Muat ulang halaman untuk mencoba lagi.';
    }
  };

  download?.addEventListener('click', async () => {
    if (!qr || download.disabled) return;
    download.disabled = true;
    if (status) status.textContent = 'Menyiapkan kartu…';
    const guest = dialog.querySelector('[data-guest-name]')?.textContent?.trim() || 'Tamu Undangan';
    try {
      await save(await renderCard(dialog, qr, guest), guest);
      if (status) status.textContent = '';
    } catch {
      if (status) status.textContent = 'Kartu gagal disimpan. Silakan ambil tangkapan layar.';
    } finally {
      download.disabled = false;
    }
  });
  dialog.querySelector('[data-access-close]')?.addEventListener('click', () => dialog.close());
  // Tapping the dimmed area outside the card closes it.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  // Return focus explicitly (WebKit does not always restore it to the button that opened the card).
  dialog.addEventListener('close', () => {
    if (afterClose) afterClose(); else opener?.focus();
    afterClose = undefined;
  });

  return (onClose) => {
    afterClose = onClose;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void prepare();
    if (!dialog.open) dialog.showModal();
  };
}
