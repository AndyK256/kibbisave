// ============================================================
// KIBBISAVE — COMMUNITIES API (Neon)
// GET    /api/communities                    list
// GET    /api/communities/mine               communities I created
// POST   /api/communities                    create
// GET    /api/communities/:id                detail + standings
// POST   /api/communities/:id/join           join
// DELETE /api/communities/:id                delete (creator only)
// DELETE /api/communities/:id/members/:uid   remove member (creator)
// GET/POST /api/communities/:id/messages                member channel chat
// GET/POST /api/communities/:id/members/:uid/messages  creator↔member DM
// POST   /api/communities/:id/members/:uid/open-chat   resolve group chat
// ============================================================
const express = require('express');
const { getDb, isDbConfigured } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { findUserRecord } = require('../lib/profile');

const router = express.Router();

async function loadCommunityCreator(sql, communityId) {
  const rows = await sql`
    SELECT id, created_by, name, is_public, join_code
    FROM communities WHERE id = ${communityId} LIMIT 1
  `;
  return rows[0] || null;
}

function isCreator(community, userId) {
  return Boolean(community && userId && String(community.created_by) === String(userId));
}

async function isCommunityMember(sql, communityId, userId) {
  if (!userId) return false;
  const rows = await sql`
    SELECT 1 FROM community_members
    WHERE community_id = ${communityId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function canAccessCommunityChannel(sql, community, userId) {
  if (!community || !userId) return false;
  if (isCreator(community, userId)) return true;
  return isCommunityMember(sql, community.id, userId);
}

// ------------------------------------------------------------
// GET /api/communities/mine — communities created or joined
// (must be registered before /:id). Communities have no end date,
// so life_status is always "alive" while the row exists.
// ------------------------------------------------------------
router.get('/mine', requireAuth, async (req, res) => {
  if (!isDbConfigured()) {
    return res.json({ source: 'static', communities: [] });
  }
  try {
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const communities = await sql`
      SELECT c.id, c.name, c.about, c.country, c.city, c.icon, c.is_public,
             c.join_code, c.created_at, c.created_by,
             COALESCE(t.total_members, 0) AS total_members,
             COALESCE(t.total_saved, 0)   AS total_saved,
             COALESCE(t.total_goal, 0)    AS total_goal,
             COALESCE(t.pct_reached, 0)   AS pct_reached,
             (c.created_by = ${row.id}) AS is_creator,
             'alive'::text AS life_status,
             (c.created_by = ${row.id}) AS can_delete
      FROM communities c
      LEFT JOIN community_totals t ON t.community_id = c.id
      WHERE c.created_by = ${row.id}
         OR EXISTS (
           SELECT 1 FROM community_members cm
           WHERE cm.community_id = c.id AND cm.user_id = ${row.id}
         )
      ORDER BY c.created_at DESC
    `;
    res.json({ source: 'database', communities });
  } catch (err) {
    console.error('communities mine error:', err.message);
    res.status(500).json({ error: 'Failed to load your communities' });
  }
});

// ------------------------------------------------------------
// GET /api/communities
// ------------------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  if (!isDbConfigured()) {
    return res.json({ source: 'static', communities: [] });
  }
  try {
    const sql = getDb();
    let rows;
    try {
      rows = await sql`
        SELECT c.id, c.name, c.about, c.country, c.city, c.icon, c.is_public, c.kind, c.created_at,
               c.created_by,
               COALESCE(t.total_members, 0) AS total_members,
               COALESCE(t.total_saved, 0)   AS total_saved,
               COALESCE(t.total_goal, 0)    AS total_goal,
               COALESCE(t.pct_reached, 0)   AS pct_reached
        FROM communities c
        LEFT JOIN community_totals t ON t.community_id = c.id
        ORDER BY COALESCE(t.total_members, 0) DESC, c.created_at DESC
        LIMIT 50
      `;
    } catch (e) {
      if (!/kind/i.test(e.message)) throw e;
      rows = await sql`
        SELECT c.id, c.name, c.about, c.country, c.city, c.icon, c.is_public, c.created_at,
               c.created_by,
               COALESCE(t.total_members, 0) AS total_members,
               COALESCE(t.total_saved, 0)   AS total_saved,
               COALESCE(t.total_goal, 0)    AS total_goal,
               COALESCE(t.pct_reached, 0)   AS pct_reached
        FROM communities c
        LEFT JOIN community_totals t ON t.community_id = c.id
        ORDER BY COALESCE(t.total_members, 0) DESC, c.created_at DESC
        LIMIT 50
      `;
      rows = rows.map(function (r) {
        return Object.assign({}, r, { kind: r.is_public ? 'public' : 'private' });
      });
    }

    let mine = [];
    let created = [];
    let viewerId = null;
    if (req.user) {
      const row = await findUserRecord(req.user);
      if (row) {
        viewerId = row.id;
        const m = await sql`SELECT community_id FROM community_members WHERE user_id = ${row.id}`;
        mine = m.map(function (r) { return r.community_id; });
        created = rows.filter(function (c) { return String(c.created_by) === String(row.id); })
          .map(function (c) { return c.id; });
      }
    }

    res.json({
      source: 'database',
      communities: rows,
      my_community_ids: mine,
      created_community_ids: created,
      viewer_id: viewerId,
    });
  } catch (err) {
    console.error('communities list error:', err.message);
    res.status(500).json({ error: 'Failed to load communities' });
  }
});

// ------------------------------------------------------------
// POST /api/communities  { name, about, country, city, icon, is_public }
// ------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    let { name, about, country, city, icon, is_public, kind } = req.body || {};
    name = String(name || '').trim();
    if (!name) return res.status(400).json({ error: 'Community name is required' });
    about = String(about || '').trim().slice(0, 150);
    icon = String(icon || '👥').trim().slice(0, 8) || '👥';
    const allowedKinds = { public: true, private: true, organisation: true, donating: true };
    let communityKind = String(kind || '').trim().toLowerCase();
    if (!allowedKinds[communityKind]) {
      communityKind = is_public === false ? 'private' : 'public';
    }
    const isPublic = communityKind !== 'private';

    const sql = getDb();
    let inserted;
    try {
      inserted = await sql`
        INSERT INTO communities (created_by, name, about, country, city, icon, is_public, kind)
        VALUES (${row.id}, ${name}, ${about || null},
                ${String(country || 'Uganda').trim()}, ${String(city || '').trim() || null},
                ${icon}, ${isPublic}, ${communityKind})
        RETURNING id, name, icon, is_public, kind, join_code, created_at, created_by
      `;
    } catch (e) {
      if (!/kind/i.test(e.message)) throw e;
      inserted = await sql`
        INSERT INTO communities (created_by, name, about, country, city, icon, is_public)
        VALUES (${row.id}, ${name}, ${about || null},
                ${String(country || 'Uganda').trim()}, ${String(city || '').trim() || null},
                ${icon}, ${isPublic})
        RETURNING id, name, icon, is_public, join_code, created_at, created_by
      `;
      inserted[0].kind = communityKind;
    }
    const community = inserted[0];

    await sql`
      INSERT INTO community_members (community_id, user_id)
      VALUES (${community.id}, ${row.id}) ON CONFLICT DO NOTHING
    `;

    res.json({
      success: true,
      community,
      share_link: '/kibbisave_cause_detail.html?id=' + community.id +
        (community.join_code ? '&code=' + community.join_code : '')
    });
  } catch (err) {
    console.error('create community error:', err);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

// ------------------------------------------------------------
// GET /api/communities/:id — detail + standings
// ------------------------------------------------------------
router.get('/:id', optionalAuth, async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
  try {
    const sql = getDb();
    const [rows, standings, row] = await Promise.all([
      sql`
        SELECT c.id, c.name, c.about, c.country, c.city, c.icon, c.is_public, c.created_at,
               c.created_by,
               COALESCE(t.total_members, 0) AS total_members,
               COALESCE(t.total_saved, 0)   AS total_saved,
               COALESCE(t.total_goal, 0)    AS total_goal,
               COALESCE(t.pct_reached, 0)   AS pct_reached
        FROM communities c
        LEFT JOIN community_totals t ON t.community_id = c.id
        WHERE c.id = ${req.params.id} LIMIT 1
      `,
      sql`
        SELECT user_id, display_name, avatar_url, total_savings, total_goal,
               pct_reached, avg_lead, active_groups, group_id, group_name, joined_at
        FROM community_standings
        WHERE community_id = ${req.params.id}
        ORDER BY avg_lead DESC, total_savings DESC, joined_at ASC
      `,
      req.user ? findUserRecord(req.user) : Promise.resolve(null)
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Community not found' });

    standings.forEach(function (s, i) { s.rank = i + 1; });

    const creator = isCreator(rows[0], row && row.id);
    const isMember = row
      ? (await isCommunityMember(sql, rows[0].id, row.id)) || creator
      : false;

    res.json({
      community: rows[0],
      standings,
      standings_locked: false,
      member_count: standings.length,
      is_member: isMember,
      is_creator: creator,
      authenticated: Boolean(req.user),
      viewer_id: row ? row.id : null,
    });
  } catch (err) {
    console.error('community detail error:', err.message);
    // Fallback if group_id column missing from view (pre-migration)
    if (/group_id/i.test(err.message)) {
      try {
        const sql = getDb();
        const [rows, standings, row] = await Promise.all([
          sql`
            SELECT c.id, c.name, c.about, c.country, c.city, c.icon, c.is_public, c.created_at,
                   c.created_by,
                   COALESCE(t.total_members, 0) AS total_members,
                   COALESCE(t.total_saved, 0)   AS total_saved,
                   COALESCE(t.total_goal, 0)    AS total_goal,
                   COALESCE(t.pct_reached, 0)   AS pct_reached
            FROM communities c
            LEFT JOIN community_totals t ON t.community_id = c.id
            WHERE c.id = ${req.params.id} LIMIT 1
          `,
          sql`
            SELECT user_id, display_name, avatar_url, total_savings, total_goal,
                   pct_reached, avg_lead, active_groups, group_name, joined_at
            FROM community_standings
            WHERE community_id = ${req.params.id}
            ORDER BY avg_lead DESC, total_savings DESC, joined_at ASC
          `,
          req.user ? findUserRecord(req.user) : Promise.resolve(null)
        ]);
        if (!rows.length) return res.status(404).json({ error: 'Community not found' });
        standings.forEach(function (s, i) { s.rank = i + 1; s.group_id = null; });
        const creator = isCreator(rows[0], row && row.id);
        const isMember = row
          ? (await isCommunityMember(sql, rows[0].id, row.id)) || creator
          : false;
        return res.json({
          community: rows[0],
          standings,
          standings_locked: false,
          member_count: standings.length,
          is_member: isMember,
          is_creator: creator,
          authenticated: Boolean(req.user),
          viewer_id: row ? row.id : null,
        });
      } catch (err2) {
        console.error('community detail fallback error:', err2.message);
      }
    }
    res.status(500).json({ error: 'Failed to load community' });
  }
});

// ------------------------------------------------------------
// POST /api/communities/:id/join  { code }
// ------------------------------------------------------------
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const rows = await sql`
      SELECT id, is_public, join_code FROM communities WHERE id = ${req.params.id} LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'Community not found' });

    const c = rows[0];
    if (!c.is_public) {
      const code = String((req.body || {}).code || '').trim().toUpperCase();
      if (!code || code !== String(c.join_code || '').toUpperCase()) {
        return res.status(403).json({ error: 'This community is private — enter the correct join code' });
      }
    }

    await sql`
      INSERT INTO community_members (community_id, user_id)
      VALUES (${c.id}, ${row.id}) ON CONFLICT DO NOTHING
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('join community error:', err);
    res.status(500).json({ error: 'Failed to join community' });
  }
});

// ------------------------------------------------------------
// DELETE /api/communities/:id — creator only
// ------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!isCreator(community, row.id)) {
      return res.status(403).json({ error: 'Only the community creator can delete it' });
    }

    // Remove memberships first (works even without ON DELETE CASCADE)
    await sql`DELETE FROM community_members WHERE community_id = ${community.id}`;
    try {
      await sql`DELETE FROM community_member_messages WHERE community_id = ${community.id}`;
    } catch (_) { /* table may not exist yet */ }
    try {
      await sql`DELETE FROM community_messages WHERE community_id = ${community.id}`;
    } catch (_) { /* table may not exist yet */ }
    await sql`DELETE FROM communities WHERE id = ${community.id}`;

    res.json({ success: true });
  } catch (err) {
    console.error('delete community error:', err);
    res.status(500).json({ error: 'Failed to delete community' });
  }
});

// ------------------------------------------------------------
// DELETE /api/communities/:id/members/:userId — creator only
// ------------------------------------------------------------
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!isCreator(community, row.id)) {
      return res.status(403).json({ error: 'Only the community creator can remove members' });
    }

    const targetId = String(req.params.userId || '');
    if (!targetId) return res.status(400).json({ error: 'Member id required' });
    if (String(targetId) === String(row.id)) {
      return res.status(400).json({ error: 'You cannot remove yourself — delete the community instead' });
    }

    const removed = await sql`
      DELETE FROM community_members
      WHERE community_id = ${community.id} AND user_id = ${targetId}
      RETURNING id
    `;
    if (!removed.length) return res.status(404).json({ error: 'Member not found in this community' });

    res.json({ success: true });
  } catch (err) {
    console.error('remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ------------------------------------------------------------
// GET /api/communities/:id/messages — community channel (members only)
// ------------------------------------------------------------
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!(await canAccessCommunityChannel(sql, community, row.id))) {
      return res.status(403).json({ error: 'Join this community to view messages' });
    }

    const messages = await sql`
      SELECT m.id, m.body, m.created_at, m.user_id,
             u.display_name, u.avatar_url
      FROM community_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.community_id = ${community.id}
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('list community messages error:', err);
    if (/community_messages/i.test(err.message)) {
      return res.status(503).json({ error: 'Messaging is not set up yet — run the community-messages migration' });
    }
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ------------------------------------------------------------
// POST /api/communities/:id/messages  { body }
// ------------------------------------------------------------
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const body = String((req.body || {}).body || '').trim().slice(0, 500);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!(await canAccessCommunityChannel(sql, community, row.id))) {
      return res.status(403).json({ error: 'Join this community to send messages' });
    }

    const inserted = await sql`
      INSERT INTO community_messages (community_id, user_id, body)
      VALUES (${community.id}, ${row.id}, ${body})
      RETURNING id, body, created_at, user_id
    `;
    const msg = inserted[0];

    res.json({
      success: true,
      message: {
        ...msg,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
    });
  } catch (err) {
    console.error('send community message error:', err);
    if (/community_messages/i.test(err.message)) {
      return res.status(503).json({ error: 'Messaging is not set up yet — run the community-messages migration' });
    }
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ------------------------------------------------------------
// POST /api/communities/:id/members/:userId/open-chat
// Resolve a group chat the member is in (creator override), or DM.
// ------------------------------------------------------------
router.post('/:id/members/:userId/open-chat', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!isCreator(community, row.id)) {
      return res.status(403).json({ error: 'Only the community creator can message members this way' });
    }

    const targetId = String(req.params.userId || '');
    if (!targetId) return res.status(400).json({ error: 'Member id required' });
    if (String(targetId) === String(row.id)) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    const membership = await sql`
      SELECT 1 FROM community_members
      WHERE community_id = ${community.id} AND user_id = ${targetId}
      LIMIT 1
    `;
    if (!membership.length) {
      return res.status(404).json({ error: 'That person is not in this community' });
    }

    const groups = await sql`
      SELECT g.id, COALESCE(g.name, g.code) AS name
      FROM group_members gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id = ${targetId} AND gm.status = 'active'
      ORDER BY gm.joined_at DESC
      LIMIT 1
    `;

    if (groups.length) {
      return res.json({
        success: true,
        mode: 'group',
        group_id: groups[0].id,
        group_name: groups[0].name,
        community_id: community.id,
        url: '/kibbisave_my_group_detail_v2.html?id=' + groups[0].id +
          '&community_creator=' + encodeURIComponent(community.id) +
          '&message_user=' + encodeURIComponent(targetId),
      });
    }

    res.json({
      success: true,
      mode: 'dm',
      community_id: community.id,
      member_id: targetId,
    });
  } catch (err) {
    console.error('open-chat error:', err);
    res.status(500).json({ error: 'Failed to open chat' });
  }
});

// ------------------------------------------------------------
// GET /api/communities/:id/members/:userId/messages
// Creator or the member can read the thread.
// ------------------------------------------------------------
router.get('/:id/members/:userId/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const targetId = String(req.params.userId || '');
    const creatorOk = isCreator(community, row.id);
    const memberOk = String(row.id) === String(targetId);
    if (!creatorOk && !memberOk) {
      return res.status(403).json({ error: 'Not allowed to view this conversation' });
    }

    // Ensure target is (or was) related — creator always ok; member must be in community
    if (memberOk && !creatorOk) {
      const mem = await sql`
        SELECT 1 FROM community_members
        WHERE community_id = ${community.id} AND user_id = ${row.id} LIMIT 1
      `;
      if (!mem.length) return res.status(403).json({ error: 'Not a member of this community' });
    }

    const otherId = creatorOk ? targetId : community.created_by;
    const messages = await sql`
      SELECT m.id, m.body, m.created_at, m.from_user_id, m.to_user_id,
             u.display_name, u.avatar_url
      FROM community_member_messages m
      JOIN users u ON u.id = m.from_user_id
      WHERE m.community_id = ${community.id}
        AND (
          (m.from_user_id = ${row.id} AND m.to_user_id = ${otherId})
          OR (m.from_user_id = ${otherId} AND m.to_user_id = ${row.id})
        )
      ORDER BY m.created_at DESC
      LIMIT 50
    `;
    res.json({ messages: messages.reverse(), community_id: community.id });
  } catch (err) {
    console.error('list community DM error:', err);
    if (/community_member_messages/i.test(err.message)) {
      return res.json({ messages: [], community_id: req.params.id, pending_migration: true });
    }
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ------------------------------------------------------------
// POST /api/communities/:id/members/:userId/messages  { body }
// ------------------------------------------------------------
router.post('/:id/members/:userId/messages', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const body = String((req.body || {}).body || '').trim().slice(0, 500);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });

    const sql = getDb();
    const community = await loadCommunityCreator(sql, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const targetId = String(req.params.userId || '');
    const creatorOk = isCreator(community, row.id);
    const memberOk = String(row.id) === String(targetId);
    // Member messaging creator: path uses creator's id as :userId from member side —
    // allow creator→member OR member→creator
    let toUserId = null;
    if (creatorOk) {
      toUserId = targetId;
      const mem = await sql`
        SELECT 1 FROM community_members
        WHERE community_id = ${community.id} AND user_id = ${targetId} LIMIT 1
      `;
      if (!mem.length) return res.status(404).json({ error: 'Member not found in this community' });
    } else if (String(targetId) === String(community.created_by)) {
      // Member sending to creator (target is creator id)
      const mem = await sql`
        SELECT 1 FROM community_members
        WHERE community_id = ${community.id} AND user_id = ${row.id} LIMIT 1
      `;
      if (!mem.length) return res.status(403).json({ error: 'Not a member of this community' });
      toUserId = community.created_by;
    } else {
      return res.status(403).json({ error: 'Only the community creator can start this conversation' });
    }

    if (String(toUserId) === String(row.id)) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    const inserted = await sql`
      INSERT INTO community_member_messages (community_id, from_user_id, to_user_id, body)
      VALUES (${community.id}, ${row.id}, ${toUserId}, ${body})
      RETURNING id, body, created_at, from_user_id, to_user_id
    `;
    const msg = inserted[0];
    res.json({
      success: true,
      message: {
        ...msg,
        display_name: row.display_name,
        avatar_url: row.avatar_url,
      },
    });
  } catch (err) {
    console.error('send community DM error:', err);
    if (/community_member_messages/i.test(err.message)) {
      return res.status(503).json({ error: 'Messaging is not set up yet — run the community-creator migration' });
    }
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
