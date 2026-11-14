// Copy buttons report in the nearest status line: the pop-up's own, or the section's.
export function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const status = button.closest('dialog, section')?.querySelector<HTMLElement>('[data-copy-status]');
    const value = button.dataset.copy ?? '';
    const label = button.dataset.copyLabel ?? 'Teks';
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (status) status.textContent = `${label} berhasil disalin.`;
    } catch {
      if (status) status.textContent = `Tidak dapat menyalin otomatis. Silakan salin manual: ${value}`;
    }
  }));
}
