const { getDb, isDbConfigured } = require('../db');
const { validateAvatarDataUrl } = require('./avatar');
const { findUserRecord } = require('./profile');

async function findOrCreateGoogleUser(profile) {
  if (!isDbConfigured()) {
    return {
      id: profile.googleId,
      google_id: profile.googleId,
      email: profile.email,
      display_name: profile.name,
      avatar_url: profile.picture,
      isNewUser: true,
      source: 'token',
    };
  }

  const sql = getDb();
  const existing = await sql`
    SELECT id, google_id, email, display_name, avatar_url, avatar_custom, created_at
    FROM users
    WHERE google_id = ${profile.googleId} OR email = ${profile.email}
    LIMIT 1
  `;

  if (existing.length) {
    const user = existing[0];
    const keepCustom = Boolean(user.avatar_custom);
    await sql`
      UPDATE users
      SET google_id = ${profile.googleId},
          display_name = ${profile.name},
          avatar_url = CASE
            WHEN COALESCE(avatar_custom, false) THEN avatar_url
            ELSE ${profile.picture}
          END,
          updated_at = NOW()
      WHERE id = ${user.id}
    `;
    return {
      ...user,
      avatar_url: keepCustom ? user.avatar_url : profile.picture,
      isNewUser: false,
      source: 'database',
    };
  }

  const inserted = await sql`
    INSERT INTO users (google_id, email, display_name, avatar_url)
    VALUES (${profile.googleId}, ${profile.email}, ${profile.name}, ${profile.picture})
    RETURNING id, google_id, email, display_name, avatar_url, created_at
  `;

  return { ...inserted[0], isNewUser: true, source: 'database' };
}

async function updateUserAvatar(sessionUser, dataUrl) {
  if (!isDbConfigured()) {
    const err = new Error('Database not configured');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }

  const avatarUrl = validateAvatarDataUrl(dataUrl);
  const row = await findUserRecord(sessionUser);
  if (!row) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const sql = getDb();
  await sql`
    UPDATE users
    SET avatar_url = ${avatarUrl},
        avatar_custom = true,
        updated_at = NOW()
    WHERE id = ${row.id}
  `;

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: avatarUrl,
    google_id: row.google_id,
  };
}

module.exports = { findOrCreateGoogleUser, updateUserAvatar };
