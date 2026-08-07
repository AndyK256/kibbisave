// ============================================================
// KIBBISAVE — SESSIONS (HMAC-signed tokens, no extra packages)
// Token = base64(payload).signature — signed with SESSION_SECRET
// Sent as httpOnly cookie (kibbi_session) AND accepted as Bearer
// ============================================================
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Don't crash the whole server if .env isn't filled in yet —
// static pages still work, API calls return clear errors instead.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('⚠  SUPABASE_URL / SUPABASE_SERVICE_KEY missing in .env — pages will load but data calls will fail until you fill them in.');
}
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://not-configured.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'not-configured'
);

const SECRET = process.env.SESSION_SECRET || 'change-me-in-env';
const SESSION_DAYS = 30;

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

// Create a token for a user: { id, phone }
function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    uid: user.id,
    phone: user.phone,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Verify a token → payload or null
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.uid || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

// Pull token from Authorization: Bearer ... or the kibbi_session cookie
function tokenFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookies = req.headers.cookie;
  if (cookies) {
    for (const part of cookies.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === 'kibbi_session') return decodeURIComponent(v.join('='));
    }
  }
  return null;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `kibbi_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'kibbi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// Middleware: REQUIRED login
async function authenticateUser(req, res, next) {
  try {
    const data = verifyToken(tokenFromRequest(req));
    if (!data) return res.status(401).json({ error: 'Not logged in' });
    const { data: user } = await supabase
      .from('users').select('*').eq('id', data.uid).single();
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Middleware: OPTIONAL login (req.user set if valid, else null)
// Spec: whole app browsable logged out; login only required to join/create
async function optionalAuth(req, res, next) {
  try {
    const data = verifyToken(tokenFromRequest(req));
    if (data) {
      const { data: user } = await supabase
        .from('users').select('*').eq('id', data.uid).single();
      req.user = user || null;
    } else {
      req.user = null;
    }
  } catch { req.user = null; }
  next();
}

module.exports = {
  createToken, verifyToken, tokenFromRequest,
  setSessionCookie, clearSessionCookie,
  authenticateUser, optionalAuth, supabase
};
