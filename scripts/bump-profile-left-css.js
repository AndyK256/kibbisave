const fs = require('fs');

fs.copyFileSync('css/kibbisave-site.css', 'public/css/kibbisave-site.css');
console.log('synced css');

const files = [
  'kibbisave_home_final.html',
  'public/kibbisave_home_final.html',
  'kibbisave_groups_v6.html',
  'public/kibbisave_groups_v6.html',
  'kibbisave_community_explore.html',
  'public/kibbisave_community_explore.html',
  'kibbisave_leaderboard_v5.html',
  'public/kibbisave_leaderboard_v5.html',
  'kibbisave_profile_screen.html',
  'public/kibbisave_profile_screen.html',
  'kibbisave_deposit_v2.html',
  'public/kibbisave_deposit_v2.html',
  'login.html',
  'public/login.html',
];

const re = /css\/kibbisave-site\.css(?:\?v=[^"']*)?/g;
const next = 'css/kibbisave-site.css?v=profile-from-left-1';

files.forEach((f) => {
  if (!fs.existsSync(f)) return;
  const s = fs.readFileSync(f, 'utf8');
  const n = s.replace(re, next);
  if (n !== s) {
    fs.writeFileSync(f, n);
    console.log('bumped', f);
  } else {
    console.log('unchanged', f);
  }
});
