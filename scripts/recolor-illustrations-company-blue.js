const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const bases = [
  path.join(root, 'assets', 'illustrations'),
  path.join(root, 'public', 'assets', 'illustrations'),
];

const COMPANY_BLUE = '#00008b';
const COMPANY_LIGHT = '#e8eaf8';

function recolorSvg(svg) {
  return svg
    .replace(/#1B66DB/gi, COMPANY_BLUE)
    .replace(/#1b66db/gi, COMPANY_BLUE)
    .replace(/#D9E8FB/gi, COMPANY_LIGHT)
    .replace(/#d9e8fb/gi, COMPANY_LIGHT);
}

(async () => {
  let svgCount = 0;
  let pngCount = 0;

  for (const base of bases) {
    const svgDir = path.join(base, 'svg');
    const pngDir = path.join(base, 'png');
    fs.mkdirSync(pngDir, { recursive: true });

    const files = fs.readdirSync(svgDir).filter((f) => f.endsWith('.svg'));
    for (const file of files) {
      const svgPath = path.join(svgDir, file);
      const raw = fs.readFileSync(svgPath, 'utf8');
      const colored = recolorSvg(raw);
      if (colored !== raw) {
        fs.writeFileSync(svgPath, colored);
        svgCount += 1;
      } else if (!/#00008b/i.test(raw)) {
        // Already navy variant or no pack blue — still ensure write if needed
        fs.writeFileSync(svgPath, colored);
      }

      const pngName = file.replace(/\.svg$/i, '.png');
      const pngPath = path.join(pngDir, pngName);
      await sharp(Buffer.from(colored)).png().resize(2048, 2048).toFile(pngPath);
      pngCount += 1;
      process.stdout.write('ok ' + path.relative(root, pngPath) + '\n');
    }
  }

  console.log('Done. SVGs updated: ' + svgCount + ', PNGs regenerated: ' + pngCount);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
