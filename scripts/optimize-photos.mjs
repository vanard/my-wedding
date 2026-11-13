// Turns camera photos in media-originals/ into web-ready masters in src/assets/media/.
// Usage: npm run media:photos  (re-running overwrites outputs; originals are never changed)
//
// - Resizes to at most 2400 px on the long edge. The site's largest generated
//   size is 1400 px wide, so this keeps headroom without shipping 24 MP files.
// - Applies EXIF orientation, converts to sRGB, and strips all metadata
//   (EXIF/XMP/IPTC: camera, timestamps, any GPS location).
// - Saves high-quality JPEG; Astro generates the AVIF/WebP that guests download.
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, relative, parse, dirname } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'media-originals';
const TARGET = 'src/assets/media';
const LONG_EDGE = 2400;
const PHOTO = /\.(jpe?g|png|tiff?|webp|heic|heif)$/i;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (PHOTO.test(entry.name)) yield path;
  }
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
let before = 0;
let after = 0;

for await (const input of walk(SOURCE)) {
  const rel = relative(SOURCE, input);
  const { dir, name } = parse(rel);
  const output = join(TARGET, dir, `${name.toLowerCase()}.jpg`);
  await mkdir(dirname(output), { recursive: true });

  const info = await sharp(input)
    .rotate()
    .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
    .toColorspace('srgb')
    .jpeg({ quality: 86, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(output);

  const original = (await stat(input)).size;
  before += original;
  after += info.size;
  console.log(`${rel} -> ${relative(TARGET, output)}  ${info.width}x${info.height}  ${kb(original)} -> ${kb(info.size)}`);
}

console.log(`\nTotal: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
