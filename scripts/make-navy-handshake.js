const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'illustrations', 'svg', '02-join-group-handshake.svg');
let svg = fs.readFileSync(src, 'utf8')
  .replace(/#1B66DB/gi, '#00008b')
  .replace(/#D9E8FB/gi, '#e8eaf8');

const targets = [
  path.join(root, 'assets', 'illustrations'),
  path.join(root, 'public', 'assets', 'illustrations'),
];

(async () => {
  for (const base of targets) {
    fs.writeFileSync(path.join(base, 'svg', '02-join-group-handshake-navy.svg'), svg);
    await sharp(Buffer.from(svg)).png().resize(2048, 2048)
      .toFile(path.join(base, 'png', '02-join-group-handshake-navy.png'));
  }
  console.log('navy handshake assets ready');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
