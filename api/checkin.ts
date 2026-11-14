// POST /api/checkin — venue staff only (X-Staff-Key: the CHECKIN_KEY environment variable).
// Body, one of:
//   { "code": "<personal code from the QR>" }  confirm arrival by QR code
//   { "partyId": "<uuid>" }                    confirm arrival from a name search
//   { "query": "<part of a name>" }            search parties (at least 2 characters)
//   { "ping": true }                           check the staff key when signing in
import { HttpError, handle, json, readJson } from './_lib/http.js';
import { GUEST_CODE, hashCode, requireStaff } from './_lib/auth.js';
import { rpc } from './_lib/supabase.js';
import type { CheckInParty } from '../src/lib/contracts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = handle(async (request) => {
  requireStaff(request);
  const body = await readJson(request, 1024);

  if (body.ping === true) return json({ ok: true });
  if (typeof body.query === 'string') {
    const query = body.query.trim().slice(0, 100);
    if ([...query].length < 2) throw new HttpError(422, 'INVALID_INPUT', 'Ketik minimal 2 huruf.');
    return json({ parties: await rpc<CheckInParty[]>('staff_find_parties', { p_query: query }) });
  }
  if (typeof body.code === 'string' && GUEST_CODE.test(body.code)) {
    return json({ party: await rpc<CheckInParty>('check_in', { p_token_hash: hashCode(body.code) }) });
  }
  if (typeof body.partyId === 'string' && UUID.test(body.partyId)) {
    return json({ party: await rpc<CheckInParty>('check_in', { p_party_id: body.partyId }) });
  }
  throw new HttpError(400, 'INVALID_INPUT', 'Kode QR tidak valid.');
});
