const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { getDb } = require('../db');
const { beginUpload, saveFileAtomic, commitUpload, rollbackUpload } = require('../storage');
const { recordHistory } = require('./history');
const { acquireLock, releaseLock, checkLock } = require('../middleware/lock');
const { canPush } = require('../middleware/permission');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity } });

// POST /api/projects/:id/sync/upload - Atomic upload with lock
router.post('/:id/sync/upload', upload.any(), (req, res) => {
  const projectId = req.params.id;
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const username = req.user?.username || req.body?.username || '匿名';
  const userId = req.user?.id || null;

  // Check push permission
  const perm = canPush(userId, projectId);
  if (!perm.ok) return res.status(403).json({ error: perm.reason, needApproval: true });

  // Acquire lock
  const lockResult = acquireLock(projectId, 'upload', username);
  if (!lockResult.ok) {
    return res.status(423).json({
      error: '项目正在被编辑中',
      locked: true,
      holder: lockResult.holder,
      operation: lockResult.operation,
      message: `${lockResult.holder} 正在${lockResult.operation}，请等待 ${lockResult.remaining} 秒后重试`
    });
  }

  // Parse file lists
  const filePaths = [], deletedFiles = [];
  try {
    if (req.body.filePaths) {
      const parsed = JSON.parse(req.body.filePaths);
      if (Array.isArray(parsed)) filePaths.push(...parsed);
      else filePaths.push(req.body.filePaths);
    }
    if (req.body.deletedFiles) {
      const parsed = JSON.parse(req.body.deletedFiles);
      if (Array.isArray(parsed)) deletedFiles.push(...parsed);
      else deletedFiles.push(req.body.deletedFiles);
    }
  } catch {
    if (req.body.filePaths && typeof req.body.filePaths === 'string') filePaths.push(req.body.filePaths);
    if (req.body.deletedFiles && typeof req.body.deletedFiles === 'string') deletedFiles.push(req.body.deletedFiles);
  }

  // Normalize
  const norm = (p) => p.replace(/\\/g, '/').replace(/^\/+/, '');

  try {
    // Begin atomic upload
    beginUpload(projectId);

    // Save uploaded files to temp
    const uploaded = [];
    const uploadedFiles = req.files || [];
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const relativePath = filePaths[i] ? norm(filePaths[i]) : norm(file.originalname || `file-${i}`);
      if (!relativePath) continue;
      try {
        saveFileAtomic(projectId, relativePath, file.buffer);
        const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        uploaded.push({ path: relativePath, hash, size: file.buffer.length });
      } catch (e) {
        // Rollback on any error
        rollbackUpload(projectId);
        releaseLock(projectId);
        return res.status(500).json({ error: `保存文件 ${relativePath} 失败: ${e.message}` });
      }
    }

    // Commit (atomic: move temp → real, apply deletions)
    commitUpload(projectId, deletedFiles.map(norm));

    // Record history
    const totalChanges = uploaded.length + deletedFiles.length;
    if (totalChanges > 0) {
      const files = [...uploaded.map(f => f.path), ...deletedFiles.map(norm)];
      const summary = files.slice(0, 10).join(', ') + (files.length > 10 ? ` 等${files.length}个文件` : '');
      const action = uploaded.length > 0 && deletedFiles.length > 0 ? '更新'
        : uploaded.length > 0 ? '上传' : '删除';
      recordHistory(projectId, userId, username, action, summary, totalChanges);
    }

    // Return snapshot
    const newSnapshot = db.prepare(
      'SELECT file_path as path, file_hash as hash, file_size as size, mtime FROM file_snapshots WHERE project_id = ? ORDER BY file_path'
    ).all(projectId);

    releaseLock(projectId);

    res.json({
      results: { uploaded, deleted: deletedFiles.map(norm), errors: [] },
      snapshot: newSnapshot,
      syncedAt: Math.floor(Date.now() / 1000)
    });
  } catch (err) {
    rollbackUpload(projectId);
    releaseLock(projectId);
    console.error('Upload failed:', err);
    res.status(500).json({ error: '上传失败: ' + err.message });
  }
});

// POST /api/projects/:id/sync/pull - Compute diff for pull
router.post('/:id/sync/pull', express.json(), (req, res) => {
  const projectId = req.params.id;
  const { localManifest } = req.body;

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Check if project is locked by an upload
  const lock = checkLock(projectId);

  const serverFiles = db.prepare(
    'SELECT file_path as path, file_hash as hash, file_size as size, mtime FROM file_snapshots WHERE project_id = ?'
  ).all(projectId);

  const serverManifest = {};
  for (const f of serverFiles) serverManifest[f.path] = f.hash;
  const localMap = localManifest || {};

  const toDownload = [], toDeleteLocally = [], unchanged = [];
  for (const [srvPath, srvHash] of Object.entries(serverManifest)) {
    if (!(srvPath in localMap)) toDownload.push(srvPath);
    else if (localMap[srvPath] !== srvHash) toDownload.push(srvPath);
    else unchanged.push(srvPath);
  }
  for (const [localPath] of Object.entries(localMap)) {
    if (!(localPath in serverManifest)) toDeleteLocally.push(localPath);
  }

  res.json({
    toDownload, toDeleteLocally, unchanged,
    serverFileCount: Object.keys(serverManifest).length,
    localFileCount: Object.keys(localMap).length,
    lock: lock.locked ? lock : null,
    summary: { download: toDownload.length, deleteLocal: toDeleteLocally.length, unchanged: unchanged.length }
  });
});

// POST /api/projects/:id/sync/push-diff - Compute diff for push
router.post('/:id/sync/push-diff', express.json(), (req, res) => {
  const projectId = req.params.id;
  const { localManifest } = req.body;

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const serverFiles = db.prepare(
    'SELECT file_path as path, file_hash as hash FROM file_snapshots WHERE project_id = ?'
  ).all(projectId);

  const serverManifest = {};
  for (const f of serverFiles) serverManifest[f.path] = f.hash;
  const localMap = localManifest || {};

  const toUpload = [], toDeleteOnServer = [];
  for (const [lp, info] of Object.entries(localMap)) {
    const lh = typeof info === 'string' ? info : info.hash;
    if (!(lp in serverManifest)) toUpload.push(lp);
    else if (serverManifest[lp] !== lh) toUpload.push(lp);
  }
  for (const [sp] of Object.entries(serverManifest)) {
    if (!(sp in localMap)) toDeleteOnServer.push(sp);
  }

  res.json({
    toUpload, toDeleteOnServer, conflicts: [],
    summary: { upload: toUpload.length, deleteOnServer: toDeleteOnServer.length, conflicts: 0 }
  });
});

module.exports = router;
