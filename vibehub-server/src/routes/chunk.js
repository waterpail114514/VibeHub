const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../db');
const { recordHistory } = require('./history');
const { acquireLock, releaseLock } = require('../middleware/lock');
const { requireAuth } = require('../middleware/auth');
const { canPush } = require('../middleware/permission');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Infinity } });

function projectDir(projectId) {
  return path.join(__dirname, '..', '..', 'data', 'projects', projectId);
}

// POST /api/projects/:id/sync/chunk
router.post('/:id/sync/chunk', requireAuth, upload.single('chunk'), (req, res) => {
  const projectId = req.params.id;
  const filePath = req.body.filePath;
  const chunkIndex = parseInt(req.body.chunkIndex, 10);
  const totalChunks = parseInt(req.body.totalChunks, 10);
  const uploadId = req.body.uploadId || 'default';

  if (isNaN(chunkIndex) || isNaN(totalChunks)) return res.status(400).json({ error: 'Invalid chunk params' });
  const chunkData = req.file?.buffer;
  if (!chunkData) return res.status(400).json({ error: 'No chunk data' });

  // Permission check on first chunk
  if (chunkIndex === 0) {
    const perm = canPush(req.user.id, projectId);
    if (!perm.ok) return res.status(403).json({ error: perm.reason });
    acquireLock(projectId, 'upload', req.user.username);
  }

  // Save chunk
  const base = projectDir(projectId);
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  const chunkDir = path.join(base, '.tmp-chunks', String(uploadId));
  if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
  fs.writeFileSync(path.join(chunkDir, 'chunk_' + chunkIndex), chunkData);

  // Check if all chunks arrived
  const received = fs.readdirSync(chunkDir).length;

  if (received >= totalChunks) {
    try {
      // Normalize file path: replace backslash with forward, remove leading slash, split
      const norm = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = norm.split('/').filter(p => p.length > 0);
      // Build target path: base / projectId / subdirs... / filename
      let targetPath = base;
      for (const p of parts) {
        targetPath = path.join(targetPath, p);
      }
      // Ensure parent directory exists — build path segment by segment
      let buildPath = base;
      for (const p of parts.slice(0, -1)) { // all except filename
        buildPath = path.join(buildPath, p);
        if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath);
      }

      // Read all chunks into memory, verify total size
      const chunkBufs = [];
      let expectedSize = 0;
      for (let i = 0; i < totalChunks; i++) {
        const cp = path.join(chunkDir, 'chunk_' + i);
        if (!fs.existsSync(cp)) throw new Error('Missing chunk ' + i);
        const buf = fs.readFileSync(cp);
        chunkBufs.push(buf);
        expectedSize += buf.length;
      }
      // Clean up chunks
      for (let i = 0; i < totalChunks; i++) {
        try { fs.unlinkSync(path.join(chunkDir, 'chunk_' + i)); } catch (e) { /* */ }
      }
      try { fs.rmdirSync(chunkDir); } catch (e) { /* */ }
      // Assemble and write atomically: write to temp file, rename, then update DB
      const combined = Buffer.concat(chunkBufs);
      if (combined.length !== expectedSize) throw new Error('Size mismatch: expected ' + expectedSize + ' got ' + combined.length);
      const tmpPath = targetPath + '.tmp-' + Date.now();
      fs.writeFileSync(tmpPath, combined);
      fs.renameSync(tmpPath, targetPath);
      console.log('Chunk assembly OK: ' + norm + ' (' + combined.length + ' bytes)');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      const now = Math.floor(Date.now() / 1000);
      const db = getDb();
      // Use a transaction so both DB writes succeed or fail together
      const t = db.transaction(() => {
        db.prepare('INSERT INTO file_snapshots (project_id, file_path, file_hash, file_size, mtime) VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, file_path) DO UPDATE SET file_hash = excluded.file_hash, file_size = excluded.file_size, mtime = excluded.mtime').run(projectId, norm, hash, combined.length, now);
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
      });
      t();

      recordHistory(projectId, req.user.id, req.user.username, '上传', norm, 1);
      releaseLock(projectId);

      res.json({ done: true, path: norm, size: combined.length, hash });
    } catch (e) {
      releaseLock(projectId);
      console.error('Reassembly error:', e.message);
      res.status(500).json({ error: 'Reassembly failed: ' + e.message });
    }
  } else {
    res.json({ chunk: chunkIndex, received: received, total: totalChunks });
  }
});

module.exports = router;
