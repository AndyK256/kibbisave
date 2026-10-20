const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { findOrCreateGoogleUser, isProfileComplete } = require('../api/lib/users');
const { loadAdminRow } = require('./community-admin-lib');
const { signSession, COOKIE_OPTS } = require('../api/lib/session');

// Google credentials stay on the server. The app receives only the public web client ID.
function createRouter(overrides = {}) {
  const deps = {
    verify: async (idToken, audience) => {
      const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
      return ticket.getPayload();
    },
    findUser: findOrCreateGoogleUser, profileComplete: isProfileComplete,
    loadAdmin: loadAdminRow, signSession,
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.JWT_SECRET,
    ...overrides,
  };
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/challenge', (req, res) => {
    if (!deps.clientId() || !deps.secret()) return res.status(503).json({ error: 'Google sign-in is not configured.' });
    const audience = req.query.audience;
    if (!['user', 'admin'].includes(audience)) return res.status(400).json({ error: 'Invalid app audience.' });
    const nonce = crypto.randomBytes(32).toString('base64url');
    const challenge = jwt.sign({ nonce, app: audience }, deps.secret(), {
      expiresIn: '5m', audience: 'kibbisave-native-google', issuer: 'kibbisave',
    });
    res.json({ clientId: deps.clientId(), nonce, challenge });
  });
  router.post('/', async (req, res) => {
    try {
      const { idToken, challenge } = req.body || {};
      if (typeof idToken !== 'string' || idToken.length > 10000 || typeof challenge !== 'string' || challenge.length > 2000) {
        return res.status(400).json({ error: 'Google sign-in token and challenge are required.' });
      }
      let flow, identity;
      try {
        flow = jwt.verify(challenge, deps.secret(), {
          algorithms: ['HS256'], audience: 'kibbisave-native-google', issuer: 'kibbisave',
        });
        if (!['user', 'admin'].includes(flow.app)) throw new Error('Invalid audience');
        identity = await deps.verify(idToken, deps.clientId());
        if (!identity?.sub || !identity.email || identity.email_verified !== true ||
            identity.nonce !== flow.nonce || !Number.isFinite(identity.iat) ||
            Date.now() / 1000 - identity.iat > 600 || identity.iat > Date.now() / 1000 + 60) {
          throw new Error('Invalid identity');
        }
      } catch {
        return res.status(401).json({ error: 'Google sign-in expired or could not be verified. Please try again.' });
      }
      const user = await deps.findUser({ googleId: identity.sub, email: identity.email,
        name: identity.name, picture: identity.picture });
      // Match the website's onboarding requirements before issuing a native session.
      if (!deps.profileComplete(user)) return res.status(403).json({
        error: 'Finish your account setup on kibbisave.com, then sign in again.', code: 'PROFILE_REQUIRED',
      });
      if (flow.app === 'admin') {
        const admin = await deps.loadAdmin(user.id);
        if (!admin?.kyc_complete || !admin.pin_hash) return res.status(403).json({
          error: 'Complete admin verification and PIN setup on the admin website first.', code: 'ADMIN_REQUIRED',
        });
      }
      res.cookie('kibbisave_token', deps.signSession(user), COOKIE_OPTS);
      res.json({ success: true, kycComplete: flow.app === 'admin',
        user: { id: user.id, name: user.display_name || user.name, email: user.email } });
    } catch (err) {
      console.error('Native Google sign-in failed:', err.code || err.name);
      res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again.' });
    }
  });
  return router;
}
module.exports = createRouter;
