// Staff check-in page. The staff key is kept in this device's localStorage so each scanned QR
// (which opens a new tab at /checkin/#<code>) is confirmed without signing in again.
// The guest code is removed from the address bar as soon as it is read.
import type { CheckInParty } from '../lib/contracts';

const KEY = 'wedding-staff-key';
const CODE = /^[A-Za-z0-9_-]{32,64}$/;

const storage = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (value: string) => { try { localStorage.setItem(KEY, value); } catch { /* kept for this page only */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } },
};

class StaffError extends Error {}

export function initCheckIn() {
  const root = document.querySelector<HTMLElement>('[data-checkin]');
  if (!root) return;
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const login = $<HTMLFormElement>('[data-staff-login]');
  const loginStatus = $<HTMLElement>('[data-login-status]');
  const staff = $<HTMLElement>('[data-staff]');
  const result = $<HTMLElement>('[data-result]');
  const status = $<HTMLElement>('[data-checkin-status]');
  const search = $<HTMLFormElement>('[data-search]');
  const searchStatus = $<HTMLElement>('[data-search-status]');
  const hits = $<HTMLUListElement>('[data-search-results]');
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: root.dataset.timeZone });

  let key = storage.get();
  let pendingCode: string | null = null;
  const fromHash = location.hash.slice(1);
  if (fromHash) history.replaceState(null, '', location.pathname);
  if (CODE.test(fromHash)) pendingCode = fromHash;

  async function call<T>(body: object, staffKey = key): Promise<T> {
    let response: Response;
    try {
      response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Staff-Key': staffKey ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Koneksi terputus. Periksa internet lalu coba lagi.');
    }
    const data = await response.json().catch(() => null) as ({ error?: { message?: string } } & T) | null;
    if (response.status === 401 && data?.error) throw new StaffError(data.error.message ?? 'Kunci petugas salah.');
    if (!response.ok || !data) throw new Error(data?.error?.message ?? 'Terjadi kesalahan. Silakan coba lagi.');
    return data;
  }

  const showLogin = (message = '') => {
    staff.hidden = true;
    login.hidden = false;
    loginStatus.textContent = message;
    $<HTMLInputElement>('#staff-key').focus();
  };
  const showStaff = () => { login.hidden = true; staff.hidden = false; };
  const signedOut = (error: unknown) => {
    if (!(error instanceof StaffError)) return false;
    key = null;
    storage.clear();
    showLogin(`${error.message} Silakan masuk kembali.`);
    return true;
  };

  // A group QR is shared by the whole group: show the group's totals, never "already".
  const rsvpText = (party: CheckInParty) => party.group ? `Grup: ${party.group.responses} konfirmasi, ${party.group.guests} orang hadir`
    : !party.rsvp ? 'Belum konfirmasi'
    : party.rsvp.attendance === 'attending' ? `Hadir, ${party.rsvp.guestCount} orang` : 'Tidak hadir';

  const showResult = (party: CheckInParty) => {
    result.hidden = false;
    result.dataset.state = party.already ? 'already' : 'ok';
    $<HTMLElement>('[data-result-title]').textContent = party.already ? 'Sudah check-in sebelumnya' : party.group ? 'Selamat datang · Undangan grup' : 'Selamat datang';
    $<HTMLElement>('[data-result-name]').textContent = party.name;
    $<HTMLElement>('[data-result-rsvp]').textContent = rsvpText(party);
    $<HTMLElement>('[data-result-allowance]').textContent = party.group ? `${party.maxGuests} orang per nama` : `${party.maxGuests} orang`;
    $<HTMLElement>('[data-result-time]').textContent = party.checkedInAt
      ? `${party.group ? 'Pertama ' : ''}${time.format(new Date(party.checkedInAt))}` : '-';
    status.textContent = '';
    result.scrollIntoView({ block: 'start' });
  };
  const showError = (message: string) => {
    result.hidden = false;
    result.dataset.state = 'error';
    $<HTMLElement>('[data-result-title]').textContent = 'Tidak berhasil';
    $<HTMLElement>('[data-result-name]').textContent = message;
    for (const field of ['rsvp', 'allowance', 'time']) $<HTMLElement>(`[data-result-${field}]`).textContent = '-';
  };

  const checkIn = async (body: { code: string } | { partyId: string }) => {
    status.textContent = 'Memeriksa…';
    try {
      const { party } = await call<{ party: CheckInParty }>(body);
      showResult(party);
      return true;
    } catch (error) {
      if (signedOut(error)) {
        // Confirm this guest right after signing in again.
        if ('code' in body) pendingCode = body.code;
        status.textContent = '';
        return false;
      }
      status.textContent = '';
      showError(error instanceof Error ? error.message : 'Terjadi kesalahan.');
      return true;
    }
  };

  login.addEventListener('submit', async (event) => {
    event.preventDefault();
    const candidate = new FormData(login).get('key')?.toString().trim() ?? '';
    if (!candidate) return;
    const button = login.querySelector('button')!;
    button.disabled = true;
    loginStatus.textContent = 'Memeriksa…';
    try {
      await call({ ping: true }, candidate);
      key = candidate;
      storage.set(candidate);
      login.reset();
      loginStatus.textContent = '';
      showStaff();
      if (pendingCode) { const code = pendingCode; pendingCode = null; await checkIn({ code }); }
    } catch (error) {
      loginStatus.textContent = error instanceof Error ? error.message : 'Terjadi kesalahan.';
    } finally {
      button.disabled = false;
    }
  });

  search.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = new FormData(search).get('query')?.toString().trim() ?? '';
    searchStatus.textContent = 'Mencari…';
    hits.replaceChildren();
    try {
      const { parties } = await call<{ parties: CheckInParty[] }>({ query });
      searchStatus.textContent = parties.length ? '' : 'Tidak ada tamu dengan nama tersebut.';
      hits.append(...parties.map((party) => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'hit-name';
        label.textContent = party.name;
        const meta = document.createElement('span');
        meta.className = 'hit-meta';
        meta.textContent = party.checkedInAt && !party.group ? `Sudah check-in ${time.format(new Date(party.checkedInAt))}` : rsvpText(party);
        label.append(meta);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = 'Check-in';
        button.addEventListener('click', async () => {
          button.disabled = true;
          if (await checkIn({ partyId: party.id })) meta.textContent = 'Tercatat';
          button.disabled = false;
        });
        item.append(label, button);
        return item;
      }));
    } catch (error) {
      if (!signedOut(error)) searchStatus.textContent = error instanceof Error ? error.message : 'Terjadi kesalahan.';
    }
  });

  $<HTMLButtonElement>('[data-staff-logout]').addEventListener('click', () => {
    key = null;
    storage.clear();
    result.hidden = true;
    hits.replaceChildren();
    showLogin('Perangkat ini sudah keluar.');
  });

  if (!key) showLogin(pendingCode ? 'Masuk untuk mencatat kedatangan tamu ini.' : '');
  else {
    showStaff();
    if (pendingCode) { const code = pendingCode; pendingCode = null; void checkIn({ code }); }
  }
}
