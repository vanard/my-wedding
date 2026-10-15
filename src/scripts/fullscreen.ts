type LegacyDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type LegacyElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export function initFullscreen() {
  const button = document.querySelector<HTMLButtonElement>('[data-fullscreen]');
  const label = document.querySelector<HTMLElement>('[data-fullscreen-label]');
  const doc = document as LegacyDocument;
  const root = document.documentElement as LegacyElement;
  // iPhone Safari has no page fullscreen API; the button stays hidden there.
  if (!button || !label || !(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) return;

  const active = () => Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  const update = () => {
    button.setAttribute('aria-pressed', String(active()));
    label.textContent = active() ? 'Keluar layar penuh' : 'Layar penuh';
  };
  button.hidden = false;
  button.addEventListener('click', () => {
    if (active()) {
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {}); else doc.webkitExitFullscreen?.();
    } else if (root.requestFullscreen) {
      void root.requestFullscreen().catch(() => {});
    } else {
      root.webkitRequestFullscreen?.();
    }
  });
  document.addEventListener('fullscreenchange', update);
  document.addEventListener('webkitfullscreenchange', update);
}
