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
      SELECT id, google_id, email, display_name, avatar_url, location, phone,
             first_name, last_name, district, nationality, nin,
             terms_accepted_at, profile_complete, created_at
      FROM users WHERE id = ${byId} LIMIT 1
    `;
    if (rows.length) return rows[0];
  }

  if (byGoogle) {
    const rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, phone,
             first_name, last_name, district, nationality, nin,
             terms_accepted_at, profile_complete, created_at
      FROM users WHERE google_id = ${byGoogle} LIMIT 1
    `;
    if (rows.length) return rows[0];
  }

  if (byEmail) {
    const rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, phone,
             first_name, last_name, district, nationality, nin,
             terms_accepted_at, profile_complete, created_at
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
  const phone = row?.phone || null;
  const memberSince = formatMemberSince(row?.created_at);

  // Savings stats — live from the groups tables (no interest, per spec)
  let groups = 0;
  let causes = 0;
  let totalSaved = 0;
  let avgLeadNum = 0;
  let bestRank = null;
  let activity = [];
  const streakWeeks = 0;

  if (row && isDbConfigured()) {
    try {
      const sql = getDb();
      const sums = await sql`SELECT * FROM user_home_summary WHERE user_id = ${row.id}`;
      if (sums.length) {
        totalSaved = Number(sums[0].total_savings) || 0;
        groups     = Number(sums[0].active_groups) || 0;
        avgLeadNum = Number(sums[0].avg_lead) || 0;
      }
      const best = await sql`
        SELECT MIN(rank_in_group) AS best FROM group_members
        WHERE user_id = ${row.id} AND status = 'active' AND rank_in_group IS NOT NULL
      `;
      bestRank = best.length ? best[0].best : null;
      const comms = await sql`
        SELECT COUNT(*)::int AS n FROM community_members WHERE user_id = ${row.id}
      `;
      causes = comms.length ? comms[0].n : 0;

      const recent = await sql`
        SELECT t.amount, t.status, t.provider, t.confirmed_at, t.initiated_at,
               g.name AS group_name, g.code AS group_code
        FROM transactions t
        LEFT JOIN groups g ON g.id = t.group_id
        WHERE t.user_id = ${row.id} AND t.entry_type = 'credit'
        ORDER BY COALESCE(t.confirmed_at, t.initiated_at) DESC
        LIMIT 5
      `;
      activity = recent.map(function (r) {
        const when = r.confirmed_at || r.initiated_at;
        const d = when ? new Date(when) : null;
        return {
          title: 'Deposit to ' + (r.group_name || r.group_code || 'group'),
          sub: r.provider || 'deposit',
          amount: formatUgx(r.amount),
          date: d && !Number.isNaN(d.getTime())
            ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
            : '',
        };
      });
    } catch (e) {
      // groups tables not migrated yet — keep zeros
      console.error('profile stats skipped:', e.message);
    }
  }

  return {
    user: {
      id: row?.id || sessionUser.userId,
      email,
      name,
      picture,
      phone,
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
        totalSaved > 0 ? '▲ Keep it up' : 'Join a group to start saving',
      // interest removed (spec) — these keys kept so old pages don't break
      interestEarned: 0,
      interestLabel: (avgLeadNum > 0 ? '+' : '') + avgLeadNum.toFixed(2) + '%',
      interestSub: groups > 0 ? 'average lead' : 'Join a group to get a lead',
      bestRank: bestRank ? '#' + bestRank : '—',
      bestRankSub: bestRank ? 'Your top group' : 'No groups yet',
      avgLead: groups > 0 ? (avgLeadNum > 0 ? '+' : '') + avgLeadNum.toFixed(2) + '%' : '—',
      avgLeadSub: groups > 0 ? 'across ' + groups + ' group' + (groups > 1 ? 's' : '') : 'across 0 groups',
    },
    badges: [
      { id: 'first-saver', name: 'First saver', unlocked: totalSaved > 0 },
      { id: 'streak', name: '8 week streak', unlocked: false },
      { id: 'leader', name: 'Group leader', unlocked: bestRank === 1 },
      { id: '1m', name: '1M saved', unlocked: totalSaved >= 1000000 },
      { id: 'top10', name: 'Top 10%', unlocked: false },
    ],
    activity,
    liveData: Boolean(row),
  };
}

module.exports = { buildProfile, handleFromEmail, findUserRecord };
