# Wedding media

Web-ready photos and video for the invitation. These files are generated from
the camera originals in `media-originals/` (repo root, git-ignored, never
deployed). Don't put camera files here directly; put them in
`media-originals/` and regenerate.

## Current files

A photo with a job on the site is named for that job and kept out of `album/`, so it
is not repeated in the gallery. Everything in `album/` is gallery-only.

```
src/assets/media/
├── cover.jpg                     Large photo on the left side, desktop only
├── background.jpg                Behind the cover and the invitation (phones: full
│                                 screen; desktop: right column) until the background video
│                                 plays, and instead of it for reduced motion, Data Saver
│                                 or no JavaScript
├── background.mp4                Background video: full teaser (58 s, muted, 720p), before
│                                 and after opening; 85% of the full height so it is less
│                                 zoomed (soft blurred bands top and bottom)
├── background-blur.mp4           Tiny 192 px copy of the teaser, blurred by CSS, filling
│                                 the thin soft bands above and below the video
├── groom.jpg, bride.jpg          The Groom / The Bride portraits (bride.jpg is a close-up
│                                 crop, set in CROPS in scripts/optimize-photos.mjs)
├── story-2.jpg                   Journey of Love photo (joined hands)
├── video-clip.jpg                Poster for the video clip above the album; the clip
│                                 itself is on YouTube (gpVMepCXalA) and its player loads
│                                 only when a guest presses play
├── link-preview.jpg              1200×630 image for shared links (WhatsApp, …):
│                                 img_4303 trimmed to 4:5 on a blurred background,
│                                 made by `npm run media:preview`
├── img_4303.jpg                  Source of link-preview.jpg only (not in the gallery)
└── album/                        Gallery: every image here is shown, shuffled on each
                                  visit; near-identical shots are listed as "moments" in
                                  src/content/invitation.ts and never shown touching
```

`media-originals/` mirrors these names; `media-originals/RENAMES.txt` maps them back to
the original camera/phone file names. To add one new photo, put the original in
`media-originals/album/` and run `npm run media:photos -- media-originals/album/<file>`.

Only files imported in `src/content/invitation.ts` are published.

## Photos

Put originals in `media-originals/` (album photos in `media-originals/album/`),
then run:

```sh
npm run media:photos
```

`scripts/optimize-photos.mjs` resizes to 2400 px on the long edge, applies
orientation, converts to sRGB, and strips all metadata (camera, timestamps,
GPS). It writes high-quality JPEG; Astro then builds the AVIF/WebP files
guests actually download (480–1400 px). No retouching or colour changes.
iPhone `.heic` is accepted if the installed image library supports it;
otherwise export as JPEG first.

## Video

Encoded with ffmpeg (H.264 + `faststart` so playback starts before the whole
file downloads). Re-run from the repo root if the source or segment changes:

```sh
# Background: the full teaser, no audio (CRF 28: it sits behind text and overlays)
ffmpeg -i "media-originals/TEASER PREWEDDING GHEA & VIAN .mp4" \
  -an -vf "scale=1280:-2:flags=lanczos,format=yuv420p" -c:v libx264 -profile:v high \
  -preset veryslow -crf 28 -movflags +faststart -map_metadata -1 -map_chapters -1 \
  src/assets/media/background.mp4

# Blurred fill behind it: a tiny copy (the page blurs it), ~200 KB
ffmpeg -i "media-originals/TEASER PREWEDDING GHEA & VIAN .mp4" \
  -an -vf "scale=192:-2:flags=area,format=yuv420p" -c:v libx264 -profile:v main \
  -preset veryslow -crf 30 -movflags +faststart -map_metadata -1 -map_chapters -1 \
  src/assets/media/background-blur.mp4
```

`video-clip.jpg` is a frame of the clip at 56 s (1280 px JPEG), used as its poster.
The background video uses `background.jpg` as its placeholder and fades in once
it starts playing.

## Size budget

| File | Size | Loaded |
| --- | --- | --- |
| All photo masters | 8.9 MB | Never directly; guests get much smaller AVIF/WebP |
| background.mp4 | 4.9 MB | Automatically, once the page has loaded (before opening) |
| background-blur.mp4 | 0.2 MB | With background.mp4 |

Budget exception (owner's choice: full teaser as background): background.mp4
alone is about the whole 5 MB full-visit budget in `AGENTS.md`, so a visit
with the gallery and music will exceed it. It streams progressively (it can
start before fully downloaded) but must not block the cover or event details.
The video clip is streamed by YouTube, so it costs no hosting transfer, and its
player loads only when a guest presses play.
