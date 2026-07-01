const { getDb, isDbConfigured } = require('../db');

function handleFromEmail(email) {
  if (!email) return '@member';
  const local = email.split('@')[0] || 'member';
  return '@' + local.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
}

function formatMemberSince(dateValue) {
  if (!dateValue) return 'Just joined';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 'Just joined';
  return (
    'Member since ' +
    d.toLocaleDateString('en-UG', { month: 'short', year: 'numeric' })
  );
}

function formatUgx(amount) {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) return 'UGX ' + (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
  if (n >= 1_000) return 'UGX ' + Math.round(n / 1_000) + 'k';
  return 'UGX ' + n.toLocaleString('en-UG');
}

async function findUserRecord(sessionUser) {
  if (!isDbConfigured()) return null;

  const sql = getDb();
  const byId = sessionUser.userId;
  const byGoogle = sessionUser.googleId;
  const byEmail = sessionUser.email;

  if (byId && String(byId).includes('-')) {
    const rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, created_at
      FROM users WHERE id = ${byId} LIMIT 1
    `;
    if (rows.length) return rows[0];
  }

  if (byGoogle) {
    const rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, created_at
      FROM users WHERE google_id = ${byGoogle} LIMIT 1
    `;
    if (rows.length) return rows[0];
  }

  if (byEmail) {
    const rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, created_at
      FROM users WHERE email = ${byEmail} LIMIT 1
    `;
    if (rows.length) return rows[0];
  }

  return null;
}

async function buildProfile(sessionUser) {
  const row = await findUserRecord(sessionUser);

  const name = row?.display_name || sessionUser.name || 'KibbiSave member';
  const email = row?.email || sessionUser.email || '';
  const picture = row?.avatar_url || sessionUser.picture || null;
  const location = row?.location || 'Uganda';
  const memberSince = formatMemberSince(row?.created_at);

  // Savings stats — wire to groups/deposits tables when available
  const groups = 0;
  const causes = 0;
  const streakWeeks = 0;
  const totalSaved = 0;
  const interestEarned = 0;

  return {
    user: {
      id: row?.id || sessionUser.userId,
      email,
      name,
      picture,
      handle: handleFromEmail(email),
      location,
      memberSince,
    },
    stats: {
      groups,
      causes,
      streakWeeks,
      streakLabel: streakWeeks ? streakWeeks + 'wks' : '0wks',
      totalSaved,
      totalSavedLabel: formatUgx(totalSaved),
      totalSavedSub:
        totalSaved > 0 ? '▲ Saving this week' : 'Join a group to start saving',
      interestEarned,
      interestLabel: formatUgx(interestEarned),
      interestSub: interestEarned > 0 ? '5.6% p.a. rate' : 'Earn interest in a group',
      bestRank: groups > 0 ? '#—' : '—',
      bestRankSub: groups > 0 ? 'Your top group' : 'No groups yet',
      avgLead: groups > 0 ? '+0%' : '—',
      avgLeadSub: groups > 0 ? 'across ' + groups + ' groups' : 'across 0 groups',
    },
    badges: [
      { id: 'first-saver', name: 'First saver', unlocked: false },
      { id: 'streak', name: '8 week streak', unlocked: false },
      { id: 'leader', name: 'Group leader', unlocked: false },
      { id: '1m', name: '1M saved', unlocked: false },
      { id: 'top10', name: 'Top 10%', unlocked: false },
    ],
    activity: [],
    liveData: Boolean(row),
  };
}

module.exports = { buildProfile, handleFromEmail, findUserRecord };
