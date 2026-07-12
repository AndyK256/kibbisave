const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const srcSvg = '_graphics_preview3/images/svg/33-community-meetup.svg';
let svg = fs.readFileSync(srcSvg, 'utf8');
svg = svg
  .split('#1B66DB').join('#00008b')
  .split('#1b66db').join('#00008b')
  .split('#D9E8FB').join('#e8eaf8')
  .split('#d9e8fb').join('#e8eaf8')
  .split('#EAF2FC').join('#e8eaf8');

const targets = [
  'assets/illustrations',
  'public/assets/illustrations',
];

(async () => {
  for (const base of targets) {
    fs.mkdirSync(path.join(base, 'svg'), { recursive: true });
    fs.mkdirSync(path.join(base, 'png'), { recursive: true });
    const svgPath = path.join(base, 'svg', '33-community-meetup.svg');
    const pngPath = path.join(base, 'png', '33-community-meetup.png');
    fs.writeFileSync(svgPath, svg);
    await sharp(Buffer.from(svg))
      .resize(2048, 2048, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(pngPath);
    console.log('wrote', pngPath, fs.statSync(pngPath).size);
  }
  console.log('navy count', (svg.match(/#00008b/gi) || []).length);
})();
