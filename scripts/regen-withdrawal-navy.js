const fs = require('fs');
const sharp = require('sharp');

(async () => {
  const svgPath = 'assets/illustrations/svg/20-withdrawal-success.svg';
  let svg = fs.readFileSync(svgPath, 'utf8');
  svg = svg
    .split('#1B66DB').join('#00008b')
    .split('#1b66db').join('#00008b')
    .split('#D9E8FB').join('#e8eaf8')
    .split('#d9e8fb').join('#e8eaf8')
    .split('#EAF2FC').join('#e8eaf8');
  fs.writeFileSync(svgPath, svg);
  fs.writeFileSync('public/assets/illustrations/svg/20-withdrawal-success.svg', svg);

  const buf = Buffer.from(svg);
  for (const png of [
    'assets/illustrations/png/20-withdrawal-success.png',
    'public/assets/illustrations/png/20-withdrawal-success.png',
  ]) {
    await sharp(buf)
      .resize(2048, 2048, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(png);
    console.log('wrote', png, fs.statSync(png).size);
  }

  let html = fs.readFileSync('kibbisave_home_final.html', 'utf8');
  html = html
    .replace(/home-auth-explore-\d+/g, 'home-auth-explore-3')
    .replace(
      /\/assets\/illustrations\/png\/20-withdrawal-success\.png(?:\?v=[^"']*)?/g,
      '/assets/illustrations/png/20-withdrawal-success.png?v=navy1'
    );
  fs.writeFileSync('kibbisave_home_final.html', html);
  fs.copyFileSync('kibbisave_home_final.html', 'public/kibbisave_home_final.html');
  console.log('cache-bust ok');
})();
