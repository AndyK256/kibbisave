const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const communityRoutes = require('./routes/communities');
const profileRoutes = require('./routes/profile');
const { requireAuth } = require('./middleware/auth');
const { isDbConfigured } = require('./db');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/profile', profileRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'KibbiSave API',
    database: isDbConfigured() ? 'configured' : 'not configured',
  });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  if (!isDbConfigured()) {
    return res.json({
      user: req.user,
      message: 'Connect DATABASE_URL to load live dashboard data',
    });
  }
  res.json({ user: req.user, groups: [], totalSaved: 0 });
});

module.exports = app;
