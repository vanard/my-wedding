// POST /api/rsvp — save the visitor's RSVP (atomic upsert in the database).
// Body: { "attendance": "attending" | "declined", "guestCount": number,
//         "name"?: string, "respondentKey"?: uuid, "memberId"?: uuid }
// Personal link: one current answer per party. Group link: one current answer per
// respondentKey, so different people add up and the same browser updates its own answer.
// Group with members: memberId (with respondentKey) answers for that listed person; a name is
// locked to the first phone that answers for it.
// Requires the personal code as `Authorization: Bearer <code>`; the allowance is checked in SQL.
import { handle, json, readJson } from './_lib/http.js';
import { guestCodeHash } from './_lib/auth.js';
import { rpc } from './_lib/supabase.js';
import { rsvpInput } from './_lib/validate.js';
import type { Rsvp } from '../src/lib/contracts.js';

export const POST = handle(async (request) => {
  const codeHash = await guestCodeHash(request);
  const input = rsvpInput(await readJson(request, 1024));
  if (input.memberId) {
    const rsvp = await rpc<Rsvp>('submit_member_rsvp', {
      p_token_hash: codeHash, p_member_id: input.memberId, p_respondent_key: input.respondentKey, p_attendance: input.attendance,
    });
    return json({ rsvp });
  }
  const args: Record<string, unknown> = { p_token_hash: codeHash, p_attendance: input.attendance, p_guest_count: input.guestCount };
  if (input.respondentKey) args.p_respondent_key = input.respondentKey;
  if (input.name) args.p_name = input.name;
  const rsvp = await rpc<Rsvp>('submit_rsvp', args);
  return json({ rsvp });
});
