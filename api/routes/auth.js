const express = require('express');
const jwt = require('jsonwebtoken');
const {
  findOrCreateGoogleUser,
  registerPasswordUser,
  loginWithPassword,
  completeUserProfile,
  getUserAuthState,
  isProfileComplete,
} = require('../lib/users');
const { sendWelcomeEmail } = require('../lib/email');
const { signSession, COOKIE_OPTS } = require('../lib/session');
const { requireAuth } = require('../middleware/auth');

const PRODUCTION_URL = 'https://kibbisave.com';

function getAppUrl() {
  return process.env.APP_URL || (process.env.VERCEL === '1' ? PRODUCTION_URL : 'http://localhost:3000');
}

function getGoogleCallbackUrl() {
  return process.env.GOOGLE_CALLBACK_URL || `${getAppUrl()}/api/auth/google/callback`;
}

const router = express.Router();

function isGoogleConfigured() {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  const secret = process.env.GOOGLE_CLIENT_SECRET || '';
  return (
    id &&
    secret &&
    !id.includes('your-google-client-id') &&
    !secret.includes('your-google-client-secret')
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id || user.userId,
    email: user.email || null,
    name: user.display_name || user.name || null,
    picture: user.avatar_url || user.picture || null,
    phone: user.phone || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    district: user.district || user.location || null,
    nationality: user.nationality || null,
    nin: user.nin || null,
    profileComplete: isProfileComplete(user),
  };
}

function authError(res, err, fallbackStatus) {
  const map = {
    DATABASE_NOT_CONFIGURED: 503,
    INVALID_PHONE: 400,
    WEAK_PASSWORD: 400,
    MISSING_NAME: 400,
    MISSING_DISTRICT: 400,
    INVALID_NIN: 400,
    TERMS_REQUIRED: 400,
    ACCOUNT_EXISTS: 409,
    MISSING_CREDENTIALS: 400,
    INVALID_CREDENTIALS: 401,
    USER_NOT_FOUND: 404,
  };
  const status = map[err.code] || fallbackStatus || 500;
  if (status >= 500) console.error('Auth error:', err);
  return res.status(status).json({ error: err.message || 'Request failed', code: err.code || null });
}

router.get('/me', async (req, res) => {
  const token = req.cookies?.kibbisave_token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const sessionUser = jwt.verify(token, process.env.JWT_SECRET);
    try {
      const state = await getUserAuthState(sessionUser);
      return res.json({
        authenticated: true,
        profileComplete: state.profileComplete,
        missingFields: state.missingFields,
        user: publicUser(state.user || sessionUser),
      });
    } catch {
      return res.json({
        authenticated: true,
        profileComplete: false,
        missingFields: ['phone', 'nin', 'district', 'nationality'],
        user: {
          id: sessionUser.userId,
          email: sessionUser.email,
          name: sessionUser.name,
          picture: sessionUser.picture,
          profileComplete: false,
        },
      });
    }
  } catch {
    return res.json({ authenticated: false });
  }
});

router.post('/register', async (req, res) => {
  try {
    const user = await registerPasswordUser(req.body || {});
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    res.json({
      success: true,
      profileComplete: true,
      user: publicUser(user),
      redirect: '/kibbisave_home_final.html?signed_in=1',
    });
  } catch (err) {
    return authError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const identifier = body.phone || body.email || body.identifier || body.mobile;
    const user = await loginWithPassword(identifier, body.password);
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    const complete = isProfileComplete(user);
    res.json({
      success: true,
      profileComplete: complete,
      user: publicUser(user),
      redirect: complete
        ? '/kibbisave_home_final.html?signed_in=1'
        : '/login?complete=1',
    });
  } catch (err) {
    return authError(res, err);
  }
});

router.post('/complete-profile', requireAuth, async (req, res) => {
  try {
    const user = await completeUserProfile(req.user, req.body || {});
    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
    res.json({
      success: true,
      profileComplete: true,
      user: publicUser(user),
      redirect: '/kibbisave_home_final.html?signed_in=1',
    });
  } catch (err) {
    return authError(res, err);
  }
});

router.get('/google', (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).send(
      'Google sign-in is not fully configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env'
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const appUrl = getAppUrl();

  if (req.query.error) {
    return res.redirect(`${appUrl}/login?error=${encodeURIComponent(req.query.error)}`);
  }

  const { code } = req.query;
  if (!code) {
    return res.redirect(`${appUrl}/login?error=missing_code`);
  }

  if (!isGoogleConfigured()) {
    return res.redirect(`${appUrl}/login?error=not_configured`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: getGoogleCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Google token error:', tokens);
      return res.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      console.error('Google profile error:', profile);
      return res.redirect(`${appUrl}/login?error=profile_failed`);
    }

    const user = await findOrCreateGoogleUser({
      googleId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    if (user.isNewUser && profile.email) {
      try {
        await sendWelcomeEmail({ to: profile.email, name: profile.name });
      } catch (emailErr) {
        console.error('Welcome email failed:', emailErr.message);
      }
    }

    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);

    if (!isProfileComplete(user)) {
      return res.redirect(`${appUrl}/login?complete=1`);
    }
    res.redirect(`${appUrl}/kibbisave_home_final.html?signed_in=1`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`${appUrl}/login?error=server_error`);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('kibbisave_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ success: true });
});

module.exports = router;
