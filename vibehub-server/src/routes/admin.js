const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Check if user is an admin
function isAdmin(userId) {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM server_admins WHERE user_id = ?').get(userId);
}

// Ensure first user becomes admin automatically
function ensureFirstAdmin() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM server_admins').get();
  if (count.c === 0) {
    const firstUser = db.prepare('SELECT id, username FROM users ORDER BY created_at ASC LIMIT 1').get();
    if (firstUser) {
      db.prepare('INSERT OR IGNORE INTO server_admins (user_id, username, added_by) VALUES (?, ?, ?)').run(firstUser.id, firstUser.username, 'system');
    }
  }
}

// Middleware: admin only
function adminOnly(req, res, next) {
  if (!isAdmin(req.user.id)) return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// GET /api/admin/status - check if server has admins, and if current user is admin
router.get('/status', requireAuth, (req, res) => {
  ensureFirstAdmin();
  const admins = getDb().prepare('SELECT user_id, username, added_by, created_at FROM server_admins').all();
  res.json({ admins, isAdmin: isAdmin(req.user.id) });
});

// POST /api/admin/add - add an admin (admin only)
router.post('/add', requireAuth, adminOnly, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const db = getDb();
  const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (isAdmin(user.id)) return res.status(409).json({ error: 'Already admin' });
  db.prepare('INSERT INTO server_admins (user_id, username, added_by) VALUES (?, ?, ?)').run(user.id, user.username, req.user.username);
  res.json({ added: { id: user.id, username: user.username } });
});

// POST /api/admin/remove - remove an admin (admin only, can't remove self)
router.post('/remove', requireAuth, adminOnly, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (userId === req.user.id) return res.status(400).json({ error: '不能移除自己' });
  getDb().prepare('DELETE FROM server_admins WHERE user_id = ?').run(userId);
  res.json({ removed: true });
});

// ---- Push requests ----

// POST /api/admin/can-push - lightweight pre-flight check
router.post('/can-push', requireAuth, (req, res) => {
  const { projectId } = req.body;
  if (isAdmin(req.user.id)) return res.json({ ok: true });
  // Check existing approval
  const db = getDb();
  const approved = db.prepare('SELECT id FROM push_requests WHERE project_id = ? AND user_id = ? AND status = ?').get(projectId, req.user.id, 'approved');
  if (approved) return res.json({ ok: true });
  res.json({ ok: false, reason: '没有上传权限，需要管理员审批', needApproval: true });
});

// POST /api/admin/request-push - submit a push request
router.post('/request-push', requireAuth, (req, res) => {
  const { projectId, summary, fileCount } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  // Admins don't need approval
  if (isAdmin(req.user.id)) return res.json({ approved: true, message: '管理员无需审批' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM push_requests WHERE project_id = ? AND user_id = ? AND status = ?').get(projectId, req.user.id, 'pending');
  if (existing) return res.json({ waiting: true, message: '已有待审批的推送请求' });
  db.prepare('INSERT INTO push_requests (project_id, user_id, username, file_count, summary) VALUES (?, ?, ?, ?, ?)').run(projectId, req.user.id, req.user.username, fileCount || 0, summary || '');
  res.json({ waiting: true, message: '已提交推送请求，等待管理员审批' });
});

// GET /api/admin/push-requests - list pending requests (admin only)
router.get('/push-requests', requireAuth, adminOnly, (req, res) => {
  const requests = getDb().prepare('SELECT * FROM push_requests WHERE status = ? ORDER BY created_at DESC').all('pending');
  res.json({ requests });
});

// POST /api/admin/review-push - approve/reject a push request
router.post('/review-push', requireAuth, adminOnly, (req, res) => {
  const { requestId, approved } = req.body;
  const db = getDb();
  const req_ = db.prepare('SELECT * FROM push_requests WHERE id = ? AND status = ?').get(requestId, 'pending');
  if (!req_) return res.status(404).json({ error: 'Request not found' });
  db.prepare('UPDATE push_requests SET status = ?, reviewed_by = ? WHERE id = ?').run(approved ? 'approved' : 'rejected', req.user.username, requestId);
  res.json({ reviewed: true, approved });
});

module.exports = { router, isAdmin, ensureFirstAdmin };
