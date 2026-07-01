const express = require('express');
const jwt = require('jsonwebtoken');
const { findOrCreateGoogleUser } = require('../lib/users');
const { sendWelcomeEmail } = require('../lib/email');
const { signSession, COOKIE_OPTS } = require('../lib/session');

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

router.get('/me', (req, res) => {
  const token = req.cookies?.kibbisave_token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ authenticated: true, user });
  } catch {
    return res.json({ authenticated: false });
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

    if (user.isNewUser) {
      try {
        await sendWelcomeEmail({ to: profile.email, name: profile.name });
      } catch (emailErr) {
        console.error('Welcome email failed:', emailErr.message);
      }
    }

    const token = signSession(user);
    res.cookie('kibbisave_token', token, COOKIE_OPTS);
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
