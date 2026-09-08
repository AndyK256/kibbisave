const express = require('express');
const { getDb, isDbConfigured } = require('../api/db');
const { requireAuth } = require('../api/middleware/auth');
const { findUserRecord } = require('../api/lib/profile');
const { signSession, COOKIE_OPTS } = require('../api/lib/session');
const { loginWithPassword } = require('../api/lib/users');
const {
  PERIODS,
  dbMessage,
  publicAdmin,
  normalizeUsername,
  normalizeNin,
  parsePin,
  hashPin,
  loadAdminRow,
  writeAudit,
  memberSchedule,
  assignPublicGroup,
  requireCommunityAdmin,
  assertPin,
  confirmGroupDeposit,
  hashPassword,
  normalizePhone,
  validateAvatarDataUrl,
} = require('./community-admin-lib');

const router = express.Router();

function authError(res, err) {
  const map = {
    DATABASE_NOT_CONFIGURED: 503,
    INVALID_PHONE: 400,
    WEAK_PASSWORD: 400,
    MISSING_NAME: 400,
    INVALID_NIN: 400,
    ACCOUNT_EXISTS: 409,
    MISSING_CREDENTIALS: 400,
    INVALID_CREDENTIALS: 401,
    USER_NOT_FOUND: 404,
  };
  const status = map[err.code] || 500;
  if (status >= 500) console.error('Admin auth error:', err);
  return res.status(status).json({ error: err.message || 'Request failed', code: err.code || null });
}

async function upsertAdminKyc(sql, userId, fields) {
  await sql`
    INSERT INTO community_admins (user_id, address, photo_scan_url, pin_hash, kyc_complete, updated_at)
    VALUES (
      ${userId}::uuid, ${fields.address}, ${fields.photoScanUrl},
      ${fields.pinHash}, TRUE, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      address = EXCLUDED.address,
      photo_scan_url = COALESCE(EXCLUDED.photo_scan_url, community_admins.photo_scan_url),
      pin_hash = COALESCE(EXCLUDED.pin_hash, community_admins.pin_hash),
      kyc_complete = TRUE,
      updated_at = NOW()
  `;
  return loadAdminRow(userId);
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = await findUserRecord(req.user);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const admin = await loadAdminRow(user.id);
    res.json({
      authenticated: true,
      kycComplete: Boolean(admin?.kyc_complete && admin?.pin_hash),
      hasPin: Boolean(admin?.pin_hash),
      user: publicAdmin(user, admin),
    });
  } catch (err) {
    console.error('admin me:', err);
    res.status(500).json({ error: 'Failed to load admin session' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const identifier = body.phone || body.email || body.username || body.identifier;
    const user = await loginWithPassword(identifier, body.password);
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    const admin = await loadAdminRow(user.id);
    res.json({
      success: true,
      kycComplete: Boolean(admin?.kyc_complete && admin?.pin_hash),
      user: publicAdmin(user, admin),
    });
  } catch (err) {
    return authError(res, err);
  }
});

router.post('/register', async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const body = req.body || {};
    const firstName = String(body.firstName || body.first_name || '').trim().slice(0, 80);
    const lastName = String(body.lastName || body.last_name || '').trim().slice(0, 80);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    const address = String(body.address || '').trim().slice(0, 200);
    const phone = normalizePhone(body.phone || body.telNo || body.tel);
    const nin = normalizeNin(body.nin);
    const password = String(body.password || '');
    const pin = parsePin(body.pin);
    let photoScanUrl = null;
    if (body.photo || body.photoScanUrl) {
      try {
        photoScanUrl = validateAvatarDataUrl(body.photo || body.photoScanUrl);
      } catch {
        return res.status(400).json({ error: 'Capture a clear live photo to continue' });
      }
    }

    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email' });
    if (!address) return res.status(400).json({ error: 'Address is required' });
    if (!phone) return res.status(400).json({ error: 'Enter a valid Uganda telephone number' });
    if (!nin || nin.length < 5) return res.status(400).json({ error: 'Enter a valid NIN' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (!pin) return res.status(400).json({ error: 'Set a 4-digit approval PIN' });
    if (!photoScanUrl) return res.status(400).json({ error: 'Live face photo is required' });

    const sql = getDb();
    const clash = await sql`
      SELECT id FROM users
      WHERE phone = ${phone} OR nin = ${nin} OR lower(email) = ${email}
      LIMIT 1
    `;
    if (clash.length) {
      return res.status(409).json({ error: 'An account with this phone, email or NIN already exists. Log in instead.' });
    }

    const passwordHash = await hashPassword(password);
    const pinHash = await hashPin(pin);
    const displayName = `${firstName} ${lastName}`.trim();
    const inserted = await sql`
      INSERT INTO users (
        email, phone, password_hash, display_name, first_name, last_name,
        district, location, nationality, nin, terms_accepted_at, profile_complete, avatar_url, avatar_custom
      )
      VALUES (
        ${email}, ${phone}, ${passwordHash}, ${displayName}, ${firstName}, ${lastName},
        ${address.slice(0, 80)}, ${address.slice(0, 80)}, 'Ugandan', ${nin}, NOW(), TRUE,
        ${photoScanUrl}, TRUE
      )
      RETURNING id, google_id, email, display_name, avatar_url, location, phone,
                first_name, last_name, district, nationality, nin,
                terms_accepted_at, profile_complete, created_at
    `;
    const user = inserted[0];
    const admin = await upsertAdminKyc(sql, user.id, {
      address,
      photoScanUrl,
      pinHash,
    });
    await writeAudit(user.id, 'admin_register', 'admin', user.id, { email, phone });
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    res.json({ success: true, kycComplete: true, user: publicAdmin(user, admin) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with these details already exists. Log in instead.' });
    }
    console.error('admin register:', err);
    res.status(500).json({ error: 'Could not create admin account' });
  }
});

router.post('/complete-kyc', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const user = await findUserRecord(req.user);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const body = req.body || {};
    const firstName = String(body.firstName || user.first_name || '').trim().slice(0, 80);
    const lastName = String(body.lastName || user.last_name || '').trim().slice(0, 80);
    const email = String(body.email || user.email || '').trim().toLowerCase().slice(0, 120);
    const address = String(body.address || '').trim().slice(0, 200);
    const phone = body.phone || body.telNo ? normalizePhone(body.phone || body.telNo) : user.phone;
    const nin = body.nin ? normalizeNin(body.nin) : user.nin;
    const pin = parsePin(body.pin);
    let photoScanUrl = null;
    if (body.photo || body.photoScanUrl) {
      try {
        photoScanUrl = validateAvatarDataUrl(body.photo || body.photoScanUrl);
      } catch {
        return res.status(400).json({ error: 'Capture a clear live photo to continue' });
      }
    }
    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email' });
    if (!address) return res.status(400).json({ error: 'Address is required' });
    if (!phone) return res.status(400).json({ error: 'Enter a valid telephone number' });
    if (!nin || nin.length < 5) return res.status(400).json({ error: 'Enter a valid NIN' });
    if (!pin) return res.status(400).json({ error: 'Set a 4-digit approval PIN' });
    if (!photoScanUrl) return res.status(400).json({ error: 'Live face photo is required' });

    const sql = getDb();
    await sql`
      UPDATE users SET
        first_name = ${firstName},
        last_name = ${lastName},
        display_name = ${`${firstName} ${lastName}`.trim()},
        email = ${email},
        phone = ${phone},
        nin = ${nin},
        avatar_url = ${photoScanUrl},
        avatar_custom = TRUE,
        updated_at = NOW()
      WHERE id = ${user.id}
    `;
    const pinHash = await hashPin(pin);
    const admin = await upsertAdminKyc(sql, user.id, { address, photoScanUrl, pinHash });
    await writeAudit(user.id, 'admin_kyc', 'admin', user.id, {});
    const fresh = await findUserRecord(req.user);
    res.json({ success: true, kycComplete: true, user: publicAdmin(fresh, admin) });
  } catch (err) {
    console.error('admin complete-kyc:', err);
    res.status(500).json({ error: 'Could not save KYC' });
  }
});

router.get('/home', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const adminId = req.adminUser.id;
    const [totals, pending, communities, recent] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS total_collected,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved_count
        FROM admin_deposit_requests
        WHERE admin_id = ${adminId}
      `,
      sql`
        SELECT COUNT(*)::int AS pending_count
        FROM admin_deposit_requests
        WHERE admin_id = ${adminId} AND status = 'pending'
      `,
      sql`
        SELECT COUNT(*)::int AS community_count,
               COALESCE(SUM(COALESCE(t.total_members, 0)), 0) AS member_count
        FROM communities c
        LEFT JOIN community_totals t ON t.community_id = c.id
        WHERE c.created_by = ${adminId}
          AND c.is_public = FALSE
      `,
      sql`
        SELECT id, amount, status, payment_method, created_at
        FROM admin_deposit_requests
        WHERE admin_id = ${adminId}
        ORDER BY created_at DESC
        LIMIT 5
      `,
    ]);
    const first = req.adminUser.first_name || (req.adminUser.display_name || 'Admin').split(' ')[0];
    res.json({
      greetingName: first,
      totalCollected: Number(totals[0]?.total_collected || 0),
      approvedCount: Number(totals[0]?.approved_count || 0),
      pendingCount: Number(pending[0]?.pending_count || 0),
      communityCount: Number(communities[0]?.community_count || 0),
      memberCount: Number(communities[0]?.member_count || 0),
      recent,
    });
  } catch (err) {
    console.error('admin home:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.get('/communities', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const q = String(req.query.q || '').trim();
    const communities = await sql`
      SELECT c.id, c.name, c.about, c.icon, c.join_code, c.created_at,
             COALESCE(t.total_members, 0) AS total_members,
             COALESCE(t.total_saved, 0) AS total_saved,
             COALESCE(t.total_goal, 0) AS total_goal
      FROM communities c
      LEFT JOIN community_totals t ON t.community_id = c.id
      WHERE c.created_by = ${req.adminUser.id}
        AND c.is_public = FALSE
      ORDER BY c.created_at DESC
    `;
    let members = [];
    if (q) {
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      members = await sql`
        SELECT u.id, u.display_name, u.username, u.phone, c.id AS community_id, c.name AS community_name,
               COALESCE(s.total_savings, 0) AS total_savings
        FROM community_members cm
        JOIN communities c ON c.id = cm.community_id
        JOIN users u ON u.id = cm.user_id
        LEFT JOIN user_home_summary s ON s.user_id = u.id
        WHERE c.created_by = ${req.adminUser.id}
          AND c.is_public = FALSE
          AND (
            u.display_name ILIKE ${like}
            OR COALESCE(u.username, '') ILIKE ${like}
            OR COALESCE(u.phone, '') ILIKE ${like}
          )
        ORDER BY u.display_name
        LIMIT 30
      `;
    }
    res.json({ communities, members });
  } catch (err) {
    console.error('admin communities:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.post('/communities', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    if (!(await assertPin(req, res))) return;
    const name = String(req.body.name || '').trim().slice(0, 80);
    const about = String(req.body.about || '').trim().slice(0, 150);
    const icon = String(req.body.icon || '👥').trim().slice(0, 8) || '👥';
    if (!name) return res.status(400).json({ error: 'Community name is required' });
    const sql = getDb();
    let inserted;
    try {
      inserted = await sql`
        INSERT INTO communities (created_by, name, about, country, icon, is_public, kind)
        VALUES (${req.adminUser.id}, ${name}, ${about || null}, 'Uganda', ${icon}, FALSE, 'private')
        RETURNING id, name, icon, is_public, kind, join_code, created_at
      `;
    } catch (e) {
      if (!/kind/i.test(e.message)) throw e;
      inserted = await sql`
        INSERT INTO communities (created_by, name, about, country, icon, is_public)
        VALUES (${req.adminUser.id}, ${name}, ${about || null}, 'Uganda', ${icon}, FALSE)
        RETURNING id, name, icon, is_public, join_code, created_at
      `;
    }
    const community = inserted[0];
    await sql`
      INSERT INTO community_members (community_id, user_id)
      VALUES (${community.id}, ${req.adminUser.id}) ON CONFLICT DO NOTHING
    `;
    await writeAudit(req.adminUser.id, 'create_community', 'community', community.id, { name });
    res.json({ success: true, community });
  } catch (err) {
    console.error('admin create community:', err);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

router.get('/communities/:id/members', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const owned = await sql`
      SELECT c.id, c.name, c.icon, c.join_code, c.created_at,
             COALESCE(t.total_members, 0) AS total_members,
             COALESCE(t.total_saved, 0) AS total_saved
      FROM communities c
      LEFT JOIN community_totals t ON t.community_id = c.id
      WHERE c.id = ${req.params.id}::uuid AND c.created_by = ${req.adminUser.id}
      LIMIT 1
    `;
    if (!owned.length) return res.status(404).json({ error: 'Community not found' });
    const q = String(req.query.q || '').trim();
    const like = q ? '%' + q.replace(/[%_]/g, '') + '%' : null;
    const members = like
      ? await sql`
          SELECT u.id, u.display_name, u.first_name, u.last_name, u.username, u.phone, u.avatar_url,
                 COALESCE(s.total_savings, 0) AS total_savings,
                 COALESCE(s.total_goal, 0) AS total_goal,
                 COALESCE(s.pct_reached, 0) AS pct_reached,
                 COALESCE(s.avg_lead, 0) AS avg_lead,
                 (SELECT g.id FROM group_members gm JOIN groups g ON g.id = gm.group_id
                   WHERE gm.user_id = u.id AND gm.status = 'active'
                   ORDER BY gm.joined_at DESC LIMIT 1) AS group_id
          FROM community_members cm
          JOIN users u ON u.id = cm.user_id
          LEFT JOIN user_home_summary s ON s.user_id = u.id
          WHERE cm.community_id = ${req.params.id}::uuid
            AND (
              u.display_name ILIKE ${like}
              OR COALESCE(u.username, '') ILIKE ${like}
              OR COALESCE(u.phone, '') ILIKE ${like}
            )
          ORDER BY COALESCE(s.total_savings, 0) DESC, u.display_name
        `
      : await sql`
          SELECT u.id, u.display_name, u.first_name, u.last_name, u.username, u.phone, u.avatar_url,
                 COALESCE(s.total_savings, 0) AS total_savings,
                 COALESCE(s.total_goal, 0) AS total_goal,
                 COALESCE(s.pct_reached, 0) AS pct_reached,
                 COALESCE(s.avg_lead, 0) AS avg_lead,
                 (SELECT g.id FROM group_members gm JOIN groups g ON g.id = gm.group_id
                   WHERE gm.user_id = u.id AND gm.status = 'active'
                   ORDER BY gm.joined_at DESC LIMIT 1) AS group_id
          FROM community_members cm
          JOIN users u ON u.id = cm.user_id
          LEFT JOIN user_home_summary s ON s.user_id = u.id
          WHERE cm.community_id = ${req.params.id}::uuid
          ORDER BY COALESCE(s.total_savings, 0) DESC, u.display_name
        `;
    res.json({ community: owned[0], members });
  } catch (err) {
    console.error('admin community members:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.post('/members', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    if (!(await assertPin(req, res))) return;
    const body = req.body || {};
    const firstName = String(body.firstName || '').trim().slice(0, 80);
    const lastName = String(body.lastName || '').trim().slice(0, 80);
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    const confirm = String(body.confirmPassword || body.password_confirm || password);
    const nin = normalizeNin(body.nin);
    const communityId = body.communityId || body.community_id;
    const periodMonths = Number(body.periodMonths || body.period_months);
    const goalAmount = Math.round(Number(body.goalAmount || body.amount) || 0);
    const alreadyDeposited = Math.round(Number(body.alreadyDeposited || body.already_deposited) || 0);
    let dailyRate = Math.round(Number(body.dailyRate || body.daily_rate) || 0);
    const days = (PERIODS.includes(periodMonths) ? periodMonths : 0) * 30;

    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required' });
    if (!username) return res.status(400).json({ error: 'Username must be at least 3 letters or numbers' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (password !== confirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (!nin || nin.length < 5) return res.status(400).json({ error: 'Enter a valid NIN' });
    if (!communityId) return res.status(400).json({ error: 'Choose a community' });
    if (!PERIODS.includes(periodMonths)) return res.status(400).json({ error: 'Pick a period of 2, 3, 5, 8 or 12 months' });
    if (goalAmount <= 0) return res.status(400).json({ error: 'Enter the savings amount' });
    if (alreadyDeposited < 0) return res.status(400).json({ error: 'Already deposited cannot be negative' });
    if (alreadyDeposited > goalAmount) return res.status(400).json({ error: 'Already deposited cannot exceed the goal' });
    if (!dailyRate && days) dailyRate = Math.round(goalAmount / days);

    const sql = getDb();
    const owned = await sql`
      SELECT id, name FROM communities
      WHERE id = ${communityId}::uuid AND created_by = ${req.adminUser.id}
        AND is_public = FALSE
      LIMIT 1
    `;
    if (!owned.length) return res.status(404).json({ error: 'Community not found' });

    const clash = await sql`
      SELECT id FROM users
      WHERE nin = ${nin} OR lower(username) = ${username}
      LIMIT 1
    `;
    if (clash.length) return res.status(409).json({ error: 'A member with this username or NIN already exists' });

    const passwordHash = await hashPassword(password);
    const displayName = `${firstName} ${lastName}`.trim();
    const district = req.adminUser.district || req.adminUser.location || 'Kampala';
    const inserted = await sql`
      INSERT INTO users (
        email, phone, password_hash, display_name, first_name, last_name,
        district, location, nationality, nin, username, terms_accepted_at, profile_complete
      )
      VALUES (
        NULL, NULL, ${passwordHash}, ${displayName}, ${firstName}, ${lastName},
        ${district}, ${district}, 'Ugandan', ${nin}, ${username}, NOW(), FALSE
      )
      RETURNING id, display_name, username, first_name, last_name, nin
    `;
    const member = inserted[0];

    await sql`
      INSERT INTO community_members (community_id, user_id)
      VALUES (${communityId}::uuid, ${member.id}::uuid)
      ON CONFLICT DO NOTHING
    `;

    const groupId = await assignPublicGroup(
      sql,
      member.id,
      periodMonths,
      goalAmount,
      body.savingFor || 'Community savings'
    );

    await sql`
      UPDATE group_members
      SET daily_rate = ${dailyRate}, registered_by = ${req.adminUser.id}
      WHERE user_id = ${member.id} AND group_id = ${groupId} AND status = 'active'
    `;

    let pairId = null;
    if (alreadyDeposited > 0) {
      pairId = await confirmGroupDeposit(
        sql, member.id, groupId, alreadyDeposited, 'manual', req.adminUser.phone
      );
      await sql`
        INSERT INTO admin_deposit_requests (
          member_id, admin_id, community_id, group_id, amount, amount_on_track_gap,
          payment_method, phone, status, source, pair_id, approved_at
        ) VALUES (
          ${member.id}, ${req.adminUser.id}, ${communityId}::uuid, ${groupId}::uuid,
          ${alreadyDeposited}, 0, 'manual', ${req.adminUser.phone || null},
          'approved', 'manual', ${pairId}, NOW()
        )
      `;
    }

    await writeAudit(req.adminUser.id, 'register_member', 'user', member.id, {
      username, communityId, groupId, goalAmount, alreadyDeposited,
    });

    const schedule = await memberSchedule(sql, member.id, groupId);
    res.json({
      success: true,
      member: {
        id: member.id,
        displayName: member.display_name,
        username: member.username,
        firstName: member.first_name,
        lastName: member.last_name,
      },
      community: owned[0],
      groupId,
      dailyRate,
      periodMonths,
      goalAmount,
      alreadyDeposited,
      pairId,
      schedule: schedule.member,
      writeDown: {
        username,
        note: 'Please write this down for the person on top of the book',
      },
    });
  } catch (err) {
    console.error('admin register member:', err);
    res.status(400).json({ error: dbMessage(err) });
  }
});

router.get('/members/:id', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT u.id, u.display_name, u.first_name, u.last_name, u.username, u.phone, u.nin, u.avatar_url,
             c.id AS community_id, c.name AS community_name,
             COALESCE(s.total_savings, 0) AS total_savings,
             COALESCE(s.total_goal, 0) AS total_goal,
             COALESCE(s.pct_reached, 0) AS pct_reached,
             COALESCE(s.avg_lead, 0) AS avg_lead
      FROM users u
      JOIN community_members cm ON cm.user_id = u.id
      JOIN communities c ON c.id = cm.community_id
      LEFT JOIN user_home_summary s ON s.user_id = u.id
      WHERE u.id = ${req.params.id}::uuid
        AND c.created_by = ${req.adminUser.id}
        AND c.is_public = FALSE
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'Member not found in your communities' });
    const groups = await sql`
      SELECT gm.group_id, g.name AS group_name, g.code, g.period_months,
             gm.goal_amount, gm.total_deposited, gm.daily_rate, gm.avg_lead,
             gm.rank_in_group, gm.joined_at, gm.ends_at
      FROM group_members gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id = ${req.params.id}::uuid AND gm.status = 'active'
      ORDER BY gm.joined_at DESC
    `;
    const txs = await sql`
      SELECT id, amount, payment_method, status, source, created_at, approved_at, group_id
      FROM admin_deposit_requests
      WHERE member_id = ${req.params.id}::uuid AND admin_id = ${req.adminUser.id}
      ORDER BY created_at DESC
      LIMIT 40
    `;
    const primary = groups[0] || null;
    res.json({
      member: rows[0],
      groups,
      transactions: txs,
      amountOnTrackGap: primary ? (await memberSchedule(sql, req.params.id, primary.group_id)).amountOnTrackGap : 0,
    });
  } catch (err) {
    console.error('admin member:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.post('/members/:id/deposits', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    if (!(await assertPin(req, res))) return;
    const amount = Math.round(Number(req.body.amount || req.body.amountReceived) || 0);
    const acknowledged = Boolean(req.body.acknowledged || req.body.received);
    if (amount <= 0) return res.status(400).json({ error: 'Enter the amount received' });
    if (!acknowledged) return res.status(400).json({ error: 'Confirm you have received the money' });

    const sql = getDb();
    const scoped = await sql`
      SELECT u.id, u.display_name, u.phone, c.id AS community_id
      FROM users u
      JOIN community_members cm ON cm.user_id = u.id
      JOIN communities c ON c.id = cm.community_id
      WHERE u.id = ${req.params.id}::uuid
        AND c.created_by = ${req.adminUser.id}
        AND c.is_public = FALSE
      LIMIT 1
    `;
    if (!scoped.length) return res.status(404).json({ error: 'Member not found in your communities' });

    const groupId = req.body.groupId || req.body.group_id;
    const groups = await sql`
      SELECT group_id FROM group_members
      WHERE user_id = ${req.params.id}::uuid AND status = 'active'
      ORDER BY joined_at DESC
    `;
    const useGroup = groupId || (groups[0] && groups[0].group_id);
    if (!useGroup) return res.status(400).json({ error: 'This member is not in a savings group yet' });

    const schedule = await memberSchedule(sql, req.params.id, useGroup);
    const pairId = await confirmGroupDeposit(
      sql, req.params.id, useGroup, amount, 'manual', scoped[0].phone
    );
    const inserted = await sql`
      INSERT INTO admin_deposit_requests (
        member_id, admin_id, community_id, group_id, amount, amount_on_track_gap,
        payment_method, phone, status, source, pair_id, approved_at
      ) VALUES (
        ${req.params.id}::uuid, ${req.adminUser.id}, ${scoped[0].community_id},
        ${useGroup}::uuid, ${amount}, ${schedule.amountOnTrackGap},
        'manual', ${scoped[0].phone || null}, 'approved', 'manual', ${pairId}, NOW()
      )
      RETURNING *
    `;
    await sql`
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        ${req.params.id}::uuid, 'deposit_confirmed', 'Deposit approved',
        ${'UGX ' + amount.toLocaleString() + ' was credited by your community admin.'},
        ${JSON.stringify({ group_id: useGroup })}::jsonb
      )
    `;
    await writeAudit(req.adminUser.id, 'manual_deposit', 'transaction', inserted[0].id, { amount });
    const next = await memberSchedule(sql, req.params.id, useGroup);
    res.json({ success: true, request: inserted[0], schedule: next.member, amountOnTrackGap: next.amountOnTrackGap });
  } catch (err) {
    console.error('admin manual deposit:', err);
    res.status(400).json({ error: dbMessage(err) });
  }
});

router.get('/transactions', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const period = String(req.query.period || 'all');
    let since = null;
    if (period === 'daily') since = "NOW() - INTERVAL '1 day'";
    if (period === 'weekly') since = "NOW() - INTERVAL '7 days'";
    if (period === 'monthly') since = "NOW() - INTERVAL '30 days'";
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    let rows;
    if (from && !Number.isNaN(from.getTime())) {
      const toDate = to && !Number.isNaN(to.getTime()) ? to : new Date();
      rows = await sql`
        SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
        FROM admin_deposit_requests r
        JOIN users u ON u.id = r.member_id
        LEFT JOIN communities c ON c.id = r.community_id
        WHERE r.admin_id = ${req.adminUser.id}
          AND r.status = 'approved'
          AND r.created_at >= ${from.toISOString()}::timestamptz
          AND r.created_at <= ${toDate.toISOString()}::timestamptz
        ORDER BY r.created_at DESC
        LIMIT 200
      `;
    } else if (period === 'daily') {
      rows = await sql`
        SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
        FROM admin_deposit_requests r
        JOIN users u ON u.id = r.member_id
        LEFT JOIN communities c ON c.id = r.community_id
        WHERE r.admin_id = ${req.adminUser.id} AND r.status = 'approved'
          AND r.created_at >= NOW() - INTERVAL '1 day'
        ORDER BY r.created_at DESC LIMIT 200
      `;
    } else if (period === 'weekly') {
      rows = await sql`
        SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
        FROM admin_deposit_requests r
        JOIN users u ON u.id = r.member_id
        LEFT JOIN communities c ON c.id = r.community_id
        WHERE r.admin_id = ${req.adminUser.id} AND r.status = 'approved'
          AND r.created_at >= NOW() - INTERVAL '7 days'
        ORDER BY r.created_at DESC LIMIT 200
      `;
    } else if (period === 'monthly') {
      rows = await sql`
        SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
        FROM admin_deposit_requests r
        JOIN users u ON u.id = r.member_id
        LEFT JOIN communities c ON c.id = r.community_id
        WHERE r.admin_id = ${req.adminUser.id} AND r.status = 'approved'
          AND r.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY r.created_at DESC LIMIT 200
      `;
    } else {
      rows = await sql`
        SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
        FROM admin_deposit_requests r
        JOIN users u ON u.id = r.member_id
        LEFT JOIN communities c ON c.id = r.community_id
        WHERE r.admin_id = ${req.adminUser.id} AND r.status = 'approved'
        ORDER BY r.created_at DESC LIMIT 200
      `;
    }

    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    res.json({ transactions: rows, total, count: rows.length, period });
  } catch (err) {
    console.error('admin transactions:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.get('/approvals', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT r.*, u.display_name, u.username, u.phone, c.name AS community_name
      FROM admin_deposit_requests r
      JOIN users u ON u.id = r.member_id
      LEFT JOIN communities c ON c.id = r.community_id
      WHERE r.admin_id = ${req.adminUser.id} AND r.status = 'pending'
      ORDER BY r.created_at DESC
      LIMIT 100
    `;
    res.json({ requests: rows, count: rows.length });
  } catch (err) {
    console.error('admin approvals:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.post('/approvals/:id/approve', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    if (!(await assertPin(req, res))) return;
    const acknowledged = Boolean(req.body.acknowledged);
    if (!acknowledged) return res.status(400).json({ error: 'Confirm you have verified receipt of this payment' });

    const sql = getDb();
    const rows = await sql`
      SELECT * FROM admin_deposit_requests
      WHERE id = ${req.params.id}::uuid AND admin_id = ${req.adminUser.id}
      LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const request = rows[0];
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'This request was already processed' });
    }

    const pairId = await confirmGroupDeposit(
      sql, request.member_id, request.group_id, request.amount,
      request.payment_method || 'cash', request.phone
    );
    const updated = await sql`
      UPDATE admin_deposit_requests
      SET status = 'approved', pair_id = ${pairId}, approved_at = NOW()
      WHERE id = ${request.id}
      RETURNING *
    `;
    await sql`
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        ${request.member_id}::uuid, 'deposit_confirmed', 'Deposit approved',
        ${'UGX ' + Number(request.amount).toLocaleString() + ' was approved by your community admin.'},
        ${JSON.stringify({ group_id: request.group_id, request_id: request.id })}::jsonb
      )
    `;
    await writeAudit(req.adminUser.id, 'approve_deposit', 'transaction', request.id, {
      amount: Number(request.amount),
    });
    res.json({ success: true, request: updated[0] });
  } catch (err) {
    console.error('admin approve:', err);
    res.status(400).json({ error: dbMessage(err) });
  }
});

router.get('/profile', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    const sql = getDb();
    const [stats, activity] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS total_collected,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count
        FROM admin_deposit_requests WHERE admin_id = ${req.adminUser.id}
      `,
      sql`
        SELECT action, entity_type, created_at
        FROM admin_audit_log
        WHERE admin_id = ${req.adminUser.id}
        ORDER BY created_at DESC
        LIMIT 30
      `,
    ]);
    res.json({
      user: publicAdmin(req.adminUser, req.admin),
      stats: stats[0] || {},
      activity,
    });
  } catch (err) {
    console.error('admin profile:', err);
    res.status(500).json({ error: dbMessage(err) });
  }
});

router.post('/pin', requireAuth, requireCommunityAdmin, async (req, res) => {
  try {
    if (!(await assertPin(req, res))) return;
    const nextPin = parsePin(req.body.newPin || req.body.new_pin);
    if (!nextPin) return res.status(400).json({ error: 'Enter a new 4-digit PIN' });
    const pinHash = await hashPin(nextPin);
    const sql = getDb();
    await sql`
      UPDATE community_admins SET pin_hash = ${pinHash}, updated_at = NOW()
      WHERE user_id = ${req.adminUser.id}
    `;
    await writeAudit(req.adminUser.id, 'change_pin', 'admin', req.adminUser.id, {});
    res.json({ success: true });
  } catch (err) {
    console.error('admin pin:', err);
    res.status(500).json({ error: 'Could not update PIN' });
  }
});

module.exports = router;
