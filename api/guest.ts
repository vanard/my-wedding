// GET /api/guest — the visitor's own invitation (name, allowance, current RSVP).
// Requires the personal code from the link (?k=) as `Authorization: Bearer <code>`.
// On a group link, the optional `X-Respondent-Key` header selects this browser's own answer.
// Called only when a guest with a personal link scrolls near the RSVP or wishes section.
import { handle, json } from './_lib/http.js';
import { guestCodeHash } from './_lib/auth.js';
import { rpc } from './_lib/supabase.js';
import { respondentKey } from './_lib/validate.js';
import type { Party } from '../src/lib/contracts.js';

export const GET = handle(async (request) => {
  const codeHash = guestCodeHash(request);
  const key = respondentKey(request.headers.get('x-respondent-key'));
  const party = await rpc<Party>('guest_party', key ? { p_token_hash: codeHash, p_respondent_key: key } : { p_token_hash: codeHash });
  return json({ party });
});
