const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { buildProfile } = require('../lib/profile');
const { updateUserAvatar } = require('../lib/users');
const { signSession, COOKIE_OPTS } = require('../lib/session');

const router = express.Router();

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

module.exports = router;
