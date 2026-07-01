const express = require('express');
const { getDb, isDbConfigured } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.json({
      source: 'static',
      communities: [],
      message: 'Database not configured — showing static HTML pages only',
    });
  }
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, description, category, location, total_raised,
             total_members, total_groups, is_public, created_at
      FROM causes
      WHERE is_public = true
      ORDER BY total_members DESC
      LIMIT 50
    `;
    res.json({ source: 'database', communities: rows });
  } catch (err) {
    console.error('communities list error:', err.message);
    res.status(500).json({ error: 'Failed to load communities' });
  }
});

router.get('/:id', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, description, category, location, total_raised,
             total_members, total_groups, is_public, created_at
      FROM causes
      WHERE id = ${req.params.id}
      LIMIT 1
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Community not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('community detail error:', err.message);
    res.status(500).json({ error: 'Failed to load community' });
  }
});

module.exports = router;
