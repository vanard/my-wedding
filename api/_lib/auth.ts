import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

/** Personal codes from the guest import: 32 random bytes, base64url (43 characters). */
export const GUEST_CODE = /^[A-Za-z0-9_-]{32,64}$/;

/** The database stores only this hash, never the code itself. */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const INVALID_LINK = 'Tautan undangan tidak dikenali. Buka kembali tautan undangan pribadi Anda.';

/** The guest's personal code, sent as `Authorization: Bearer <code>` (never in the URL). */
export function guestCodeHash(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9_-]{32,64})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'INVALID_TOKEN', INVALID_LINK);
  return hashCode(match[1]!);
}

/** At least this long, so the staff key cannot be guessed by trying. */
export const MIN_STAFF_KEY_LENGTH = 24;

/** Venue staff send the shared key from CHECKIN_KEY in the X-Staff-Key header. */
export function requireStaff(request: Request): void {
  const expected = process.env.CHECKIN_KEY ?? '';
  if (expected.length < MIN_STAFF_KEY_LENGTH) {
    throw new HttpError(503, 'NOT_CONFIGURED', 'Check-in belum diaktifkan.');
  }
  const given = request.headers.get('x-staff-key') ?? '';
  // Compare fixed-length digests in constant time.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!given || !timingSafeEqual(a, b)) throw new HttpError(401, 'STAFF_UNAUTHORIZED', 'Kunci petugas salah.');
}
