# Lamaran

Static Astro invitation with scoped CSS and TypeScript, plus Vercel Functions and
Supabase for RSVP, wishes and venue check-in. Placeholder texts are marked TEMPORARY.

## Run locally

Use Node 22.12+ (22.x), then:

```sh
npm ci
npm run dev
```

Visit `http://localhost:4321/?to=Somebody`. `Buka Undangan` reveals the main page,
moves keyboard focus, and requests music playback from that same click. The
cover and main content share a document so audio survives section navigation.
Without JavaScript the main content is readable below the cover.

```sh
npm run check
npm run build
npm run preview
```

Browser regression checks: `npx playwright test` (after `npm run build`). Install
the required browsers with `npx playwright install chromium webkit` if needed.
These checks cover Chromium at phone width, desktop WebKit, reduced motion,
no-JavaScript access, greeting escaping, rejected audio playback, the countdown
ending, menu keyboard behavior, and the RSVP/wishes/check-in pages (with the API
answered in the browser). They do not replace real iPhone/Android or real-song playback checks.

Endpoint checks: `npm run test:api` runs the `api/` handlers in Node with Supabase
replaced by a fake (authorization, validation, size limits, error mapping, caching).
Database checks in `tests/db/` run only when `TEST_SUPABASE_URL`,
`TEST_SUPABASE_SECRET_KEY` and `TEST_SUPABASE_PUBLISHABLE_KEY` point at a **test**
project (concurrent RSVPs, duplicate wishes, rate limits, browser-key lockout).

## Design

Dark, photo-led layout inspired by a reference recording: opening cover, hero
slideshow, bride/groom portraits, story, save-the-date countdown, events, dress
code, live stream, gallery with lightbox, RSVP, wishes, gifts and thank-you.
Phones get a single column. From 960 px wide, a fixed photo fills the left side
and the invitation scrolls in a right-hand column (`--col` in `tokens.css`).
A frosted menu, a greeting toast, fullscreen (where supported) and music
controls appear after opening.

## Structure

- `src/content/invitation.ts`: typed names, dates, story, events, gifts, photos and audio.
- `src/assets/media/`: the couple's photos and videos (web versions; see its README). Originals live in the git-ignored `media-originals/`.
- `src/lib/format.ts`: timezone-aware date/time text and the calendar link.
- `src/layouts/`: document metadata and global style entry point.
- `src/components/`: one component per section, plus `Photo` (responsive AVIF/WebP) and `Icon`.
- `src/styles/`: dark theme tokens and base styles; component CSS is scoped.
- `src/scripts/`: opening, menu, countdown, gallery lightbox, copy, fullscreen, music and reveals.
- `src/lib/contracts.ts`: request/response types shared by `api/` and the browser scripts.
- `src/pages/checkin.astro`: venue staff page opened by the Entry Access Card QR.
- `api/`: Vercel Functions (`guest`, `rsvp`, `wishes`, `checkin`); `api/_lib/` holds shared helpers.
- `supabase/migrations/`: tables, constraints, RLS and the server-only SQL functions.
- `scripts/guests.mjs`: owner tool to import the guest list, create personal links and export.

## Content and audio

Edit the typed content file. Anything still marked TEMPORARY there is a placeholder
(currently the opening quote and the dress-code palette; check with
`grep -n TEMPORARY src/content/invitation.ts`). Set `isPreview` to false only after
replacing it.

Photos: put originals in `src/assets/` (for example `src/assets/photos/`),
import them in `invitation.ts` and assign them to `people`, `story`, `gallery`
and `photos`. Astro generates resized AVIF/WebP at build time, so originals
around 2000 px on the long edge are enough. Use `position` to adjust cropping.
Set `liveStream`, `dressCode`, `closingQuote` or `gifts` to `null` to hide a section.
A gift account with `value: null` shows "Belum tersedia" and no copy button.

Music: `public/audio/music.mp3`, the full audio track of the prewedding video clip
(≈1.8 MB, see `public/audio/README.md`). It starts from the "Buka Undangan" tap, is not
preloaded, pauses when the tab is hidden or the video clip plays, and requires a tap to
resume. `music.src: null` disables the player. The display font (Cormorant Garamond,
SIL OFL) is self-hosted via `@fontsource/cormorant-garamond`; body text uses system fonts.

## RSVP, wishes and check-in

How it works:

- Each invited party (a person or a family) gets a personal link
  `/?to=<name>&k=<code>`. `to` is only the greeting on the cover; `k` is a random
  43-character code. The database stores only its SHA-256 hash.
- **RSVP**: one current response per party (hadir + number of people up to the party's
  allowance, or tidak hadir). Guests can change it later from the same link.
- **Group links** (e.g. "Teman Kantor"): one link shared by many people. Each person enters
  their own name and head count (at most `max_guests` per person), and the answers **add up**:
  Budi 2 + Sari 1 = 3. The phone remembers its own answer, so the same person can change it
  later; retries never count twice. Answering again from another phone counts as a new person.
  A group accepts at most 300 answers, 200 wishes, and 60 RSVPs / 20 wishes per 10 minutes.
  Its QR works for everyone in the group: staff see the group's totals, never "sudah check-in".
- **Wishes**: sent from a personal link; shown on the site only after you approve them.
  The approved list is public (name, message, date) and cached for about a minute.
- **Entry Access Card**: its QR opens `/checkin/#<code>`. Staff phones signed in with
  `CHECKIN_KEY` record the arrival; a second scan shows "Sudah check-in sebelumnya".
  Staff can also search by name for guests without their QR.
- Links without `k` (or opened by someone else) can read the invitation but cannot RSVP
  or write wishes. Nothing contacts the database until a guest scrolls near the forms;
  if the database is down, only these forms show an error.
- Abuse limits live in the database (shared by all function instances): per party, 10 RSVP
  changes and 3 wishes per 10 minutes, at most 10 wishes in total. Wrong codes are
  rejected before any database work.

### Setup (once per Supabase project)

1. Apply `supabase/migrations/0001_invitation.sql`, `0002_guest_services.sql` and
   `0003_group_invitations.sql` in order (Supabase → SQL Editor, or the Supabase MCP/CLI).
   Try it on a test project first.
2. In Vercel → Settings → Environment Variables (Production, and Preview if used), add
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (Project Settings → API Keys → secret key) and
   `CHECKIN_KEY` (generate as shown in `.env.example`). Redeploy afterwards.
3. Create a local `.env` from `.env.example` with the same values plus `SITE_URL`.

### Owner operations

```sh
# private/ is git-ignored and never deployed. Columns: name,max_guests[,group]
npm run guests -- import private/guests.csv     # writes private/links-<time>.csv
npm run guests -- reissue "Bapak Budi & Keluarga"  # new link; the old one stops working
npm run guests -- export                        # attendance + wishes CSV backup in private/
```

- **Send links**: from `private/links-*.csv`. It is the only copy of the codes; keep it
  private and backed up. Names must be unique, e.g. "Budi (Kantor)" and "Budi (SMA)".
- **Group links**: add a `group` column and write `ya` on group rows, e.g.

  ```csv
  name,max_guests,group
  Bapak Budi & Keluarga,4,
  Teman Kantor,5,ya
  ```

  For a group, `max_guests` is the limit **per person who answers**. Share the group link in
  that group's chat only: anyone who has it can answer. Answers per person:
  `select * from private.group_responses;`
- **Approve wishes**: Supabase → SQL Editor: `select * from private.wishes_to_review;`
  then `update public.wishes set approved = true where id = '<id>';` (or toggle `approved`
  in Table Editor → wishes). To hide one again, set it back to false.
- **Attendance**: `select * from private.attendance_totals;` (`total_guests_attending`
  includes group answers) and `select * from private.guest_overview;`, or
  `npm run guests -- export` (one row per personal invitation and per group answer).
- **Venue day**: give staff the `/checkin/` address and `CHECKIN_KEY`. Each staff phone
  signs in once. Afterwards rotate `CHECKIN_KEY` in Vercel (and redeploy).
- **Before sending invitations and before the event**: open the Supabase dashboard to make
  sure the free project is not paused, run an export as a backup, and send yourself a test link.

## Deployment (Vercel)

What gets deployed: the static site in `dist/` (built by `npm run build`) and the
root `api/` files as Vercel Functions. No Astro server adapter. The functions need
the environment variables from "RSVP, wishes and check-in"; without them they answer
`503 NOT_CONFIGURED` and the rest of the invitation works normally.

### First deployment

1. Merge the work into `main` and push it to GitHub (`origin`).
2. On vercel.com (Hobby plan, personal account): **Add New → Project → Import**
   `my-wedding`. Vercel detects Astro; build command and output come from
   `vercel.json`, and Node 22.x from `engines` in `package.json`. Keep
   **Settings → Environment Variables → Automatically expose System Environment
   Variables** enabled: the link-preview image needs `VERCEL_PROJECT_PRODUCTION_URL`.
3. Deploy. `main` becomes production (`<project>.vercel.app`); other branches get
   preview deployments. Review **Settings → Deployment Protection** so previews are
   not publicly shared by accident.
4. Custom domain later (optional, paid separately): add it in Vercel, then set
   `SITE_URL=https://your-domain` so link previews use it.

Never deploy from this machine with the Vercel CLI without `.vercelignore` in place:
`media-originals/` (≈800 MB, private photo metadata) must not be uploaded. Git
deployments only contain committed files.

### Checks after each production deploy

```sh
SITE=https://<project>.vercel.app
curl -sI "$SITE/" | grep -i cache-control            # public, max-age=0, must-revalidate
curl -sI "$SITE$(curl -s "$SITE/" | grep -o '/_astro/[^"]*\.css' | head -1)" | grep -i cache-control   # max-age=31536000, immutable
curl -s "$SITE/api/wishes"                            # {"wishes":[...],"next":...} (503 if not configured)
curl -s -X POST "$SITE/api/rsvp"                      # 401 INVALID_TOKEN (no personal code)
curl -s -X POST "$SITE/api/checkin" -H 'content-type: application/json' -d '{"ping":true}'   # 401 without the staff key
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/tidak-ada"   # 404 (styled page)
curl -s "$SITE/" | grep -o '<meta property="og:image" content="[^"]*"'   # absolute https URL
```

Then open `$SITE/?to=Nama%20Tamu` on a phone (cover, "Buka Undangan", background
video, gallery, YouTube video clip) and send the link to yourself on WhatsApp to confirm the
preview image. A local build is not a substitute for these checks.

Caching: `/_astro/*` files have content hashes in their names and are cached for a
year (`vercel.json`); HTML keeps Vercel's default `max-age=0, must-revalidate`, so a
new deployment is visible immediately.

### Free-plan limits (checked 2026-11-13; re-check before sending invitations)

Vercel Hobby is for personal, non-commercial use and includes per month about
100 GB Fast Data Transfer, 10 GB Fast Origin Transfer and 1,000,000 Function
invocations; CLI uploads are limited to 100 MB. Sources:
https://vercel.com/docs/limits and https://vercel.com/docs/limits/fair-use-guidelines.

Rough transfer estimate per first visit: ≈7.3 MB (background video 4.9 MB, music
1.8 MB, photos, fonts and scripts); the video clip streams from YouTube and adds nothing
here. 3,000 visits is roughly 22 GB; repeat visits reuse cached files. These are
estimates, not measurements or guarantees.

Budget exception: a full visit is above the 5 MB aim in `AGENTS.md`, mainly because of
the background video and the music. Neither blocks the first screen (the video starts
after the cover; the music only from the opening tap).

Use the launch checklist and budgets in `AGENTS.md` before distributing links.
Physical phone testing and the 1,000-guest/100-concurrent scenario remain launch checks.
