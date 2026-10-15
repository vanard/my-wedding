/** Build-time date helpers. Every value is shown in the event's configured timezone. */
const locale = 'id-ID';

export function longDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));
}

/** Returns e.g. { dayMonth: '20/02', year: '2027' } for the split cover date. */
export function coverDate(iso: string, timeZone: string): { dayMonth: string; year: string } {
  const date = new Date(iso);
  const dayMonth = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone }).format(date);
  const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(date);
  return { dayMonth, year };
}

function time(iso: string, timeZone: string, withZone: boolean): string {
  const parts = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone, ...(withZone ? { timeZoneName: 'short' } : {}) }).formatToParts(new Date(iso));
  const clock = parts.filter((part) => part.type === 'hour' || part.type === 'minute').map((part) => part.value).join('.');
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value;
  return zone ? `${clock} ${zone}` : clock;
}

/** e.g. '08.00 – 10.00 WIB' */
export function timeRange(startsAt: string, endsAt: string, timeZone: string): string {
  return `${time(startsAt, timeZone, false)} – ${time(endsAt, timeZone, true)}`;
}

function calendarStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A Google Calendar template link; no third-party script is loaded. */
export function calendarUrl(event: { title: string; startsAt: string; endsAt: string; details: string; location: string }): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${calendarStamp(event.startsAt)}/${calendarStamp(event.endsAt)}`,
    details: event.details,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
