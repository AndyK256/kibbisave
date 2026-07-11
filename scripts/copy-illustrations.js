const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, '_graphics_preview', 'images');
const dest = path.join(root, 'public', 'assets', 'illustrations');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(from, to) {
  ensureDir(to);
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

ensureDir(dest);
copyDir(path.join(src, 'png'), path.join(dest, 'png'));
copyDir(path.join(src, 'svg'), path.join(dest, 'svg'));
fs.copyFileSync(path.join(src, 'PLACEMENT-GUIDE.md'), path.join(dest, 'PLACEMENT-GUIDE.md'));

// Vercel serves the repo root; mirror so /assets/... resolves in production too.
const rootAssets = path.join(root, 'assets', 'illustrations');
copyDir(path.join(dest, 'png'), path.join(rootAssets, 'png'));
copyDir(path.join(dest, 'svg'), path.join(rootAssets, 'svg'));
fs.copyFileSync(path.join(dest, 'PLACEMENT-GUIDE.md'), path.join(rootAssets, 'PLACEMENT-GUIDE.md'));

const png = fs.readdirSync(path.join(dest, 'png')).length;
const svg = fs.readdirSync(path.join(dest, 'svg')).length;
console.log('Copied illustrations: png=' + png + ' svg=' + svg);
