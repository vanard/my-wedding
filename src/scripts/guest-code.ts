// The guest's personal code from `?k=` in their invitation link. It authorizes their own RSVP,
// wishes and Entry Access Card; the server checks it against a hash. `?to=` is only a greeting.
const CODE = /^[A-Za-z0-9_-]{32,64}$/;

export function guestCode(): string | null {
  const code = new URLSearchParams(window.location.search).get('k');
  return code && CODE.test(code) ? code : null;
}
