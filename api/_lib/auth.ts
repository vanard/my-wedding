import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';
import { rpc } from './supabase.js';

/** Long personal codes (links sent as /?to=…&k=…): 32 random bytes, base64url (43 characters). */
export const GUEST_CODE = /^[A-Za-z0-9_-]{32,64}$/;
/** Short link codes (/i/<name>-<code>): 10 characters a-z 0-9. */
export const LINK_CODE = /^[a-z0-9]{10}$/;

/** The database stores only this hash, never the code itself. */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const INVALID_LINK = 'Tautan undangan tidak dikenali. Buka kembali tautan undangan pribadi Anda.';

/**
 * The token hash the database functions know an invitation by, from either kind of code; null
 * when the code is malformed. A short code is looked up by its own hash (link_hash). An unknown
 * short code gives a hash that matches no invitation, so the usual "not recognised" and "not
 * found" errors follow.
 */
export async function tokenHash(code: unknown): Promise<string | null> {
  if (typeof code !== 'string') return null;
  if (GUEST_CODE.test(code)) return hashCode(code);
  if (!LINK_CODE.test(code)) return null;
  const linkHash = hashCode(code);
  return (await rpc<string | null>('party_token_for_link', { p_link_hash: linkHash })) ?? linkHash;
}

/** The guest's personal code, sent as `Authorization: Bearer <code>` (never in the URL). */
export async function guestCodeHash(request: Request): Promise<string> {
  const match = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
  const hash = match ? await tokenHash(match[1]) : null;
  if (!hash) throw new HttpError(401, 'INVALID_TOKEN', INVALID_LINK);
  return hash;
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
