const fs = require('fs');

fs.copyFileSync('css/kibbisave-site.css', 'public/css/kibbisave-site.css');
fs.copyFileSync('css/kibbisave-home.css', 'public/css/kibbisave-home.css');
fs.copyFileSync('css/kibbisave-auth.css', 'public/css/kibbisave-auth.css');

const ver = 'brand-blue-1';
const pairs = [
  ['kibbisave_home_final.html', 'public/kibbisave_home_final.html'],
  ['kibbisave_groups_v6.html', 'public/kibbisave_groups_v6.html'],
  ['kibbisave_community_explore.html', 'public/kibbisave_community_explore.html'],
  ['kibbisave_profile_screen.html', 'public/kibbisave_profile_screen.html'],
  ['login.html', 'public/login.html'],
];

function bump(file) {
  if (!fs.existsSync(file)) return;
  let h = fs.readFileSync(file, 'utf8');
  h = h.replace(/css\/kibbisave-site\.css(?:\?v=[^"']*)?/g, 'css/kibbisave-site.css?v=' + ver);
  h = h.replace(/css\/kibbisave-home\.css(?:\?v=[^"']*)?/g, 'css/kibbisave-home.css?v=' + ver);
  h = h.replace(/css\/kibbisave-auth\.css(?:\?v=[^"']*)?/g, 'css/kibbisave-auth.css?v=' + ver);
  fs.writeFileSync(file, h);
  console.log('bumped', file);
}

for (const [a, b] of pairs) {
  bump(a);
  bump(b);
}

// Ensure dark-theme cream hovers weren't flattened to navy
let site = fs.readFileSync('css/kibbisave-site.css', 'utf8');
site = site.replace(
  /(--kb-primary:\s*#f5f0e8;\s*\n\s*--kb-primary-hover:\s*)#00008b(;\s*\n\s*--kb-primary-dark:\s*)#00008b/g,
  '$1#f7f3eb$2#e8e0d4'
);
fs.writeFileSync('css/kibbisave-site.css', site);
fs.writeFileSync('public/css/kibbisave-site.css', site);
console.log('dark theme hover check ok');
