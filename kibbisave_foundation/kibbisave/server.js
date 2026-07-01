// ============================================================
// KIBBISAVE — MAIN SERVER
// npm install express dotenv cors
// node server.js
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const { router: authRouter } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'KibbiSave API running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KibbiSave API running on port ${PORT}`);
});
