// ============================================================
// KIBBISAVE — GROUPS + HOME API (Neon)
// GET  /api/home                 own summary (optional auth)
// GET  /api/users/:id/home       public social snapshot (no auth)
// POST /api/groups/:id/join      join an open group (login required)
// POST /api/deposits             record + confirm deposit (dev mode)
// GET  /api/cron                 30-min recalculation (Vercel Cron)
// ============================================================
const express = require('express');
const { getDb, isDbConfigured } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { findUserRecord } = require('../lib/profile');

const router = express.Router();

const EMPTY_SUMMARY = {
  total_savings: 0, active_groups: 0, total_goal: 0,
  pct_reached: 0, avg_lead: 0, next_end_date: null, account_number: null
};

const PUBLIC_SUMMARY = {
  total_savings: 0, active_groups: 0, total_goal: 0,
  pct_reached: 0, avg_lead: 0, next_end_date: null
};

// Community creator may read/write a group chat when a community member
// of theirs is active in that group (even if creator is not a group member).
async function canAccessGroupMessages(sql, userId, groupId, communityId) {
  const membership = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_id = ${userId} AND status = 'active'
    LIMIT 1
  `;
  if (membership.length) return { ok: true, via: 'member' };
  if (!communityId) return { ok: false };

  const creator = await sql`
    SELECT 1 FROM communities c
    WHERE c.id = ${communityId}
      AND c.created_by = ${userId}
      AND EXISTS (
        SELECT 1 FROM group_members gm
        JOIN community_members cm
          ON cm.user_id = gm.user_id AND cm.community_id = c.id
        WHERE gm.group_id = ${groupId} AND gm.status = 'active'
      )
    LIMIT 1
  `;
  return { ok: creator.length > 0, via: creator.length ? 'community_creator' : null };
}

// UUID v4-ish (Neon user ids). Reject junk before hitting the DB.
function isUserId(id) {
  return typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// friendly message out of a Postgres RAISE EXCEPTION
function dbMessage(err) {
  return (err && err.message ? err.message : 'Database error').replace(/^.*?: /, '');
}

// ------------------------------------------------------------
// GET /api/home
// Speed: independent queries run in PARALLEL (each Neon query is
// one HTTP round-trip), and the open-group sweep runs at most
// once per 5 minutes per warm instance (cron covers the rest).
// ------------------------------------------------------------
let lastSweep = 0;
const SWEEP_MS = 5 * 60 * 1000;

router.get('/home', optionalAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) {
      return res.json({
        authenticated: Boolean(req.user),
        summary: EMPTY_SUMMARY, my_groups: [], open_groups: [],
        notice: 'Database not configured'
      });
    }
    const sql = getDb();

    // keep the 5 open groups fresh — throttled (close due + refill open slots)
    // Both RPCs are optional: missing migration must not 500 the home page.
    if (Date.now() - lastSweep > SWEEP_MS) {
      lastSweep = Date.now();
      // Day rollover: bump start/close for empty open system groups (no members).
      // Works even before SQL functions are re-applied.
      await sql`
        UPDATE groups
        SET starts_at = CURRENT_DATE::timestamptz,
            closes_at = (CURRENT_DATE + (period_months || ' months')::INTERVAL)::timestamptz,
            updated_at = NOW()
        WHERE is_system = TRUE
          AND status = 'open'
          AND COALESCE(current_members, 0) = 0
          AND first_member_at IS NULL
          AND starts_at::date < CURRENT_DATE
      `.catch(function (e) {
        console.warn('empty open-group date refresh skipped:', e.message);
      });
      await sql`SELECT close_due_groups()`.catch(function (e) {
        console.warn('close_due_groups skipped:', e.message);
      });
      await sql`SELECT ensure_open_groups()`.catch(function (e) {
        console.warn('ensure_open_groups skipped:', e.message);
      });
    }

    // independent queries in parallel
    const [openGroups, topCommunityRows, saversRows, userRow] = await Promise.all([
      sql`
        SELECT id, code, name, period_months, tier, current_members, max_members,
               target_amount, total_saved, target_pct, starts_at, closes_at,
               first_member_at, avg_member_lead, is_private, created_at
        FROM groups
        WHERE is_system = TRUE AND status = 'open'
        ORDER BY COALESCE(current_members, 0) DESC, period_months ASC, tier ASC NULLS FIRST
      `.catch(function (e) {
        console.warn('open_groups query skipped:', e.message);
        return [];
      }),
      sql`
        SELECT c.id, c.name, c.icon,
               COALESCE(t.total_members, 0) AS total_members
        FROM communities c
        LEFT JOIN community_totals t ON t.community_id = c.id
        WHERE c.is_public = TRUE
        ORDER BY COALESCE(t.total_members, 0) DESC, c.created_at DESC
        LIMIT 1
      `.catch(function () { return []; }),   // fine if communities not migrated yet
      sql`
        SELECT COUNT(DISTINCT user_id)::int AS savers
        FROM transactions
        WHERE entry_type = 'credit' AND status = 'confirmed'
      `.catch(function () { return [{ savers: 0 }]; }),
      req.user ? findUserRecord(req.user) : Promise.resolve(null)
    ]);

    const payload = {
      authenticated: false,
      summary: { ...EMPTY_SUMMARY, week_total: 0 },
      my_groups: [],
      my_private_groups: [],
      open_groups: openGroups,
      top_community: (topCommunityRows && topCommunityRows.length) ? topCommunityRows[0] : null,
      savers_count: (saversRows && saversRows[0] && Number(saversRows[0].savers)) || 0
    };

    if (userRow) {
      payload.authenticated = true;
      payload.summary.account_number = userRow.phone
        ? String(userRow.phone).replace('+256', '0')
        : null;

      // user-specific queries in parallel too
      const [sums, myGroups, week] = await Promise.all([
        sql`SELECT * FROM user_home_summary WHERE user_id = ${userRow.id}`
          .catch(function () { return []; }),
        sql`
          SELECT ugs.*,
            COALESCE((
              SELECT COUNT(*)::int FROM group_messages gm
              WHERE gm.group_id = ugs.group_id
                AND gm.user_id <> ${userRow.id}
                AND gm.created_at > COALESCE(
                  (SELECT messages_last_read_at FROM group_members
                   WHERE group_id = ugs.group_id AND user_id = ${userRow.id}
                   LIMIT 1),
                  '1970-01-01'::timestamptz
                )
            ), 0) AS unread_count
          FROM user_group_standings ugs
          WHERE ugs.user_id = ${userRow.id}
          ORDER BY ugs.starts_at DESC
        `.catch(function () {
          return sql`SELECT * FROM user_group_standings WHERE user_id = ${userRow.id}
              ORDER BY starts_at DESC`.catch(function () { return []; });
        }),
        sql`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
            WHERE user_id = ${userRow.id} AND entry_type = 'credit'
              AND status = 'confirmed'
              AND confirmed_at > NOW() - INTERVAL '7 days'`
          .catch(function () { return [{ total: 0 }]; })
      ]);

      if (sums.length) {
        const s = sums[0];
        payload.summary.total_savings = Number(s.total_savings) || 0;
        payload.summary.active_groups = Number(s.active_groups) || 0;
        payload.summary.total_goal    = Number(s.total_goal) || 0;
        payload.summary.pct_reached   = Number(s.pct_reached) || 0;
        payload.summary.avg_lead      = Number(s.avg_lead) || 0;
        payload.summary.next_end_date = s.next_end_date;
      }
      payload.my_groups = (myGroups || []).map(function (g) {
        const unread = Number(g.unread_count) || 0;
        return Object.assign({}, g, {
          unread_count: unread,
          has_unread: unread > 0
        });
      });
      payload.my_private_groups = payload.my_groups.filter(function (g) {
        return g.is_private === true;
      });
      payload.summary.week_total = week.length ? Number(week[0].total) || 0 : 0;
    }

    res.json(payload);
  } catch (err) {
    console.error('GET /api/home error:', err);
    // Prefer an empty successful payload over a cryptic 500 for the home UI
    res.status(200).json({
      authenticated: Boolean(req.user),
      summary: { ...EMPTY_SUMMARY, week_total: 0 },
      my_groups: [],
      open_groups: [],
      top_community: null,
      savers_count: 0,
      notice: 'Home data temporarily unavailable'
    });
  }
});

// ------------------------------------------------------------
// GET /api/users/:id/home — PUBLIC member social snapshot
// No auth. Omits account number, deposit/week history, payment
// methods, private groups, and private profile settings.
// Shows: name, avatar, totals, goal %, avg lead, public groups.
// ------------------------------------------------------------
router.get('/users/:id/home', async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!isUserId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const sql = getDb();

    // Public groups only — private memberships and their amounts stay private.
    // Summary is derived from these rows so private totals never leak.
    const [users, groups] = await Promise.all([
      sql`
        SELECT id, display_name, avatar_url
        FROM users WHERE id = ${userId} LIMIT 1
      `,
      sql`
        SELECT group_id, group_name, group_code, total_deposited, goal_amount,
               saving_for, target_pct, avg_lead, rank_in_group, prev_rank,
               current_members, max_members, target_amount, starts_at, closes_at,
               ends_at, period_months, status
        FROM user_group_standings
        WHERE user_id = ${userId}
          AND COALESCE(is_private, FALSE) = FALSE
          AND status IN ('open', 'active', 'locked', 'completed')
        ORDER BY starts_at DESC NULLS LAST
      `.catch(function () { return []; })
    ]);

    if (!users.length) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const u = users[0];
    const active = groups.filter(function (g) {
      return g.status === 'open' || g.status === 'active' || g.status === 'locked';
    });
    const rows = active.length ? active : groups;
    let totalSavings = 0;
    let totalGoal = 0;
    let leadSum = 0;
    let leadN = 0;
    let nextEnd = null;
    rows.forEach(function (g) {
      totalSavings += Number(g.total_deposited) || 0;
      totalGoal += Number(g.goal_amount) || 0;
      if (g.avg_lead != null && isFinite(Number(g.avg_lead))) {
        leadSum += Number(g.avg_lead);
        leadN += 1;
      }
      const end = g.ends_at || g.closes_at;
      if (end && (!nextEnd || new Date(end) < new Date(nextEnd))) nextEnd = end;
    });

    const summary = {
      ...PUBLIC_SUMMARY,
      total_savings: totalSavings,
      active_groups: active.length,
      total_goal: totalGoal,
      pct_reached: totalGoal > 0
        ? Math.round((totalSavings / totalGoal) * 10000) / 100
        : 0,
      avg_lead: leadN ? Math.round((leadSum / leadN) * 100) / 100 : 0,
      next_end_date: nextEnd
    };

    res.json({
      public: true,
      user: {
        id: u.id,
        display_name: u.display_name || 'KibbiSave member',
        avatar_url: u.avatar_url || null
      },
      summary,
      // Alias used by the home renderer (same shape as /api/home my_groups)
      my_groups: groups
      // Omitted on purpose: account_number, week_total, open_groups,
      // history, phone, email, payment methods, private groups
    });
  } catch (err) {
    console.error('GET /api/users/:id/home error:', err);
    res.status(500).json({ error: 'Failed to load member home' });
  }
});

// ------------------------------------------------------------
// GET /api/groups/mine — groups created or joined (full history)
// life_status: alive = open/active/locked; dead = completed/expired
// ------------------------------------------------------------
router.get('/groups/mine', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ groups: [] });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const groups = await sql`
      SELECT g.id, g.code, g.name, g.period_months, g.status, g.is_private,
             g.anyone_can_join, g.current_members, g.max_members, g.total_saved,
             g.created_at, g.created_by, g.is_system,
             (g.created_by = ${row.id}) AS is_creator,
             CASE
               WHEN g.status IN ('completed', 'expired') THEN 'dead'
               ELSE 'alive'
             END AS life_status,
             (
               g.created_by = ${row.id}
               AND COALESCE(g.is_system, FALSE) = FALSE
               AND g.status NOT IN ('completed', 'expired')
             ) AS can_delete
      FROM groups g
      WHERE COALESCE(g.is_system, FALSE) = FALSE
        AND (
          g.created_by = ${row.id}
          OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = g.id AND gm.user_id = ${row.id}
          )
        )
      ORDER BY
        CASE WHEN g.status IN ('completed', 'expired') THEN 1 ELSE 0 END,
        g.created_at DESC
    `;
    res.json({ groups });
  } catch (err) {
    console.error('groups mine error:', err.message);
    res.status(500).json({ error: 'Failed to load your groups' });
  }
});

// ------------------------------------------------------------
// DELETE /api/groups/:id — creator only, alive non-system groups
// ------------------------------------------------------------
router.delete('/groups/:id', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const rows = await sql`
      SELECT id, created_by, status, is_system, name
      FROM groups WHERE id = ${req.params.id} LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    const group = rows[0];
    if (String(group.created_by) !== String(row.id)) {
      return res.status(403).json({ error: 'Only the group creator can delete it' });
    }
    if (group.is_system) {
      return res.status(403).json({ error: 'System open groups cannot be deleted' });
    }
    if (group.status === 'completed' || group.status === 'expired') {
      return res.status(400).json({ error: 'Finished groups cannot be deleted' });
    }

    await sql`DELETE FROM transactions WHERE group_id = ${group.id}`;
    await sql`DELETE FROM group_members WHERE group_id = ${group.id}`;
    try {
      await sql`DELETE FROM group_messages WHERE group_id = ${group.id}`;
    } catch (_) { /* table may not exist */ }
    await sql`DELETE FROM groups WHERE id = ${group.id}`;

    res.json({ success: true });
  } catch (err) {
    console.error('delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ------------------------------------------------------------
// GET /api/groups/:id — group detail with ranked members.
// Spec: anyone can open a group without logging in.
// ------------------------------------------------------------
router.get('/groups/:id', optionalAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const sql = getDb();

    // all three lookups in parallel (speed)
    const [groups, members, row] = await Promise.all([
      sql`
        SELECT id, name, code, is_private, is_system, period_months, tier,
               target_amount, total_saved, target_pct, status, max_members,
               current_members, first_member_at, starts_at, closes_at, created_at,
               leaderboard_rank, leaderboard_prev_rank, avg_member_lead
        FROM groups WHERE id = ${req.params.id} LIMIT 1
      `,
      sql`
        SELECT gm.user_id, gm.goal_amount, gm.saving_for, gm.total_deposited,
               gm.target_pct, gm.avg_lead, gm.rank_in_group, gm.prev_rank,
               gm.joined_at, gm.ends_at, u.display_name, u.avatar_url
        FROM group_members gm JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ${req.params.id} AND gm.status = 'active'
        ORDER BY COALESCE(gm.rank_in_group, 999), gm.joined_at ASC
      `,
      req.user ? findUserRecord(req.user) : Promise.resolve(null)
    ]);
    if (!groups.length) return res.status(404).json({ error: 'Group not found' });

    const isMember = row
      ? members.some(function (m) { return m.user_id === row.id; })
      : false;

    // Optional community-creator override for messaging (query: community_creator)
    let creatorAccess = false;
    const communityId = String(req.query.community_creator || '').trim();
    if (!isMember && row && communityId) {
      const access = await canAccessGroupMessages(sql, row.id, req.params.id, communityId);
      creatorAccess = access.ok;
    }

    res.json({
      group: groups[0],
      members,
      is_member: isMember,
      community_creator_access: creatorAccess,
      authenticated: Boolean(req.user),
    });
  } catch (err) {
    console.error('group detail error:', err);
    res.status(500).json({ error: 'Failed to load group' });
  }
});

// ------------------------------------------------------------
// GET /api/leaderboard — only CLOSED public groups are ranked (spec)
// Closed = status active/locked/completed (full at 10, or 7-day close).
// Excludes private groups and legacy seed rows (null period_months).
// ------------------------------------------------------------
router.get('/leaderboard', async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ groups: [] });
    const sql = getDb();
    const groups = await sql`
      SELECT id, name, code, period_months, tier, current_members, max_members,
             total_saved, target_amount, target_pct, avg_member_lead,
             leaderboard_rank, leaderboard_prev_rank, status, starts_at, closes_at
      FROM groups
      WHERE status IN ('active','locked','completed')
        AND leaderboard_rank IS NOT NULL
        AND COALESCE(is_private, FALSE) = FALSE
        AND period_months IS NOT NULL
      ORDER BY leaderboard_rank ASC
      LIMIT 50
    `;
    res.json({ groups });
  } catch (err) {
    console.error('leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// ------------------------------------------------------------
// POST /api/groups — create a PRIVATE group (spec)
// { name, period_months, anyone_can_join, community_ids }
// Share link is compulsory — returned with the joining code.
// ------------------------------------------------------------
router.post('/groups', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const { name, period_months, anyone_can_join } = req.body || {};
    const months = Number(period_months);
    if ([3, 5, 8, 12].indexOf(months) === -1) {
      return res.status(400).json({ error: 'Pick a period of 3, 5, 8 or 12 months' });
    }
    const groupName = String(name || '').trim().slice(0, 10); // spec: max 10 chars
    if (!groupName) return res.status(400).json({ error: 'Group name is required' });

    const sql = getDb();
    const durationType = months + 'M';
    const durationDays = months * 30;
    const inserted = await sql`
      INSERT INTO groups (created_by, name, name_locked, is_private, is_system,
                          period_months, duration_type, duration_days, target_amount,
                          anyone_can_join, starts_at, closes_at, status)
      VALUES (${row.id}, ${groupName}, TRUE, TRUE, FALSE,
              ${months}, ${durationType}, ${durationDays}, 0,
              ${anyone_can_join !== false}, NOW(),
              NOW() + ${months}::int * INTERVAL '1 month', 'open')
      RETURNING id, name, code, period_months, anyone_can_join
    `;
    const g = inserted[0];
    res.json({
      success: true,
      group: g,
      joining_code: g.code,
      share_link: '/kibbisave_join_group.html?id=' + g.id + '&code=' + encodeURIComponent(g.code)
    });
  } catch (err) {
    console.error('create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ------------------------------------------------------------
// POST /api/groups/:id/join
// { goal_amount, saving_for, suggest_name, community_ids: [up to 2], code }
// Private groups with anyone_can_join OFF require the joining code.
// ------------------------------------------------------------
router.post('/groups/:id/join', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const { goal_amount, saving_for, suggest_name, community_ids, code } = req.body || {};
    const sql = getDb();

    // private group gate (spec)
    const gRows = await sql`
      SELECT is_private, anyone_can_join, code, created_by FROM groups
      WHERE id = ${req.params.id} LIMIT 1
    `;
    if (!gRows.length) return res.status(404).json({ error: 'Group not found' });
    const gate = gRows[0];
    if (gate.is_private && gate.anyone_can_join === false && gate.created_by !== row.id) {
      const given = String(code || '').toUpperCase();
      const expected = String(gate.code || '').toUpperCase();
      // accept the raw code or a pasted link containing it
      if (!given || given.indexOf(expected) === -1) {
        return res.status(403).json({ error: 'This private group needs its joining code — ask the creator for it' });
      }
    }
    const result = await sql`
      SELECT join_open_group(
        ${row.id}::uuid, ${req.params.id}::uuid,
        ${Math.round(Number(goal_amount) || 0)}::bigint,
        ${saving_for || null}, ${suggest_name || null}
      ) AS member_id
    `;

    // optional: add up to 2 communities chosen during onboarding (spec)
    if (Array.isArray(community_ids)) {
      for (const cid of community_ids.slice(0, 2)) {
        try {
          await sql`
            INSERT INTO community_members (community_id, user_id)
            VALUES (${cid}::uuid, ${row.id}::uuid)
            ON CONFLICT DO NOTHING
          `;
        } catch (e) { console.error('community join skipped:', e.message); }
      }
    }

    res.json({ success: true, member_id: result[0].member_id });
  } catch (err) {
    console.error('join error:', err);
    res.status(400).json({ error: dbMessage(err) });
  }
});

// ------------------------------------------------------------
// POST /api/deposits   { group_id, amount, provider, phone }
// Dev mode: records AND confirms so all numbers update at once.
// Production: move confirm into the payment provider webhook.
// ------------------------------------------------------------
router.post('/deposits', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const { group_id, amount, provider, phone } = req.body || {};
    const amt = Math.round(Number(amount) || 0);
    if (!group_id || amt <= 0) {
      return res.status(400).json({ error: 'group_id and a positive amount are required' });
    }

    const sql = getDb();
    const rec = await sql`
      SELECT record_deposit(
        ${row.id}::uuid, ${group_id}::uuid, ${amt}::bigint,
        ${provider || 'mtn_momo'}, ${'DEV-' + Date.now()}, ${phone || row.phone || null}
      ) AS pair_id
    `;
    await sql`SELECT confirm_deposit(${rec[0].pair_id}::uuid)`;

    const members = await sql`
      SELECT gm.total_deposited, gm.avg_lead, gm.rank_in_group, g.name AS group_name
      FROM group_members gm JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id = ${row.id} AND gm.group_id = ${group_id} AND gm.status = 'active'
    `;
    const m = members[0] || null;

    if (m) {
      // spec: "deposit successful, now you have such amounts"
      await sql`
        INSERT INTO notifications (user_id, type, title, body, data)
        VALUES (${row.id}, 'deposit_confirmed', 'Deposit successful',
          ${'You now have UGX ' + Number(m.total_deposited).toLocaleString() +
            ' in ' + (m.group_name || 'your group') + '. Average lead: ' +
            (m.avg_lead > 0 ? '+' : '') + m.avg_lead + '%'},
          ${JSON.stringify({ group_id })}::jsonb)
      `;
    }

    res.json({ success: true, pair_id: rec[0].pair_id, member: m });
  } catch (err) {
    console.error('deposit error:', err);
    res.status(400).json({ error: dbMessage(err) });
  }
});

// ------------------------------------------------------------
// GET /api/groups/:id/messages — members, or community creator override
// Optional query: ?community_creator=<communityId>
// ------------------------------------------------------------
router.get('/groups/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const communityId = String(req.query.community_creator || '').trim() || null;
    const access = await canAccessGroupMessages(sql, row.id, req.params.id, communityId);
    if (!access.ok) {
      return res.status(403).json({ error: 'Join this group to view messages' });
    }

    const messages = await sql`
      SELECT m.id, m.body, m.created_at, m.user_id,
             u.display_name, u.avatar_url
      FROM group_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ${req.params.id}
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    // Mark read for group members (powers home unread dots)
    if (access.via === 'member') {
      await sql`
        UPDATE group_members
        SET messages_last_read_at = NOW()
        WHERE group_id = ${req.params.id} AND user_id = ${row.id} AND status = 'active'
      `.catch(function (e) {
        console.warn('messages_last_read_at update skipped:', e.message);
      });
    }

    res.json({ messages: messages.reverse(), access_via: access.via });
  } catch (err) {
    console.error('list messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ------------------------------------------------------------
// POST /api/groups/:id/messages  { body, community_creator? }
// ------------------------------------------------------------
router.post('/groups/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const body = String((req.body || {}).body || '').trim().slice(0, 500);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });

    const sql = getDb();
    const communityId = String((req.body || {}).community_creator || req.query.community_creator || '').trim() || null;
    const access = await canAccessGroupMessages(sql, row.id, req.params.id, communityId);
    if (!access.ok) {
      return res.status(403).json({ error: 'Join this group to send messages' });
    }

    const inserted = await sql`
      INSERT INTO group_messages (group_id, user_id, body)
      VALUES (${req.params.id}, ${row.id}, ${body})
      RETURNING id, body, created_at, user_id
    `;
    const msg = inserted[0];

    if (access.via === 'member') {
      await sql`
        UPDATE group_members
        SET messages_last_read_at = NOW()
        WHERE group_id = ${req.params.id} AND user_id = ${row.id} AND status = 'active'
      `.catch(function () { /* column may be missing until migration */ });
    }

    res.json({
      success: true,
      message: {
        ...msg,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
      access_via: access.via,
    });
  } catch (err) {
    console.error('send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ------------------------------------------------------------
// GET /api/cron — spec: recalculate every 30 minutes
// vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "*/30 * * * *" }] }
// ------------------------------------------------------------
router.get('/cron', async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ skipped: true });
    const sql = getDb();
    // Midnight cron: refresh empty open-group dates, then rankings / due closes
    await sql`
      UPDATE groups
      SET starts_at = CURRENT_DATE::timestamptz,
          closes_at = (CURRENT_DATE + (period_months || ' months')::INTERVAL)::timestamptz,
          updated_at = NOW()
      WHERE is_system = TRUE
        AND status = 'open'
        AND COALESCE(current_members, 0) = 0
        AND first_member_at IS NULL
        AND starts_at::date < CURRENT_DATE
    `.catch(function (e) {
      console.warn('cron empty open-group date refresh skipped:', e.message);
    });
    await sql`SELECT ensure_open_groups()`.catch(function (e) {
      console.warn('cron ensure_open_groups skipped:', e.message);
    });
    await sql`SELECT recalc_all_groups()`;
    // Keep private / open / incomplete rows off the public board
    await sql`
      UPDATE groups
      SET leaderboard_rank = NULL, leaderboard_prev_rank = NULL
      WHERE status NOT IN ('active','locked','completed')
         OR COALESCE(is_private, FALSE) = TRUE
         OR period_months IS NULL
    `.catch(function (e) {
      console.warn('leaderboard cleanup skipped:', e.message);
    });
    res.json({ success: true, ran_at: new Date().toISOString() });
  } catch (err) {
    console.error('cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

// ------------------------------------------------------------
// GET /api/search?q= — global search (groups, communities, profiles)
// ------------------------------------------------------------
const SEARCH_HINT = 'Search groups, communities, and profiles';
const SEARCH_LIMIT = 8;

function escLike(q) {
  return String(q || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (!q) {
    return res.json({ q: '', results: [], hint: SEARCH_HINT });
  }

  if (!isDbConfigured()) {
    return res.json({ q, results: [], hint: SEARCH_HINT, source: 'static' });
  }

  try {
    const sql = getDb();
    const pattern = '%' + escLike(q) + '%';

    const [groups, communities, profiles] = await Promise.all([
      sql`
        SELECT id, name, code
        FROM groups
        WHERE COALESCE(is_system, FALSE) = FALSE
          AND (
            name ILIKE ${pattern} ESCAPE '\\'
            OR code ILIKE ${pattern} ESCAPE '\\'
          )
        ORDER BY
          CASE WHEN lower(name) = lower(${q}) THEN 0
               WHEN lower(name) LIKE lower(${q}) || '%' THEN 1
               ELSE 2 END,
          name ASC NULLS LAST
        LIMIT ${SEARCH_LIMIT}
      `,
      sql`
        SELECT id, name, city, country
        FROM communities
        WHERE name ILIKE ${pattern} ESCAPE '\\'
        ORDER BY
          CASE WHEN lower(name) = lower(${q}) THEN 0
               WHEN lower(name) LIKE lower(${q}) || '%' THEN 1
               ELSE 2 END,
          name ASC
        LIMIT ${SEARCH_LIMIT}
      `,
      sql`
        SELECT id, display_name, avatar_url
        FROM users
        WHERE display_name IS NOT NULL
          AND trim(display_name) <> ''
          AND display_name ILIKE ${pattern} ESCAPE '\\'
        ORDER BY
          CASE WHEN lower(display_name) = lower(${q}) THEN 0
               WHEN lower(display_name) LIKE lower(${q}) || '%' THEN 1
               ELSE 2 END,
          display_name ASC
        LIMIT ${SEARCH_LIMIT}
      `,
    ]);

    const results = [];

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      results.push({
        type: 'group',
        area: 'Groups',
        id: g.id,
        name: g.name || g.code || 'Group',
        href: 'kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(g.id),
      });
    }

    for (let j = 0; j < communities.length; j++) {
      const c = communities[j];
      results.push({
        type: 'community',
        area: 'Communities',
        id: c.id,
        name: c.name,
        href: 'kibbisave_cause_detail.html?id=' + encodeURIComponent(c.id),
      });
    }

    for (let k = 0; k < profiles.length; k++) {
      const p = profiles[k];
      results.push({
        type: 'profile',
        area: 'Profiles',
        id: p.id,
        name: p.display_name,
        href: 'kibbisave_home_final.html?user=' + encodeURIComponent(p.id),
        avatar_url: p.avatar_url || null,
      });
    }

    res.json({ q, results, hint: SEARCH_HINT, source: 'database' });
  } catch (err) {
    console.error('GET /api/search error:', err.message);
    res.status(500).json({ error: 'Search failed', results: [], hint: SEARCH_HINT });
  }
});

module.exports = router;
