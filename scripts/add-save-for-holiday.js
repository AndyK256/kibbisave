const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const COMPANY = '#00008b';
const LIGHT = '#e8eaf8';
const src = '_graphics_preview4/images/svg/38-save-for-holiday.svg';

let svg = fs.readFileSync(src, 'utf8');
svg = svg
  .replace(/#1B66DB/gi, COMPANY)
  .replace(/#D9E8FB/gi, LIGHT)
  .replace(/#EAF2FC/gi, LIGHT)
  .replace(/#Bcd7f6/gi, COMPANY)
  .replace(/#bcd7f6/gi, COMPANY);

(async () => {
  for (const base of ['assets/illustrations', 'public/assets/illustrations']) {
    fs.mkdirSync(path.join(base, 'svg'), { recursive: true });
    fs.mkdirSync(path.join(base, 'png'), { recursive: true });
    fs.writeFileSync(path.join(base, 'svg', '38-save-for-holiday.svg'), svg);
    const pngPath = path.join(base, 'png', '38-save-for-holiday.png');
    await sharp(Buffer.from(svg))
      .resize(2048, 2048, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(pngPath);
    console.log('wrote', pngPath, fs.statSync(pngPath).size);
  }
})();
