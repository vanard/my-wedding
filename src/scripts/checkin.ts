// Staff check-in page. The staff key is kept in this device's localStorage so each scanned QR
// (which opens a new tab at /checkin/#<code>) is confirmed without signing in again.
// The guest code is removed from the address bar as soon as it is read.
// A group member's card adds their member id (`#<code>.<id>`), so that person is recorded; a
// group QR without it shows the group's member list to choose from.
import type { CheckInParty, StaffMember } from '../lib/contracts';

const KEY = 'wedding-staff-key';
const HASH = /^([A-Za-z0-9_-]{32,64})(?:\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?$/i;

type Target = { code: string; memberId?: string } | { partyId: string; memberId?: string };

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

  const memberBox = $<HTMLElement>('[data-result-members]');
  const memberList = $<HTMLUListElement>('[data-result-member-list]');

  let key = storage.get();
  let pending: Target | null = null;
  const fromHash = location.hash.slice(1);
  if (fromHash) history.replaceState(null, '', location.pathname);
  const match = HASH.exec(fromHash);
  if (match) pending = match[2] ? { code: match[1]!, memberId: match[2] } : { code: match[1]! };

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

  const memberText = (member: StaffMember) => member.checkedInAt ? `Sudah check-in ${time.format(new Date(member.checkedInAt))}`
    : member.attendance === 'attending' ? 'Konfirmasi hadir' : member.attendance === 'declined' ? 'Konfirmasi tidak hadir' : 'Belum konfirmasi';

  // A group with a member list: staff tap the arriving person's name.
  const showMembers = (party: CheckInParty) => {
    memberBox.hidden = !party.members || Boolean(party.member);
    memberList.replaceChildren(...(party.members && !party.member ? party.members : []).map((member) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'hit-name';
      label.textContent = member.name;
      const meta = document.createElement('span');
      meta.className = 'hit-meta';
      meta.textContent = memberText(member);
      label.append(meta);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = 'Check-in';
      button.addEventListener('click', async () => {
        button.disabled = true;
        await checkIn({ partyId: party.id, memberId: member.id });
        button.disabled = false;
      });
      item.append(label, button);
      return item;
    }));
  };

  const showResult = (party: CheckInParty) => {
    result.hidden = false;
    showMembers(party);
    if (party.member) {
      // One group member: their own name, answer and arrival.
      result.dataset.state = party.already ? 'already' : 'ok';
      $<HTMLElement>('[data-result-title]').textContent = party.already ? 'Sudah check-in sebelumnya' : `Selamat datang · ${party.name}`;
      $<HTMLElement>('[data-result-name]').textContent = party.member.name;
      $<HTMLElement>('[data-result-rsvp]').textContent = party.member.attendance === 'attending' ? 'Hadir'
        : party.member.attendance === 'declined' ? 'Tidak hadir' : 'Belum konfirmasi';
      $<HTMLElement>('[data-result-allowance]').textContent = '1 orang';
      $<HTMLElement>('[data-result-time]').textContent = party.member.checkedInAt ? time.format(new Date(party.member.checkedInAt)) : '-';
      status.textContent = '';
      result.scrollIntoView({ block: 'start' });
      return;
    }
    if (party.members) {
      // The group's own QR (or a search hit): choose who arrived.
      result.dataset.state = 'ok';
      $<HTMLElement>('[data-result-title]').textContent = 'Undangan grup · pilih nama tamu';
      $<HTMLElement>('[data-result-name]').textContent = party.name;
      $<HTMLElement>('[data-result-rsvp]').textContent = rsvpText(party);
      $<HTMLElement>('[data-result-allowance]').textContent = `${party.members.length} nama`;
      $<HTMLElement>('[data-result-time]').textContent = `${party.members.filter((m) => m.checkedInAt).length} sudah check-in`;
      status.textContent = '';
      result.scrollIntoView({ block: 'start' });
      return;
    }
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
    memberBox.hidden = true;
    for (const field of ['rsvp', 'allowance', 'time']) $<HTMLElement>(`[data-result-${field}]`).textContent = '-';
  };

  const checkIn = async (body: Target) => {
    status.textContent = 'Memeriksa…';
    try {
      const { party } = await call<{ party: CheckInParty }>(body);
      showResult(party);
      return true;
    } catch (error) {
      if (signedOut(error)) {
        // Confirm this guest right after signing in again.
        if ('code' in body) pending = body;
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
      if (pending) { const target = pending; pending = null; await checkIn(target); }
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
        meta.textContent = party.members ? `Grup · ${party.members.length} nama` : party.checkedInAt && !party.group ? `Sudah check-in ${time.format(new Date(party.checkedInAt))}` : rsvpText(party);
        label.append(meta);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = party.members ? 'Pilih nama' : 'Check-in';
        button.addEventListener('click', async () => {
          button.disabled = true;
          if (await checkIn({ partyId: party.id }) && !party.members) meta.textContent = 'Tercatat';
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

  if (!key) showLogin(pending ? 'Masuk untuk mencatat kedatangan tamu ini.' : '');
  else {
    showStaff();
    if (pending) { const target = pending; pending = null; void checkIn(target); }
  }
}
