const express = require('express');
const { getDb } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Record edit history (called internally)
function recordHistory(projectId, userId, username, action, summary, fileCount) {
  const db = getDb();
  db.prepare(
    'INSERT INTO edit_history (project_id, user_id, username, action, summary, file_count) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, userId, username, action, summary, fileCount || 0);
}

// GET /api/projects/:id/history - get edit timeline
router.get('/:id/history', optionalAuth, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const history = db.prepare(
    'SELECT * FROM edit_history WHERE project_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(req.params.id);

  res.json({ project, history });
});

module.exports = { router, recordHistory };
