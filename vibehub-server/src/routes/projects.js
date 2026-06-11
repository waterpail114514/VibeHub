const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { deleteProjectDir, rebuildSnapshot } = require('../storage');
const { recordHistory } = require('./history');
const { checkLock } = require('../middleware/lock');

// GET /api/projects - List all projects
router.get('/', (req, res) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*, COUNT(fs.id) as file_count, COALESCE(SUM(fs.file_size), 0) as total_size
    FROM projects p
    LEFT JOIN file_snapshots fs ON fs.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all();

  // Batch-fetch delete requests and contributors in 2 queries
  if (projects.length > 0) {
    const ids = projects.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const drs = db.prepare(`SELECT * FROM delete_requests WHERE project_id IN (${placeholders}) AND status = 'pending'`).all(...ids);
    const contributors = db.prepare(`SELECT project_id, username FROM edit_history WHERE project_id IN (${placeholders}) GROUP BY project_id, username`).all(...ids);

    const drMap = {};
    drs.forEach(dr => { drMap[dr.project_id] = dr; });
    const contribMap = {};
    contributors.forEach(c => {
      if (!contribMap[c.project_id]) contribMap[c.project_id] = [];
      contribMap[c.project_id].push(c.username);
    });

    for (const p of projects) {
      const dr = drMap[p.id];
      p.deleteRequest = dr || null;
      if (dr) {
        p.deleteRequest.approvers = JSON.parse(dr.approvers || '[]');
        p.deleteRequest.allContributors = contribMap[p.id] || [];
      }
    }
  }

  res.json({ projects });
});

// POST /api/projects - Create a new project
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

  const db = getDb();
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  const createdBy = req.user?.id || null;
  const username = req.user?.username || '匿名';

  db.prepare('INSERT INTO projects (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name.trim(), createdBy, now, now);

  recordHistory(id, createdBy, username, '创建', `创建项目 "${name.trim()}"`, 0);

  res.status(201).json({
    project: { id, name: name.trim(), created_by: createdBy, created_at: now, updated_at: now, file_count: 0 }
  });
});

// POST /api/projects/:id/delete-request — request deletion (needs all contributors to approve)
router.post('/:id/delete-request', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const username = req.user?.username || req.body?.username || '匿名';
  const userId = req.user?.id || null;

  // Get all contributors
  const contributors = db.prepare(
    'SELECT DISTINCT username FROM edit_history WHERE project_id = ?'
  ).all(req.params.id).map(r => r.username);
  if (contributors.length === 0) contributors.push(username);

  // Check existing pending request
  const existing = db.prepare(
    'SELECT * FROM delete_requests WHERE project_id = ? AND status = ?'
  ).get(req.params.id, 'pending');

  if (existing) {
    // Add this user as approver
    const approvers = JSON.parse(existing.approvers || '[]');
    if (!approvers.includes(username)) {
      approvers.push(username);
      db.prepare('UPDATE delete_requests SET approvers = ? WHERE id = ?')
        .run(JSON.stringify(approvers), existing.id);
    }
    // Check if all contributors approved
    const allApproved = contributors.every(c => approvers.includes(c));
    if (allApproved) {
      // Delete the project
      db.prepare('DELETE FROM delete_requests WHERE project_id = ? AND status = ?').run(req.params.id, 'pending');
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
      deleteProjectDir(req.params.id);
      recordHistory(req.params.id, userId, username, '删除', '全体同意，项目已删除', 0);
      return res.json({ deleted: true, message: '全体同意，项目已删除' });
    }
    return res.json({ waiting: true, approvers, contributors, message: `等待其他贡献者同意 (${approvers.length}/${contributors.length})` });
  }

  // New delete request
  const approvers = [username];
  const allApproved = contributors.length === 1; // Solo contributor = instant delete

  if (allApproved) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    deleteProjectDir(req.params.id);
    recordHistory(req.params.id, userId, username, '删除', '项目已删除', 0);
    return res.json({ deleted: true, message: '项目已删除' });
  }

  db.prepare(
    'INSERT INTO delete_requests (project_id, requester_id, approvers, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, userId, JSON.stringify(approvers), 'pending', Math.floor(Date.now() / 1000));

  res.json({ waiting: true, approvers, contributors, message: `等待其他贡献者同意 (${approvers.length}/${contributors.length})` });
});

// POST /api/projects/:id/delete-cancel — cancel a pending delete request
router.post('/:id/delete-cancel', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE delete_requests SET status = ? WHERE project_id = ? AND status = ?')
    .run('cancelled', req.params.id, 'pending');
  res.json({ cancelled: true });
});

// GET /api/projects/:id/lock - Check project lock status
router.get('/:id/lock', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(checkLock(req.params.id));
});

// GET /api/projects/:id/snapshot
router.get('/:id/snapshot', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const files = db.prepare(
    'SELECT file_path as path, file_hash as hash, file_size as size, mtime FROM file_snapshots WHERE project_id = ? ORDER BY file_path'
  ).all(req.params.id);

  res.json({ project, files, snapshotAt: Math.floor(Date.now() / 1000) });
});

// POST /api/projects/:id/rebuild
router.post('/:id/rebuild', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const files = rebuildSnapshot(req.params.id);
  res.json({ project, files });
});

module.exports = router;
