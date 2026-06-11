const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/projects/:id/changelogs
router.get('/:id/changelogs', (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM changelogs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json({ changelogs: logs });
});

// POST /api/projects/:id/changelogs
router.post('/:id/changelogs', requireAuth, (req, res) => {
  const { content, version, isAiGenerated } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '内容不能为空' });
  const db = getDb();
  const info = db.prepare('INSERT INTO changelogs (project_id, user_id, username, version, content, is_ai_generated) VALUES (?, ?, ?, ?, ?, ?)').run(req.params.id, req.user.id, req.user.username, version || null, content.trim(), isAiGenerated ? 1 : 0);
  const log = db.prepare('SELECT * FROM changelogs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ changelog: log });
});

module.exports = router;
