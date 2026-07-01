const jwt = require('jsonwebtoken');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function signSession(user) {
  return jwt.sign(
    {
      userId: user.id || user.userId,
      email: user.email,
      name: user.display_name || user.name,
      picture: user.avatar_url || user.picture,
      googleId: user.google_id || user.googleId,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { signSession, COOKIE_OPTS };
