# Wedding media

Web-ready photos and video for the invitation. These files are generated from
the camera originals in `media-originals/` (repo root, git-ignored, never
deployed). Don't put camera files here directly; put them in
`media-originals/` and regenerate.

## Current files

```
src/assets/media/
├── groom.jpg, bride.jpg          Mempelai Pria / Mempelai Wanita portraits
├── photo-05.jpg                  Opening cover (all devices) + large left photo on desktop
├── photo-08.jpg                  Shown behind the scrolling sections until the
│                                 background video plays (and instead of it for
│                                 reduced motion, Data Saver, or no JavaScript)
├── album/                        Gallery (27 photos): img_XXXX.jpg in shot order,
│                                 then photo-01…04 and photo-07. Every image in
│                                 this folder is shown automatically, sorted by name
├── background.mp4                Background video: full teaser (58 s, muted, 720p),
│                                 behind all scrolling sections except the opening
│                                 slideshow and the bride/groom portraits
├── video-clip.mp4                Playable video clip with sound (1:51, 720p),
│                                 shown above the album
└── video-clip.jpg                Its poster image before play
```

`media-originals/RENAMES.txt` maps `photo-NN` back to the original file names.
The single photos were numbered in the order they were saved.

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

# Playable clip: full length, with sound
ffmpeg -i "media-originals/VIDEO CLIP PREWEDDING GHEA & VIAN .mp4" \
  -vf "scale=1280:-2:flags=lanczos,format=yuv420p" -c:v libx264 -profile:v high \
  -preset slow -crf 23 -c:a aac -b:a 128k -ac 2 -movflags +faststart \
  -map_metadata -1 -map_chapters -1 src/assets/media/video-clip.mp4
```

`video-clip.jpg` is a single frame of the clip at 56 s, saved as 1280 px JPEG.
The background video uses `photo-08.jpg` as its placeholder and fades in once
it starts playing.

## Size budget

| File | Size | Loaded |
| --- | --- | --- |
| All photo masters | 8.9 MB | Never directly; guests get much smaller AVIF/WebP |
| background.mp4 | 4.9 MB | Automatically, once the page has loaded (before opening) |
| video-clip.mp4 | 15.7 MB | Only when a guest presses play |

Budget exception (owner's choice: full teaser as background): background.mp4
alone is about the whole 5 MB full-visit budget in `AGENTS.md`, so a visit
with the gallery and music will exceed it. It streams progressively (it can
start before fully downloaded) but must not block the cover or event details.
The video clip must never preload (`preload="none"`). Every guest who plays it costs about
16 MB of hosting transfer. If that becomes a problem, host it as an unlisted
YouTube video and embed it only on click.
