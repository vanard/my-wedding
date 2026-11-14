// Calls the database functions from supabase/migrations through Supabase's Data API with the
// server-only secret key. No SDK: one fetch per request keeps functions small and fast.
import { HttpError } from './http.js';

/** Errors raised on purpose by the SQL functions, mapped to responses guests can act on. */
const KNOWN: Record<string, [number, string]> = {
  INVALID_TOKEN: [401, 'Tautan undangan tidak dikenali. Buka kembali tautan undangan pribadi Anda.'],
  INVALID_ATTENDANCE: [422, 'Pilih hadir atau tidak hadir.'],
  INVALID_GUEST_COUNT: [422, 'Jumlah tamu melebihi jatah undangan Anda.'],
  INVALID_WISH: [422, 'Nama dan ucapan wajib diisi.'],
  GROUP_DETAILS_REQUIRED: [422, 'Isi nama Anda.'],
  GROUP_FULL: [409, 'Pendaftaran melalui tautan grup ini sudah penuh. Silakan hubungi mempelai.'],
  RATE_LIMITED: [429, 'Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.'],
  WISH_LIMIT: [429, 'Batas jumlah ucapan untuk undangan ini sudah tercapai. Terima kasih!'],
  NOT_FOUND: [404, 'Tamu tidak ditemukan.'],
};

const UNAVAILABLE = 'Layanan sedang tidak tersedia. Silakan coba lagi beberapa saat lagi.';

export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new HttpError(503, 'NOT_CONFIGURED', UNAVAILABLE);

  // New secret keys (sb_secret_…) go only in the apikey header; a legacy service_role JWT
  // also needs the Authorization header.
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(503, 'DB_UNAVAILABLE', UNAVAILABLE);
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body as T;

  const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
  const known = KNOWN[message];
  if (known) throw new HttpError(known[0], message, known[1]);
  // Paused project, outage, or a migration that has not been applied. Log only the status.
  console.error(`Database call ${name} failed with HTTP ${response.status}`);
  throw new HttpError(503, 'DB_UNAVAILABLE', UNAVAILABLE);
}
