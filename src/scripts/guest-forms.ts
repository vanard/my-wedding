// RSVP and wishes. Nothing is requested until the guest scrolls near these sections, so most
// of the invitation never waits for (or depends on) the database.
// - Personal link (?k=<code>): loads the party once, enables both forms.
// - Group link (also ?k=, marked as a group in the database): each person adds their own name
//   and head count. This browser keeps a random respondent key, so it updates its own answer
//   and retries never add a second one; other people's answers add up instead of replacing it.
// - Without a code: forms stay disabled with a note; approved wishes are still listed.
import { guestCode } from './guest-code';
import type { Party, PublicWish as Wish, Rsvp, WishesPage } from '../lib/contracts';

const OFFLINE = 'Koneksi terputus. Periksa internet Anda lalu coba lagi.';
const FAILED = 'Terjadi kesalahan. Silakan coba lagi beberapa saat lagi.';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  } catch {
    throw new Error(OFFLINE);
  }
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? FAILED);
  return body as T;
}

/** Runs `callback` once, when `element` comes within about a screen of the viewport. */
function whenNear(element: Element, callback: () => void) {
  if (!('IntersectionObserver' in window)) { callback(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); callback(); }
  }, { rootMargin: '800px 0px' });
  observer.observe(element);
}

const RESPONDENT = 'wedding-rsvp-respondent';

/** This browser's key for its own group answer; kept for the page only if storage is blocked. */
function respondentKey(): string {
  try {
    const stored = localStorage.getItem(RESPONDENT);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
    const created = uuid();
    localStorage.setItem(RESPONDENT, created);
    return created;
  } catch {
    return uuid();
  }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function initGuestForms() {
  const code = guestCode();
  const auth = code ? { Authorization: `Bearer ${code}` } : null;
  const respondent = code ? respondentKey() : '';
  const rsvpForm = document.querySelector<HTMLFormElement>('[data-rsvp-form]');
  const wishForm = document.querySelector<HTMLFormElement>('[data-wishes-form]');

  // The party is loaded at most once and shared by both forms.
  let partyRequest: Promise<Party> | null = null;
  const loadParty = () => {
    partyRequest ??= request<{ party: Party }>('/api/guest', { headers: { ...auth, 'X-Respondent-Key': respondent } }).then(({ party }) => party);
    partyRequest.catch(() => { partyRequest = null; });
    return partyRequest;
  };

  if (rsvpForm) initRsvp(rsvpForm, auth, respondent, loadParty);
  if (wishForm) initWishForm(wishForm, auth, loadParty);
  const wishes = document.querySelector<HTMLElement>('#wishes');
  if (wishes) initWishList(wishes);
}

function initRsvp(form: HTMLFormElement, auth: Record<string, string> | null, respondent: string, loadParty: () => Promise<Party>) {
  const note = form.querySelector<HTMLElement>('[data-rsvp-note]')!;
  const fields = form.querySelector<HTMLFieldSetElement>('[data-rsvp-fields]')!;
  const partyBox = form.querySelector<HTMLElement>('[data-rsvp-party]')!;
  const partyLabel = form.querySelector<HTMLElement>('[data-rsvp-party-label]')!;
  const partyName = form.querySelector<HTMLElement>('[data-rsvp-party-name]')!;
  const groupNote = form.querySelector<HTMLElement>('[data-rsvp-group-note]')!;
  const nameField = form.querySelector<HTMLElement>('[data-rsvp-name-field]')!;
  const nameInput = form.querySelector<HTMLInputElement>('#rsvp-name')!;
  const count = form.querySelector<HTMLSelectElement>('[data-rsvp-count]')!;
  const countField = form.querySelector<HTMLElement>('[data-rsvp-count-field]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-rsvp-submit]')!;
  const retry = form.querySelector<HTMLButtonElement>('[data-rsvp-retry]')!;
  const status = form.querySelector<HTMLElement>('[data-rsvp-status]')!;
  if (!auth) return;

  const attendance = () => form.querySelector<HTMLInputElement>('input[name="attendance"]:checked')?.value;
  const syncCount = () => {
    const declined = attendance() === 'declined';
    count.disabled = declined;
    countField.hidden = declined;
  };
  form.addEventListener('change', syncCount);

  let group = false;
  const saved = (rsvp: Rsvp) => {
    const who = group && rsvp.name ? ` atas nama ${rsvp.name}` : '';
    return rsvp.attendance === 'attending'
      ? `Konfirmasi tersimpan${who}: hadir, ${rsvp.guestCount} orang.`
      : `Konfirmasi tersimpan${who}: tidak hadir.`;
  };

  const show = (party: Party) => {
    group = party.group === true;
    partyLabel.textContent = group ? 'Undangan grup' : 'Atas nama';
    partyName.textContent = party.name;
    partyBox.hidden = false;
    groupNote.hidden = !group;
    nameField.hidden = !group;
    nameInput.disabled = !group;
    nameInput.required = group;
    if (group && party.rsvp?.name && !nameInput.value) nameInput.value = party.rsvp.name;
    note.hidden = true;
    retry.hidden = true;
    const selected = party.rsvp?.attendance === 'attending' ? party.rsvp.guestCount : Number(count.value) || 1;
    count.replaceChildren(...Array.from({ length: party.maxGuests }, (_, i) => new Option(`${i + 1} orang`, String(i + 1))));
    count.value = String(Math.min(Math.max(selected, 1), party.maxGuests));
    if (party.rsvp) {
      const choice = form.querySelector<HTMLInputElement>(`input[name="attendance"][value="${party.rsvp.attendance}"]`);
      if (choice) choice.checked = true;
      submit.textContent = 'Perbarui konfirmasi';
      status.textContent = saved(party.rsvp);
    }
    syncCount();
    fields.disabled = false;
  };

  const load = () => {
    note.hidden = false;
    note.textContent = 'Memuat data undangan…';
    retry.hidden = true;
    loadParty().then(show, (error: Error) => {
      note.textContent = error.message;
      retry.hidden = false;
    });
  };
  retry.addEventListener('click', load);
  whenNear(form, load);

  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const value = attendance();
    if (!value) { status.textContent = 'Pilih hadir atau tidak hadir.'; return; }
    if (group && !nameInput.value.trim()) { status.textContent = 'Isi nama Anda.'; nameInput.focus(); return; }
    pending = true;
    submit.disabled = true;
    status.textContent = 'Menyimpan…';
    try {
      const { rsvp } = await request<{ rsvp: Rsvp }>('/api/rsvp', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance: value,
          guestCount: value === 'attending' ? Number(count.value) : 0,
          ...(group ? { name: nameInput.value, respondentKey: respondent } : {}),
        }),
      });
      submit.textContent = 'Perbarui konfirmasi';
      const who = group && rsvp.name ? `, ${rsvp.name}` : '';
      status.textContent = rsvp.attendance === 'attending'
        ? `Terima kasih${who}! Kehadiran ${rsvp.guestCount} orang telah tercatat.`
        : `Terima kasih atas konfirmasinya${who}. Doa Anda sangat berarti bagi kami.`;
    } catch (error) {
      // Choices stay as entered so the guest can simply try again.
      status.textContent = error instanceof Error ? error.message : FAILED;
    } finally {
      pending = false;
      submit.disabled = false;
    }
  });
}

function initWishForm(form: HTMLFormElement, auth: Record<string, string> | null, loadParty: () => Promise<Party>) {
  const note = form.querySelector<HTMLElement>('[data-wishes-note]')!;
  const fields = form.querySelector<HTMLFieldSetElement>('[data-wishes-fields]')!;
  const name = form.querySelector<HTMLInputElement>('#wish-name')!;
  const message = form.querySelector<HTMLTextAreaElement>('#wish-message')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-wishes-submit]')!;
  const status = form.querySelector<HTMLElement>('[data-wishes-status]')!;
  if (!auth) return;

  note.hidden = true;
  fields.disabled = false;
  // Suggest the invitation name (on a group link: the person's own name, if they answered).
  whenNear(form, () => {
    loadParty().then((party) => {
      const suggested = party.group ? party.rsvp?.name : party.name;
      if (!name.value && suggested) name.value = suggested;
    }, () => {});
  });

  // One key per draft: retrying the same text cannot create a second wish, editing starts a new one.
  let key = uuid();
  form.addEventListener('input', () => { key = uuid(); });

  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    submit.disabled = true;
    status.textContent = 'Mengirim…';
    try {
      const { wish } = await request<{ wish: { approved: boolean } }>('/api/wishes', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value, message: message.value, idempotencyKey: key }),
      });
      message.value = '';
      key = uuid();
      status.textContent = wish.approved
        ? 'Terima kasih atas ucapan dan doanya!'
        : 'Terima kasih atas ucapan dan doanya! Ucapan akan tampil setelah ditinjau.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : FAILED;
    } finally {
      pending = false;
      submit.disabled = false;
    }
  });
}

function initWishList(section: HTMLElement) {
  const list = section.querySelector<HTMLElement>('[data-wishes-list]');
  const empty = section.querySelector<HTMLElement>('[data-wishes-empty]');
  const more = section.querySelector<HTMLButtonElement>('[data-wishes-more]');
  const status = section.querySelector<HTMLElement>('[data-wishes-list-status]');
  if (!list || !empty || !more || !status) return;
  const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: section.dataset.timeZone });

  const render = (wish: Wish) => {
    const item = document.createElement('article');
    item.className = 'wish glass';
    const who = document.createElement('p');
    who.className = 'wish-name';
    who.textContent = wish.name;
    const text = document.createElement('p');
    text.className = 'wish-message';
    text.textContent = wish.message;
    const when = document.createElement('time');
    when.dateTime = wish.createdAt;
    when.textContent = date.format(new Date(wish.createdAt));
    item.append(who, text, when);
    return item;
  };

  let next: string | null = null;
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    more.disabled = true;
    status.textContent = next ? 'Memuat…' : '';
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (next) params.set('before', next);
      const page = await request<WishesPage>(`/api/wishes?${params}`);
      if (page.wishes.length) empty.hidden = true;
      list.append(...page.wishes.map(render));
      next = page.next;
      more.hidden = !next;
      status.textContent = '';
    } catch (error) {
      // The invitation stays usable; offer the button as a retry.
      status.textContent = error instanceof Error ? error.message : FAILED;
      more.hidden = false;
    } finally {
      loading = false;
      more.disabled = false;
    }
  };
  more.addEventListener('click', load);
  whenNear(list, load);
}
