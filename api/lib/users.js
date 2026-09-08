const bcrypt = require('bcryptjs');
const { getDb, isDbConfigured } = require('../db');
const { validateAvatarDataUrl } = require('./avatar');
const { findUserRecord } = require('./profile');

const BCRYPT_ROUNDS = 12;

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = '256' + digits.slice(1);
  }
  if (digits.length === 9) {
    digits = '256' + digits;
  }
  if (!digits.startsWith('256')) {
    digits = '256' + digits.replace(/^256/, '');
  }
  if (digits.length < 12 || digits.length > 15) return null;
  return '+' + digits;
}

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function isProfileComplete(row) {
  if (!row) return false;
  if (row.profile_complete === true) return true;
  const phone = row.phone && String(row.phone).trim();
  const nin = row.nin && String(row.nin).trim();
  const district = (row.district || row.location) && String(row.district || row.location).trim();
  const nationality = row.nationality && String(row.nationality).trim();
  return Boolean(phone && nin && district && nationality && district !== 'Uganda');
}

function missingProfileFields(row) {
  const missing = [];
  if (!row?.phone) missing.push('phone');
  if (!row?.nin) missing.push('nin');
  if (!(row?.district || (row?.location && row.location !== 'Uganda'))) missing.push('district');
  if (!row?.nationality) missing.push('nationality');
  return missing;
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), hash);
}

const USER_SELECT = `
  id, google_id, email, display_name, avatar_url, avatar_custom,
  location, phone, first_name, last_name, district, nationality, nin,
  password_hash, terms_accepted_at, profile_complete, created_at
`;

async function findOrCreateGoogleUser(profile) {
  if (!isDbConfigured()) {
    const names = splitName(profile.name);
    return {
      id: profile.googleId,
      google_id: profile.googleId,
      email: profile.email,
      display_name: profile.name,
      avatar_url: profile.picture,
      first_name: names.firstName,
      last_name: names.lastName,
      isNewUser: true,
      profile_complete: false,
      source: 'token',
    };
  }

  const sql = getDb();
  const existing = await sql`
    SELECT id, google_id, email, display_name, avatar_url, avatar_custom,
           location, phone, first_name, last_name, district, nationality, nin,
           terms_accepted_at, profile_complete, created_at
    FROM users
    WHERE google_id = ${profile.googleId} OR email = ${profile.email}
    LIMIT 1
  `;

  if (existing.length) {
    const user = existing[0];
    const keepCustom = Boolean(user.avatar_custom);
    const names = splitName(profile.name);
    await sql`
      UPDATE users
      SET google_id = ${profile.googleId},
          display_name = ${profile.name},
          first_name = COALESCE(first_name, ${names.firstName}),
          last_name = COALESCE(last_name, ${names.lastName}),
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

  const names = splitName(profile.name);
  const inserted = await sql`
    INSERT INTO users (
      google_id, email, display_name, avatar_url, first_name, last_name, nationality, profile_complete
    )
    VALUES (
      ${profile.googleId}, ${profile.email}, ${profile.name}, ${profile.picture},
      ${names.firstName}, ${names.lastName}, 'Ugandan', false
    )
    RETURNING id, google_id, email, display_name, avatar_url, location, phone,
              first_name, last_name, district, nationality, nin,
              terms_accepted_at, profile_complete, created_at
  `;

  return { ...inserted[0], isNewUser: true, source: 'database' };
}

async function registerPasswordUser(input) {
  if (!isDbConfigured()) {
    const err = new Error('Database not configured');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    const err = new Error('Enter a valid Uganda mobile number');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  const password = String(input.password || '');
  if (password.length < 4) {
    const err = new Error('Password must be at least 4 characters');
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  const firstName = String(input.firstName || input.first_name || '').trim().slice(0, 80);
  const lastName = String(input.lastName || input.last_name || '').trim().slice(0, 80);
  const district = String(input.district || input.location || '').trim().slice(0, 80);
  const nationality = String(input.nationality || 'Ugandan').trim().slice(0, 80) || 'Ugandan';
  const nin = String(input.nin || input.national_id || '').trim().toUpperCase().slice(0, 32);

  if (!firstName || !lastName) {
    const err = new Error('First and last name are required');
    err.code = 'MISSING_NAME';
    throw err;
  }
  if (!district) {
    const err = new Error('Select your location (district)');
    err.code = 'MISSING_DISTRICT';
    throw err;
  }
  if (!nin || nin.length < 5) {
    const err = new Error('Enter a valid National Identification Number (NIN)');
    err.code = 'INVALID_NIN';
    throw err;
  }
  if (!input.termsAccepted && !input.terms_accepted) {
    const err = new Error('Accept the Terms and Conditions to continue');
    err.code = 'TERMS_REQUIRED';
    throw err;
  }

  const sql = getDb();
  const clash = await sql`
    SELECT id FROM users
    WHERE phone = ${phone} OR nin = ${nin}
    LIMIT 1
  `;
  if (clash.length) {
    const err = new Error('An account with this phone or NIN already exists. Log in instead.');
    err.code = 'ACCOUNT_EXISTS';
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const displayName = `${firstName} ${lastName}`.trim();

  try {
    const inserted = await sql`
      INSERT INTO users (
        email, phone, password_hash, display_name, first_name, last_name,
        district, location, nationality, nin, terms_accepted_at, profile_complete
      )
      VALUES (
        NULL, ${phone}, ${passwordHash}, ${displayName}, ${firstName}, ${lastName},
        ${district}, ${district}, ${nationality}, ${nin}, NOW(), true
      )
      RETURNING id, google_id, email, display_name, avatar_url, location, phone,
                first_name, last_name, district, nationality, nin,
                terms_accepted_at, profile_complete, created_at
    `;
    return { ...inserted[0], isNewUser: true, source: 'database' };
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('An account with this phone or NIN already exists. Log in instead.');
      err.code = 'ACCOUNT_EXISTS';
      throw err;
    }
    throw e;
  }
}

async function loginWithPassword(identifier, password) {
  if (!isDbConfigured()) {
    const err = new Error('Database not configured');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }

  const raw = String(identifier || '').trim();
  if (!raw || !password) {
    const err = new Error('Enter your mobile number (or email) and password');
    err.code = 'MISSING_CREDENTIALS';
    throw err;
  }

  const sql = getDb();
  let rows = [];

  if (raw.includes('@')) {
    rows = await sql`
      SELECT id, google_id, email, display_name, avatar_url, location, phone,
             first_name, last_name, district, nationality, nin, password_hash,
             terms_accepted_at, profile_complete, created_at
      FROM users WHERE lower(email) = ${raw.toLowerCase()} LIMIT 1
    `;
  } else {
    const phone = normalizePhone(raw);
    if (phone) {
      rows = await sql`
        SELECT id, google_id, email, display_name, avatar_url, location, phone,
               first_name, last_name, district, nationality, nin, password_hash,
               terms_accepted_at, profile_complete, created_at
        FROM users WHERE phone = ${phone} LIMIT 1
      `;
    }
  }

  if (!rows.length) {
    try {
      rows = await sql`
        SELECT id, google_id, email, display_name, avatar_url, location, phone,
               first_name, last_name, district, nationality, nin, password_hash,
               terms_accepted_at, profile_complete, created_at
        FROM users WHERE lower(username) = ${raw.toLowerCase()} LIMIT 1
      `;
    } catch {
      rows = [];
    }
  }

  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
    const err = new Error('Incorrect mobile number/email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const { password_hash, ...user } = rows[0];
  return user;
}

async function completeUserProfile(sessionUser, input) {
  if (!isDbConfigured()) {
    const err = new Error('Database not configured');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }

  const row = await findUserRecord(sessionUser);
  if (!row) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const phone = input.phone != null ? normalizePhone(input.phone) : row.phone;
  const district = input.district != null || input.location != null
    ? String(input.district || input.location || '').trim().slice(0, 80)
    : (row.district || (row.location !== 'Uganda' ? row.location : ''));
  const nationality = input.nationality != null
    ? String(input.nationality || '').trim().slice(0, 80) || 'Ugandan'
    : (row.nationality || 'Ugandan');
  const nin = input.nin != null || input.national_id != null
    ? String(input.nin || input.national_id || '').trim().toUpperCase().slice(0, 32)
    : row.nin;
  const firstName = input.firstName != null || input.first_name != null
    ? String(input.firstName || input.first_name || '').trim().slice(0, 80)
    : row.first_name;
  const lastName = input.lastName != null || input.last_name != null
    ? String(input.lastName || input.last_name || '').trim().slice(0, 80)
    : row.last_name;

  if (!phone) {
    const err = new Error('Enter a valid Uganda mobile number');
    err.code = 'INVALID_PHONE';
    throw err;
  }
  if (!district) {
    const err = new Error('Select your location (district)');
    err.code = 'MISSING_DISTRICT';
    throw err;
  }
  if (!nin || nin.length < 5) {
    const err = new Error('Enter a valid National Identification Number (NIN)');
    err.code = 'INVALID_NIN';
    throw err;
  }

  const sql = getDb();
  const clash = await sql`
    SELECT id FROM users
    WHERE id <> ${row.id}
      AND ((phone IS NOT NULL AND phone = ${phone}) OR (nin IS NOT NULL AND nin = ${nin}))
    LIMIT 1
  `;
  if (clash.length) {
    const err = new Error('That phone or NIN is already used by another account');
    err.code = 'ACCOUNT_EXISTS';
    throw err;
  }

  const displayName = [firstName || row.first_name, lastName || row.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || row.display_name;

  const updated = await sql`
    UPDATE users SET
      phone = ${phone},
      nin = ${nin},
      district = ${district},
      location = ${district},
      nationality = ${nationality},
      first_name = COALESCE(${firstName || null}, first_name),
      last_name = COALESCE(${lastName || null}, last_name),
      display_name = ${displayName},
      terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
      profile_complete = true,
      updated_at = NOW()
    WHERE id = ${row.id}
    RETURNING id, google_id, email, display_name, avatar_url, location, phone,
              first_name, last_name, district, nationality, nin,
              terms_accepted_at, profile_complete, created_at
  `;

  return updated[0];
}

async function getUserAuthState(sessionUser) {
  const row = await findUserRecord(sessionUser);
  if (!row) {
    return {
      authenticated: true,
      profileComplete: false,
      missingFields: ['phone', 'nin', 'district', 'nationality'],
      user: sessionUser,
    };
  }
  return {
    authenticated: true,
    profileComplete: isProfileComplete(row),
    missingFields: missingProfileFields(row),
    user: row,
  };
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

module.exports = {
  findOrCreateGoogleUser,
  updateUserAvatar,
  registerPasswordUser,
  loginWithPassword,
  completeUserProfile,
  getUserAuthState,
  isProfileComplete,
  missingProfileFields,
  normalizePhone,
  hashPassword,
  verifyPassword,
};
