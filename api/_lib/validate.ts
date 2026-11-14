import { HttpError } from './http.js';

export const LIMITS = { name: 100, message: 1000, guests: 100, wishesPage: 20, wishesPageMax: 50 } as const;

/** Characters, not UTF-16 units, to match char_length() in the database. */
const length = (text: string) => [...text].length;

/** Trimmed text without control characters (newlines and tabs allowed only when multiline). */
export function text(value: unknown, field: string, max: number, multiline = false): string {
  if (typeof value !== 'string') throw new HttpError(422, 'INVALID_INPUT', `${field} wajib diisi.`);
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .replace(multiline ? /[\u0000-\u0008\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
    .trim();
  if (!cleaned) throw new HttpError(422, 'INVALID_INPUT', `${field} wajib diisi.`);
  if (length(cleaned) > max) throw new HttpError(422, 'INVALID_INPUT', `${field} maksimal ${max} karakter.`);
  return cleaned;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_REQUEST = 'Permintaan tidak valid. Muat ulang halaman lalu coba lagi.';

/** The random key a browser keeps for its own answer on a group link (absent: personal link). */
export function respondentKey(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'INVALID_INPUT', BAD_REQUEST);
  return value.toLowerCase();
}

export interface RsvpInput {
  attendance: 'attending' | 'declined';
  guestCount: number;
  /** Group links only; the database requires both for a group and ignores them otherwise. */
  respondentKey: string | null;
  name: string | null;
}

export function rsvpInput(body: Record<string, unknown>): RsvpInput {
  const { attendance, guestCount } = body;
  const group = {
    respondentKey: respondentKey(body.respondentKey),
    name: body.name === undefined || body.name === null ? null : text(body.name, 'Nama', LIMITS.name),
  };
  if (attendance === 'declined') return { attendance, guestCount: 0, ...group };
  if (attendance !== 'attending') throw new HttpError(422, 'INVALID_ATTENDANCE', 'Pilih hadir atau tidak hadir.');
  if (typeof guestCount !== 'number' || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > LIMITS.guests) {
    throw new HttpError(422, 'INVALID_GUEST_COUNT', 'Pilih jumlah tamu yang hadir.');
  }
  return { attendance, guestCount, ...group };
}

export function wishInput(body: Record<string, unknown>): { name: string; message: string; idempotencyKey: string } {
  const { idempotencyKey } = body;
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) {
    throw new HttpError(400, 'INVALID_INPUT', BAD_REQUEST);
  }
  return {
    name: text(body.name, 'Nama', LIMITS.name),
    message: text(body.message, 'Ucapan', LIMITS.message, true),
    idempotencyKey,
  };
}

/** Wishes cursor: "<created_at ISO>_<id>", as returned in `next`. */
export function wishesCursor(value: string | null): { createdAt: string; id: string } | null {
  if (!value) return null;
  const [createdAt, id, extra] = value.split('_');
  if (extra !== undefined || !createdAt || !id || !UUID.test(id) || Number.isNaN(Date.parse(createdAt)) || createdAt.length > 40) {
    throw new HttpError(400, 'INVALID_CURSOR', 'Permintaan tidak valid. Muat ulang halaman lalu coba lagi.');
  }
  return { createdAt, id };
}

export function pageSize(value: string | null): number {
  if (value === null) return LIMITS.wishesPage;
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1) return LIMITS.wishesPage;
  return Math.min(size, LIMITS.wishesPageMax);
}
