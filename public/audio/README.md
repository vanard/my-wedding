# Invitation music

`music.mp3` is the complete audio track of the prewedding video clip
(`media-originals/VIDEO CLIP PREWEDDING GHEA & VIAN .mp4`, 1:51), converted without
trimming or other edits. It is set as `music.src` in `src/content/invitation.ts`.

- MP3, 128 kbps stereo, 44.1 kHz, metadata removed: about 1.8 MB.
- Not preloaded (`preload="none"`): it downloads only when a guest opens the invitation
  (which starts playback) or presses play. It loops, pauses while the guest is on another
  tab or app and resumes when they return (unless they had paused it), and pauses while
  the YouTube video clip plays.

To regenerate it (or after the video clip changes):

```sh
ffmpeg -i "media-originals/VIDEO CLIP PREWEDDING GHEA & VIAN .mp4" -vn -map 0:a:0 \
  -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/audio/music.mp3
```

To use a different song, replace the file (or set `music.src` to another file here).
`music.src: null` disables the player.
