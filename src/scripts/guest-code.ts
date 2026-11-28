// The guest's personal code from their invitation link. It authorizes their own RSVP, wishes
// and Entry Access Card; the server checks it against a hash. Two link shapes work:
//   /i/<name>-<code>     short link, e.g. /i/Riswanda-x7k2p9q4mb (10-character code)
//   /?to=<name>&k=<code> the first links sent (43-character code)
// The name part (and `?to=`) is only the greeting on the cover, never proof of anything.
const CODE = /^(?:[A-Za-z0-9_-]{32,64}|[a-z0-9]{10})$/;
const SHORT_LINK = /^\/i\/(?:([A-Za-z0-9._-]{1,80})-)?([a-z0-9]{10})\/?$/;

const shortLink = () => SHORT_LINK.exec(window.location.pathname);

export function guestCode(): string | null {
  const code = new URLSearchParams(window.location.search).get('k') ?? shortLink()?.[2] ?? null;
  return code && CODE.test(code) ? code : null;
}

/**
 * The greeting: `?to=`, or the name part of a short link, where "-" is a space and "_" a comma
 * (Dwi-Asti-Febrianti_SKM._M.AK. reads "Dwi Asti Febrianti, SKM., M.AK.").
 */
export function guestGreeting(): string | null {
  const to = new URLSearchParams(window.location.search).get('to')?.trim().replace(/\s+/g, ' ');
  const name = to || shortLink()?.[1]?.replace(/_+/g, ', ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, 100) : null;
}

/** On a group link that lists its members: the name this phone answered for. */
export interface ChosenMember { id: string; name: string }
const MEMBER = 'wedding-group-member';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stored with the start of the link's code (not the whole code), so another invitation opened
// on the same phone does not reuse it.
const owner = (code: string) => code.slice(0, 12);

export function chosenMember(code: string): ChosenMember | null {
  try {
    const stored = JSON.parse(localStorage.getItem(MEMBER) ?? 'null') as { owner?: string; id?: string; name?: string } | null;
    if (stored?.owner === owner(code) && typeof stored.id === 'string' && UUID.test(stored.id) && typeof stored.name === 'string') {
      return { id: stored.id, name: stored.name };
    }
  } catch { /* nothing usable stored */ }
  return null;
}

/** Remembers the member and tells the Entry Access Card to put them in its QR. */
export function rememberMember(code: string, member: ChosenMember | null): void {
  try {
    if (member) localStorage.setItem(MEMBER, JSON.stringify({ owner: owner(code), ...member }));
    else localStorage.removeItem(MEMBER);
  } catch { /* the card falls back to the group QR */ }
  document.dispatchEvent(new CustomEvent('invitation:member-chosen'));
}
