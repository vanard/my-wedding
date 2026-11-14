// Builds the 1200×630 link-preview image (WhatsApp, Instagram, …) from one photo: the photo,
// trimmed top and bottom to at most 4:5 so a portrait shot is not too tall, centred over a
// blurred and darkened copy of itself.
// Usage: npm run media:preview [-- <photo> [vertical position 0–1, default 0.45]]
import sharp from 'sharp';

const source = process.argv[2] ?? 'src/assets/media/album/img_4303.jpg';
const position = Number(process.argv[3] ?? 0.45);
const target = 'src/assets/media/link-preview.jpg';
const W = 1200, H = 630, TALLEST = 5 / 4;

const { width = 0, height = 0 } = await sharp(source).metadata();
const keep = Math.min(height, Math.round(width * TALLEST));
const trimmed = await sharp(source)
  .extract({ left: 0, top: Math.round((height - keep) * position), width, height: keep })
  .toBuffer();

const background = await sharp(trimmed).resize(W, H, { fit: 'cover' }).blur(28).modulate({ brightness: 0.55 }).toBuffer();
const photo = await sharp(trimmed).resize(W, H, { fit: 'inside' }).toBuffer();
const size = await sharp(photo).metadata();
const info = await sharp(background)
  .composite([{ input: photo, left: Math.round((W - (size.width ?? W)) / 2), top: Math.round((H - (size.height ?? H)) / 2) }])
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(target);
console.log(`${source} -> ${target}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
