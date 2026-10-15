export function initCopy() {
  const status = document.querySelector<HTMLElement>('[data-copy-status]');
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
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
