const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, '_graphics_preview', 'images');
const dest = path.join(root, 'public', 'assets', 'illustrations');
const rootAssets = path.join(root, 'assets', 'illustrations');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function emptyDir(p) {
  if (!fs.existsSync(p)) return;
  for (const name of fs.readdirSync(p)) {
    const full = path.join(p, name);
    if (fs.statSync(full).isDirectory()) {
      emptyDir(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

function copyDir(from, to) {
  ensureDir(to);
  emptyDir(to);
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(path.join(src, 'svg'))) {
  console.error('Missing canonical source:', src);
  process.exit(1);
}

ensureDir(dest);
copyDir(path.join(src, 'png'), path.join(dest, 'png'));
copyDir(path.join(src, 'svg'), path.join(dest, 'svg'));
fs.copyFileSync(path.join(src, 'PLACEMENT-GUIDE.md'), path.join(dest, 'PLACEMENT-GUIDE.md'));

// Vercel serves the repo root; mirror so /assets/... resolves in production too.
ensureDir(rootAssets);
copyDir(path.join(dest, 'png'), path.join(rootAssets, 'png'));
copyDir(path.join(dest, 'svg'), path.join(rootAssets, 'svg'));
fs.copyFileSync(path.join(dest, 'PLACEMENT-GUIDE.md'), path.join(rootAssets, 'PLACEMENT-GUIDE.md'));

const png = fs.readdirSync(path.join(dest, 'png')).filter((f) => f.endsWith('.png')).length;
const svg = fs.readdirSync(path.join(dest, 'svg')).filter((f) => f.endsWith('.svg')).length;
console.log('Copied illustrations from _graphics_preview: png=' + png + ' svg=' + svg);
if (png !== svg) {
  console.warn('Warning: png/svg counts differ. Prefer regenerating PNGs via scripts/recolor-illustrations-company-blue.js');
}
