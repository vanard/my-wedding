# Lamaran

Static Astro invitation with scoped CSS, TypeScript, Vercel API boundaries, and a
Supabase schema foundation. Names and details are explicitly temporary.

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
ending, and menu keyboard behavior. They do not
replace real iPhone/Android or real-song playback checks.

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
- `src/lib/contracts.ts`: planned request/response types.
- `api/`: Vercel Function placeholders that return 503, never fake success.
- `supabase/migrations/`: private tables, RSVP uniqueness, constraints and RLS.

## Content and audio

Edit the typed content file. Everything marked TEMPORARY (date, times, venues,
quote, story, parents, dress-code palette, gift accounts and all photos) is a
placeholder. Set `isPreview` to false only after replacing it.

Photos: put originals in `src/assets/` (for example `src/assets/photos/`),
import them in `invitation.ts` and assign them to `people`, `story`, `gallery`
and `photos`. Astro generates resized AVIF/WebP at build time, so originals
around 2000 px on the long edge are enough. Use `position` to adjust cropping.
Set `liveStream`, `dressCode`, `closingQuote` or `gifts` to `null` to hide a section.
A gift account with `value: null` shows "Belum tersedia" and no copy button.

Place a licensed MP3 in `public/audio/` and set `music.src`. No audio file is
supplied; the player stays disabled until configured. Music pauses when the tab
is hidden and requires a tap to resume. The display font (Cormorant Garamond,
SIL OFL) is self-hosted via `@fontsource/cormorant-garamond`; body text uses system fonts.

## RSVP and wishes: prepared, not connected

Forms are intentionally disabled and endpoints return `NOT_READY`. No guest data
is stored yet. Astro dev/preview serve the static site, not the root `api/`
functions; use Vercel's local runtime or a preview deployment when integrating APIs.

Before enabling forms:

1. Create a separate Supabase test project and apply the SQL migration there.
2. Set server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the runtime environment.
3. Implement token hashing/lookup, request validation and persistent rate limiting.
   Resolve party allowance through an authorized private endpoint; never trust `?to=`.
4. Implement atomic RSVP upserts, wish idempotency, and approved-wish cursor
   pagination (20 by default, at most 50). Keep private responses uncached.
5. Wire the forms through same-origin fetch requests, with pending/error/success
   states, safe retries and preserved input on failure. Add authorization and
   persistence tests against the test database before enabling submission.
6. Add the owner's moderation/export workflow and verify backups and free-plan readiness.

The migration is not applied automatically. Tables are inaccessible to anonymous
and authenticated browser roles. Server credentials bypass RLS and therefore require
explicit authorization in every endpoint. No database integration or load test has
been completed in this foundation.

## Deployment (Vercel)

What gets deployed: the static site in `dist/` (built by `npm run build`) and the
root `api/` files as Vercel Functions (currently fail-closed `503 NOT_READY`). No
Astro server adapter and no environment variables are needed yet.

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
curl -s -X POST "$SITE/api/rsvp"                      # {"error":{"code":"NOT_READY",...}} with status 503
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

Rough transfer estimate per first visit: ≈5.5 MB (background video 4.9 MB, photos,
fonts and scripts); the video clip streams from YouTube and adds nothing here.
3,000 visits is roughly 17 GB; repeat visits reuse cached `/_astro/` files. These are estimates, not measurements or guarantees.

Use the launch checklist and budgets in `AGENTS.md` before distributing links.
Physical phone testing and the 1,000-guest/100-concurrent scenario remain launch checks.
