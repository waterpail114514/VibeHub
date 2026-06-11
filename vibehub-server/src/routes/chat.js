const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/projects/:id/messages
router.get('/:id/messages', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const msgs = db.prepare('SELECT * FROM messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 200').all(req.params.id);
  res.json({ messages: msgs.reverse() });
});

// POST /api/projects/:id/messages
router.post('/:id/messages', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '消息不能为空' });
  const db = getDb();
  const info = db.prepare('INSERT INTO messages (project_id, user_id, username, content) VALUES (?, ?, ?, ?)').run(req.params.id, req.user.id, req.user.username, content.trim());
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ message: msg });
});

module.exports = router;
