export function initMenu() {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (!toggle || !menu) return;

  const setOpen = (open: boolean, restoreFocus = false) => {
    menu.hidden = !open;
    toggle.hidden = open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLElement>('[data-menu-link]')?.focus();
    else if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(true));
  menu.querySelector('[data-menu-close]')?.addEventListener('click', () => setOpen(false, true));
  menu.querySelectorAll('[data-menu-link]').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) setOpen(false, true); });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
}
