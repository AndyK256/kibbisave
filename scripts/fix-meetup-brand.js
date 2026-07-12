const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const COMPANY = '#00008b';

(async () => {
  for (const base of ['assets/illustrations', 'public/assets/illustrations']) {
    const svgPath = path.join(base, 'svg', '33-community-meetup.svg');
    let svg = fs.readFileSync(svgPath, 'utf8');
    svg = svg
      .replace(/#Bcd7f6/gi, COMPANY)
      .replace(/#bcd7f6/gi, COMPANY)
      .replace(/#D9E8FB/gi, COMPANY)
      .replace(/#EAF2FC/gi, COMPANY)
      .replace(/#e8eaf8/gi, COMPANY);
    fs.writeFileSync(svgPath, svg);
    const pngPath = path.join(base, 'png', '33-community-meetup.png');
    await sharp(Buffer.from(svg))
      .resize(2048, 2048, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(pngPath);
    console.log('updated', pngPath);
  }
  const s = fs.readFileSync('assets/illustrations/svg/33-community-meetup.svg', 'utf8');
  const m = {};
  [...s.matchAll(/#[0-9A-Fa-f]{3,8}/g)].forEach((x) => {
    const c = x[0].toLowerCase();
    m[c] = (m[c] || 0) + 1;
  });
  console.log(m);
})();
