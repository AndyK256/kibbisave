const express = require('express');
const { getDb, isDbConfigured } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { buildProfile, findUserRecord } = require('../lib/profile');
const { updateUserAvatar } = require('../lib/users');
const { signSession, COOKIE_OPTS } = require('../lib/session');

const router = express.Router();

const PROVIDERS = ['mtn_momo', 'airtel', 'bank'];

function formatUgx(amount) {
  const n = Number(amount) || 0;
  return 'UGX ' + n.toLocaleString('en-UG');
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await buildProfile(req.user);
    res.json(profile);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

router.put('/avatar', requireAuth, async (req, res) => {
  try {
    const { image } = req.body || {};
    const user = await updateUserAvatar(req.user, image);
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    res.json({
      success: true,
      picture: user.avatar_url,
    });
  } catch (err) {
    if (err.code === 'DATABASE_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Saving a photo requires the database to be connected.' });
    }
    if (err.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'Account not found. Sign out and sign in again.' });
    }
    if (err.message === 'INVALID_TYPE') {
      return res.status(400).json({ error: 'Use a JPG, PNG, or WebP photo.' });
    }
    if (err.message === 'IMAGE_TOO_LARGE') {
      return res.status(400).json({ error: 'Photo is too large. Try a smaller image.' });
    }
    if (err.message === 'INVALID_IMAGE') {
      return res.status(400).json({ error: 'Could not read that photo. Try another file.' });
    }
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Could not save your photo' });
  }
});

// PATCH /api/profile — personal details
router.patch('/', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const body = req.body || {};
    const displayName = body.display_name != null
      ? String(body.display_name).trim().slice(0, 80)
      : null;
    const phone = body.phone != null
      ? String(body.phone).trim().slice(0, 32) || null
      : undefined;
    const location = body.location != null
      ? String(body.location).trim().slice(0, 80) || null
      : undefined;

    if (displayName !== null && !displayName) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const sql = getDb();
    const nextName = displayName !== null ? displayName : row.display_name;
    const nextPhone = phone === undefined ? row.phone : phone;
    const nextLocation = location === undefined ? row.location : location;

    const updated = await sql`
      UPDATE users SET
        display_name = ${nextName},
        phone = ${nextPhone || null},
        location = ${nextLocation || null}
      WHERE id = ${row.id}
      RETURNING id, email, display_name, phone, location, avatar_url
    `;
    const u = updated[0];
    res.json({
      success: true,
      user: {
        id: u.id,
        email: u.email,
        name: u.display_name,
        phone: u.phone,
        location: u.location,
        picture: u.avatar_url,
      },
    });
  } catch (err) {
    console.error('profile patch error:', err);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// GET /api/profile/history — savings / deposit history
router.get('/history', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ history: [] });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const rows = await sql`
      SELECT t.id, t.amount, t.status, t.provider, t.confirmed_at, t.initiated_at,
             g.name AS group_name, g.code AS group_code, g.id AS group_id
      FROM transactions t
      LEFT JOIN groups g ON g.id = t.group_id
      WHERE t.user_id = ${row.id}
        AND t.entry_type = 'credit'
      ORDER BY COALESCE(t.confirmed_at, t.initiated_at) DESC
      LIMIT 50
    `;
    const history = rows.map(function (r) {
      return {
        id: r.id,
        title: 'Deposit to ' + (r.group_name || r.group_code || 'group'),
        sub: (r.provider || 'deposit') + (r.status === 'confirmed' ? '' : ' · ' + r.status),
        amount: formatUgx(r.amount),
        date: formatWhen(r.confirmed_at || r.initiated_at),
        group_id: r.group_id,
        status: r.status,
      };
    });
    res.json({ history });
  } catch (err) {
    console.error('history error:', err);
    res.status(500).json({ error: 'Could not load savings history' });
  }
});

// GET /api/profile/notifications
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ notifications: [] });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const rows = await sql`
      SELECT id, type, title, body, data, is_read, created_at
      FROM notifications
      WHERE user_id = ${row.id}
      ORDER BY created_at DESC
      LIMIT 40
    `;
    res.json({ notifications: rows });
  } catch (err) {
    console.error('notifications error:', err);
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

// PATCH /api/profile/notifications/:id/read
router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    await sql`
      UPDATE notifications SET is_read = TRUE
      WHERE id = ${req.params.id} AND user_id = ${row.id} AND is_read = FALSE
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('mark read error:', err);
    res.status(500).json({ error: 'Could not update notification' });
  }
});

// GET / POST / DELETE payment methods
router.get('/payment-methods', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.json({ methods: [] });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const methods = await sql`
      SELECT id, provider, label, account_ref, is_default, created_at
      FROM payment_methods
      WHERE user_id = ${row.id}
      ORDER BY is_default DESC, created_at DESC
    `;
    res.json({ methods });
  } catch (err) {
    console.error('payment methods list error:', err);
    res.status(500).json({ error: 'Could not load payment methods' });
  }
});

router.post('/payment-methods', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const body = req.body || {};
    const provider = String(body.provider || '').trim();
    if (PROVIDERS.indexOf(provider) === -1) {
      return res.status(400).json({ error: 'Pick MTN MoMo, Airtel, or bank' });
    }
    const accountRef = String(body.account_ref || '').trim().slice(0, 64);
    if (!accountRef) return res.status(400).json({ error: 'Enter a phone or account number' });
    const label = String(body.label || '').trim().slice(0, 40) || null;
    const isDefault = body.is_default === true;

    const sql = getDb();
    if (isDefault) {
      await sql`UPDATE payment_methods SET is_default = FALSE WHERE user_id = ${row.id}`;
    }
    const inserted = await sql`
      INSERT INTO payment_methods (user_id, provider, label, account_ref, is_default)
      VALUES (${row.id}, ${provider}, ${label}, ${accountRef}, ${isDefault})
      RETURNING id, provider, label, account_ref, is_default, created_at
    `;
    res.json({ success: true, method: inserted[0] });
  } catch (err) {
    console.error('payment method create error:', err);
    res.status(500).json({ error: 'Could not save payment method' });
  }
});

router.delete('/payment-methods/:id', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    await sql`
      DELETE FROM payment_methods
      WHERE id = ${req.params.id} AND user_id = ${row.id}
    `;
    res.json({ success: true });
  } catch (err) {
    console.error('payment method delete error:', err);
    res.status(500).json({ error: 'Could not remove payment method' });
  }
});

// GET / PATCH app settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) {
      return res.json({
        settings: {
          language: 'en',
          notify_deposits: true,
          notify_ranks: true,
          notify_reminders: true,
          dark_mode: false,
        },
      });
    }
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const rows = await sql`
      SELECT settings FROM user_settings WHERE user_id = ${row.id} LIMIT 1
    `;
    const defaults = {
      language: 'en',
      notify_deposits: true,
      notify_ranks: true,
      notify_reminders: true,
      dark_mode: false,
    };
    const saved = rows.length && rows[0].settings ? rows[0].settings : {};
    res.json({ settings: Object.assign({}, defaults, saved) });
  } catch (err) {
    console.error('settings get error:', err);
    res.status(500).json({ error: 'Could not load settings' });
  }
});

router.patch('/settings', requireAuth, async (req, res) => {
  try {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database not configured' });
    const row = await findUserRecord(req.user);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const sql = getDb();
    const existingRows = await sql`
      SELECT settings FROM user_settings WHERE user_id = ${row.id} LIMIT 1
    `;
    const existing =
      existingRows.length && existingRows[0].settings ? existingRows[0].settings : {};

    const incoming = req.body || {};
    const next = Object.assign({}, existing, {
      language: ['en', 'lg', 'sw'].indexOf(incoming.language) >= 0 ? incoming.language : (existing.language || 'en'),
      notify_deposits: incoming.notify_deposits !== false,
      notify_ranks: incoming.notify_ranks !== false,
      notify_reminders: incoming.notify_reminders !== false,
    });
    if (typeof incoming.dark_mode === 'boolean') {
      next.dark_mode = incoming.dark_mode;
    } else if (typeof next.dark_mode !== 'boolean') {
      next.dark_mode = false;
    }

    await sql`
      INSERT INTO user_settings (user_id, settings, updated_at)
      VALUES (${row.id}, ${JSON.stringify(next)}::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET settings = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
    `;
    res.json({ success: true, settings: next });
  } catch (err) {
    console.error('settings patch error:', err);
    res.status(500).json({ error: 'Could not save settings' });
  }
});

module.exports = router;
