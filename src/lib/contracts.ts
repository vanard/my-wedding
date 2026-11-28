/** Same-origin API contracts shared by api/ (server) and src/scripts/ (browser). Types only. */
export type Attendance = 'attending' | 'declined';
/**
 * `name` is set only on a group response: the name the person entered or picked.
 * `memberId` is set when the group lists its members: the member this phone answered for.
 */
export interface Rsvp { attendance: Attendance; guestCount: number; updatedAt: string; name?: string; memberId?: string }
/** A name on a group's member list, as the guest sees it (no one else's answer). */
export interface GuestMember { id: string; name: string; taken: boolean; mine: boolean }
/**
 * The visitor's own invitation, from GET /api/guest (requires their personal code).
 * A group link is shared: each person answers for themselves, and `rsvp` is this browser's own
 * answer (identified by X-Respondent-Key). With `members`, the person picks their name from the
 * list; otherwise they type it.
 */
export interface Party { name: string; maxGuests: number; group: boolean; rsvp: Rsvp | null; members?: GuestMember[] }
/** Public wish: only these fields ever leave the server. */
export interface PublicWish { name: string; message: string; createdAt: string }
export interface WishesPage { wishes: PublicWish[]; next: string | null }
/** Totals of a group invitation: answers received and people attending. */
export interface GroupSummary { responses: number; guests: number }
/** A group member as staff see it: their answer and arrival. */
export interface StaffMember { id: string; name: string; attendance: Attendance | null; checkedInAt: string | null }
/**
 * Staff check-in result or search hit. `group` is set only for group invitations; `members` for
 * a group that lists its members; `member` when one member's arrival was just recorded.
 */
export interface CheckInParty {
  id: string; name: string; maxGuests: number; checkedInAt: string | null; already?: boolean; rsvp: Rsvp | null;
  group?: GroupSummary | null; members?: StaffMember[] | null; member?: StaffMember | null;
}
export interface ApiError { error: { code: string; message: string } }
