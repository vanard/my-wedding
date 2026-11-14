/** Same-origin API contracts shared by api/ (server) and src/scripts/ (browser). Types only. */
export type Attendance = 'attending' | 'declined';
/** `name` is set only on a group response: the name the person entered. */
export interface Rsvp { attendance: Attendance; guestCount: number; updatedAt: string; name?: string }
/**
 * The visitor's own invitation, from GET /api/guest (requires their personal code).
 * A group link is shared: each person answers with their own name, `maxGuests` applies per
 * person, and `rsvp` is this browser's own answer (identified by X-Respondent-Key).
 */
export interface Party { name: string; maxGuests: number; group: boolean; rsvp: Rsvp | null }
/** Public wish: only these fields ever leave the server. */
export interface PublicWish { name: string; message: string; createdAt: string }
export interface WishesPage { wishes: PublicWish[]; next: string | null }
/** Totals of a group invitation: answers received and people attending. */
export interface GroupSummary { responses: number; guests: number }
/** Staff check-in result or search hit. `group` is set only for group invitations. */
export interface CheckInParty { id: string; name: string; maxGuests: number; checkedInAt: string | null; already?: boolean; rsvp: Rsvp | null; group?: GroupSummary | null }
export interface ApiError { error: { code: string; message: string } }
