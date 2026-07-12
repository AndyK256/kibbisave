const fs = require('fs');
const path = require('path');

const BRAND = '#00008b';
const MAP = {
  '#0000a8': BRAND,
  '#0000A8': BRAND,
  '#000070': BRAND,
  '#000078': BRAND,
  '#00005c': BRAND,
  '#00005C': BRAND,
  '#0a0a4a': BRAND,
  '#0A0A4A': BRAND,
  '#48cae4': BRAND,
  '#48CAE4': BRAND,
};

const roots = [
  'css',
  'public/css',
  'js',
  'public/js',
];

const htmlFiles = [
  'kibbisave_home_final.html',
  'public/kibbisave_home_final.html',
  'kibbisave_groups_v6.html',
  'public/kibbisave_groups_v6.html',
  'kibbisave_community_explore.html',
  'public/kibbisave_community_explore.html',
  'kibbisave_profile_screen.html',
  'public/kibbisave_profile_screen.html',
  'kibbisave_leaderboard_v5.html',
  'public/kibbisave_leaderboard_v5.html',
  'kibbisave_deposit_v2.html',
  'public/kibbisave_deposit_v2.html',
  'kibbisave_create_group_v2.html',
  'public/kibbisave_create_group_v2.html',
  'kibbisave_join_group.html',
  'public/kibbisave_join_group.html',
  'kibbisave_my_group_detail_v2.html',
  'public/kibbisave_my_group_detail_v2.html',
  'kibbisave_cause_detail.html',
  'public/kibbisave_cause_detail.html',
  'login.html',
  'public/login.html',
  'signup.html',
  'public/signup.html',
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(css|js)$/i.test(e.name)) out.push(p);
  }
}

const files = [];
roots.forEach((r) => walk(r, files));
htmlFiles.forEach((f) => {
  if (fs.existsSync(f)) files.push(f);
});

let touched = 0;
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  // Don't recolor Google logo brand blues in login SVGs
  const parts = s.split(/(<path fill="#1976D2"[^>]*>)/i);
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    if (/^<path fill="#1976D2"/i.test(parts[i])) continue;
    let chunk = parts[i];
    const before = chunk;
    for (const [from, to] of Object.entries(MAP)) {
      chunk = chunk.split(from).join(to);
    }
    // CSS var fallbacks / definitions
    chunk = chunk.replace(/--kb-primary-hover:\s*#[0-9a-fA-F]{6}/g, `--kb-primary-hover: ${BRAND}`);
    chunk = chunk.replace(/--kb-primary-dark:\s*#[0-9a-fA-F]{6}/g, `--kb-primary-dark: ${BRAND}`);
    chunk = chunk.replace(/--kb-heading:\s*#0a0a4a/gi, `--kb-heading: ${BRAND}`);
    if (chunk !== before) {
      parts[i] = chunk;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, parts.join(''));
    touched++;
    console.log('updated', file);
  }
}

console.log('files touched', touched);
