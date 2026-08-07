const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.kibbisave_token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Optional login: sets req.user if a valid session exists, else null.
// Spec: whole app browsable logged out; login only needed to join/create.
function optionalAuth(req, res, next) {
  const token = req.cookies?.kibbisave_token;
  req.user = null;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch {}
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
