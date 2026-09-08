const bcrypt = require('bcryptjs');
const { getDb, isDbConfigured } = require('../api/db');
const { findUserRecord } = require('../api/lib/profile');
const { hashPassword, verifyPassword, normalizePhone } = require('../api/lib/users');
const { validateAvatarDataUrl } = require('../api/lib/avatar');

const PIN_ROUNDS = 12;
const PERIODS = [2, 3, 5, 8, 12];

function dbMessage(err) {
  return (err && err.message) || 'Request failed';
}

function publicAdmin(user, admin) {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    name: user.display_name || null,
    email: user.email || null,
    phone: user.phone || null,
    nin: user.nin || null,
    address: admin?.address || null,
    photoScanUrl: admin?.photo_scan_url || user.avatar_url || null,
    kycComplete: Boolean(admin?.kyc_complete && admin?.pin_hash),
    hasPin: Boolean(admin?.pin_hash),
  };
}

function normalizeUsername(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 24);
  if (value.length < 3) return null;
  return value;
}

function normalizeNin(raw) {
  return String(raw || '').trim().toUpperCase().slice(0, 32);
}

function parsePin(raw) {
  const pin = String(raw || '').trim();
  if (!/^\d{4}$/.test(pin)) return null;
  return pin;
}

async function hashPin(pin) {
  return bcrypt.hash(pin, PIN_ROUNDS);
}

async function loadAdminRow(userId) {
  if (!isDbConfigured()) return null;
  const sql = getDb();
  const rows = await sql`
    SELECT user_id, address, photo_scan_url, pin_hash, kyc_complete, created_at
    FROM community_admins WHERE user_id = ${userId} LIMIT 1
  `;
  return rows[0] || null;
}

async function writeAudit(adminId, action, entityType, entityId, data) {
  if (!isDbConfigured() || !adminId) return;
  try {
    const sql = getDb();
    await sql`
      INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, data)
      VALUES (
        ${adminId}::uuid, ${action}, ${entityType || null},
        ${entityId ? String(entityId) : null},
        ${JSON.stringify(data || {})}::jsonb
      )
    `;
  } catch (err) {
    console.error('admin audit skipped:', err.message);
  }
}

function onTrackGapFromMember(member) {
  if (!member) return 0;
  const goal = Number(member.goal_amount) || 0;
  const deposited = Number(member.total_deposited) || 0;
  const joined = member.joined_at ? new Date(member.joined_at) : new Date();
  const ends = member.ends_at ? new Date(member.ends_at) : null;
  const now = Date.now();
  const totalMs = ends ? Math.max(1, ends.getTime() - joined.getTime()) : Math.max(1, (Number(member.period_months) || 1) * 30 * 86400000);
  const elapsedMs = Math.max(0, now - joined.getTime());
  const expected = goal * Math.min(1, elapsedMs / totalMs);
  return Math.round(expected - deposited);
}

async function memberSchedule(sql, userId, groupId) {
  const rows = await sql`
    SELECT gm.goal_amount, gm.total_deposited, gm.daily_rate, gm.joined_at, gm.ends_at,
           gm.avg_lead, gm.rank_in_group, g.period_months, g.name AS group_name, g.code AS group_code
    FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.user_id = ${userId} AND gm.group_id = ${groupId} AND gm.status = 'active'
    LIMIT 1
  `;
  const member = rows[0] || null;
  return {
    member,
    amountOnTrackGap: onTrackGapFromMember(member),
  };
}

async function assignPublicGroup(sql, userId, periodMonths, goalAmount, savingFor) {
  const months = PERIODS.includes(Number(periodMonths)) ? Number(periodMonths) : 12;
  try {
    await sql`SELECT ensure_open_groups()`;
  } catch (err) {
    console.error('ensure_open_groups:', err.message);
  }

  let candidates = await sql`
    SELECT id, period_months, current_members, max_members, starts_at
    FROM groups
    WHERE is_system = TRUE
      AND status = 'open'
      AND COALESCE(current_members, 0) < COALESCE(max_members, 7)
      AND ABS(period_months - ${months}) <= 1
      AND (
        first_member_at IS NULL
        OR ABS(EXTRACT(EPOCH FROM (NOW() - COALESCE(starts_at, NOW()))) / 86400.0) <= 30
      )
    ORDER BY ABS(period_months - ${months}) ASC,
             current_members DESC NULLS LAST
    LIMIT 1
  `;

  if (!candidates.length) {
    candidates = await sql`
      SELECT id, period_months, current_members, max_members
      FROM groups
      WHERE is_system = TRUE
        AND status = 'open'
        AND COALESCE(current_members, 0) < COALESCE(max_members, 7)
        AND period_months = ${months}
      ORDER BY current_members DESC NULLS LAST
      LIMIT 1
    `;
  }

  let groupId = candidates[0] && candidates[0].id;
  if (!groupId) {
    const created = await sql`
      INSERT INTO groups (
        is_system, is_private, period_months, max_members, target_amount,
        starts_at, closes_at, status
      ) VALUES (
        TRUE, FALSE, ${months}, 7, 0,
        CURRENT_DATE::timestamptz,
        (CURRENT_DATE + (${months} || ' months')::INTERVAL)::timestamptz,
        'open'
      )
      RETURNING id
    `;
    groupId = created[0].id;
  }

  await sql`
    SELECT join_open_group(
      ${userId}::uuid, ${groupId}::uuid,
      ${Math.round(Number(goalAmount) || 0)}::bigint,
      ${savingFor || 'Community savings'}, NULL
    )
  `;
  return groupId;
}

async function resolveMemberAdmin(sql, memberId, communityId) {
  if (communityId) {
    const rows = await sql`
      SELECT c.id AS community_id, c.name AS community_name, c.created_by AS admin_id
      FROM communities c
      JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = ${memberId}
      JOIN community_admins ca ON ca.user_id = c.created_by AND ca.kyc_complete = TRUE
      WHERE c.id = ${communityId}::uuid
        AND c.is_public = FALSE
      LIMIT 1
    `;
    return rows[0] || null;
  }
  const rows = await sql`
    SELECT c.id AS community_id, c.name AS community_name, c.created_by AS admin_id
    FROM community_members cm
    JOIN communities c ON c.id = cm.community_id
    JOIN community_admins ca ON ca.user_id = c.created_by AND ca.kyc_complete = TRUE
    WHERE cm.user_id = ${memberId}
      AND c.is_public = FALSE
    ORDER BY cm.joined_at DESC
    LIMIT 2
  `;
  if (!rows.length) return null;
  if (rows.length > 1 && String(rows[0].admin_id) !== String(rows[1].admin_id)) {
    return { ambiguous: true, options: rows };
  }
  return rows[0];
}

async function requireCommunityAdmin(req, res, next) {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const user = await findUserRecord(req.user);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const admin = await loadAdminRow(user.id);
    if (!admin || !admin.kyc_complete || !admin.pin_hash) {
      return res.status(403).json({
        error: 'Complete community admin KYC and PIN to continue',
        code: 'ADMIN_KYC_REQUIRED',
        user: publicAdmin(user, admin),
      });
    }
    req.adminUser = user;
    req.admin = admin;
    next();
  } catch (err) {
    console.error('requireCommunityAdmin:', err);
    res.status(500).json({ error: 'Could not verify admin session' });
  }
}

async function assertPin(req, res) {
  const pin = parsePin(req.body && req.body.pin);
  if (!pin) {
    res.status(400).json({ error: 'Enter your 4-digit approval PIN' });
    return false;
  }
  const ok = await bcrypt.compare(pin, req.admin.pin_hash);
  if (!ok) {
    res.status(403).json({ error: 'Incorrect PIN' });
    return false;
  }
  return true;
}

async function confirmGroupDeposit(sql, userId, groupId, amount, provider, phone) {
  const rec = await sql`
    SELECT record_deposit(
      ${userId}::uuid, ${groupId}::uuid, ${Math.round(Number(amount) || 0)}::bigint,
      ${provider || 'manual'}, ${'ADM-' + Date.now()}, ${phone || null}
    ) AS pair_id
  `;
  await sql`SELECT confirm_deposit(${rec[0].pair_id}::uuid)`;
  return rec[0].pair_id;
}

module.exports = {
  PERIODS,
  dbMessage,
  publicAdmin,
  normalizeUsername,
  normalizeNin,
  parsePin,
  hashPin,
  loadAdminRow,
  writeAudit,
  onTrackGapFromMember,
  memberSchedule,
  assignPublicGroup,
  resolveMemberAdmin,
  requireCommunityAdmin,
  assertPin,
  confirmGroupDeposit,
  hashPassword,
  verifyPassword,
  normalizePhone,
  validateAvatarDataUrl,
};
