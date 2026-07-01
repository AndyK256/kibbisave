import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'assets', 'kibbisave.jpg');
const bgOut = join(root, 'public', 'assets', 'kibbisave.jpg');
const ogOut = join(root, 'public', 'assets', 'kibbisave-og.jpg');
const iconOut = join(root, 'public', 'assets', 'kibbisave-icon.jpg');

const ICON_CROP = { left: 185, top: 5, width: 575, height: 530 };
const BRAND_BLUE = { r: 0, g: 0, b: 139 };

const input = readFileSync(src);

// Icon mark: same crop used in header + OG preview
const iconBuffer = await sharp(input)
  .extract(ICON_CROP)
  .resize(128, 128, { fit: 'inside' })
  .jpeg({ quality: 92, mozjpeg: true })
  .toBuffer();
writeFileSync(iconOut, iconBuffer);

const inputForBg = readFileSync(src);

// Background: optimize in place (keep full logo, smaller file)
const bgBuffer = await sharp(inputForBg)
  .jpeg({ quality: 82, mozjpeg: true })
  .toBuffer();
writeFileSync(bgOut, bgBuffer);

// OG / social: 1200×630 — cropped icon centred on KibbiSave blue (matches site logo)
const markForOg = await sharp(input)
  .extract(ICON_CROP)
  .resize(500, 500, { fit: 'inside' })
  .toBuffer();

const ogBuffer = await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 3,
    background: BRAND_BLUE,
  },
})
  .composite([{ input: markForOg, gravity: 'centre' }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();
writeFileSync(ogOut, ogBuffer);

console.log(`icon: ${iconBuffer.length} bytes`);
console.log(`background: ${bgBuffer.length} bytes`);
console.log(`og image: ${ogBuffer.length} bytes`);
