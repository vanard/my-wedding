const pad = (value: number) => String(value).padStart(2, '0');

export function initCountdown() {
  const root = document.querySelector<HTMLElement>('[data-countdown]');
  const done = document.querySelector<HTMLElement>('[data-countdown-done]');
  const target = Date.parse(root?.dataset.startsAt ?? '');
  if (!root || !done || Number.isNaN(target)) return;

  const units = Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>('[data-unit]'), (element) => [element.dataset.unit, element]));
  let timer = 0;
  const tick = () => {
    const remaining = Math.floor((target - Date.now()) / 1000);
    if (remaining <= 0) {
      // Stop gracefully once the event starts instead of showing negative values.
      window.clearInterval(timer);
      root.hidden = true;
      done.hidden = false;
      return;
    }
    const values: Record<string, string> = {
      days: String(Math.floor(remaining / 86400)),
      hours: pad(Math.floor((remaining % 86400) / 3600)),
      minutes: pad(Math.floor((remaining % 3600) / 60)),
      seconds: pad(remaining % 60),
    };
    for (const [unit, value] of Object.entries(values)) {
      const element = units[unit];
      if (element && element.textContent !== value) element.textContent = value;
    }
    root.hidden = false;
  };
  tick();
  timer = window.setInterval(tick, 1000);
}
