// ============================================================
// KIBBISAVE — EXPRESS APP (shared by local server + Vercel)
// Local:  server.js requires this and listens on a port
// Vercel: /api/index.js exports this as a serverless function
// ============================================================
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');

const { router: authRouter } = require('./auth');
const { router: homeRouter } = require('./home');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- API routes ---
app.use('/auth', authRouter);        // original paths (curl tests in README)
app.use('/api/auth', authRouter);    // same routes under /api for the web app
app.use('/api', homeRouter);         // /api/home, /api/groups/:id/join, /api/deposits

// Health check
app.get('/health', (req, res) => res.json({ status: 'KibbiSave API running' }));
app.get('/api/health', (req, res) => res.json({ status: 'KibbiSave API running' }));

// --- Static web app (local dev only — Vercel serves /public itself) ---
if (!process.env.VERCEL) {
  const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
  app.use(express.static(PUBLIC_DIR));
  app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'kibbisave_home_final.html')));
  app.get('/login',  (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
  app.get('/signup', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'signup.html')));
}

module.exports = app;
