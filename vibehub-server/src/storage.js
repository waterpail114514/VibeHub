const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./db');

const PROJECTS_ROOT = path.join(__dirname, '..', 'data', 'projects');

function getProjectDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ---- Normal (non-atomic) operations ----

function saveFile(projectId, relativePath, buffer) {
  const dir = path.join(PROJECTS_ROOT, projectId);
  ensureDir(dir);
  const fullPath = path.join(dir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const mtime = Math.floor(Date.now() / 1000);
  const db = getDb();
  db.prepare(
    'INSERT INTO file_snapshots (project_id, file_path, file_hash, file_size, mtime) VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, file_path) DO UPDATE SET file_hash = excluded.file_hash, file_size = excluded.file_size, mtime = excluded.mtime'
  ).run(projectId, relativePath, hash, buffer.length, mtime);
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(mtime, projectId);
  return { hash, size: buffer.length, mtime };
}

function deleteFile(projectId, relativePath) {
  const fullPath = path.join(PROJECTS_ROOT, projectId, relativePath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  const db = getDb();
  db.prepare('DELETE FROM file_snapshots WHERE project_id = ? AND file_path = ?').run(projectId, relativePath);
  // Clean empty dirs
  let dir = path.dirname(fullPath);
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  while (dir.startsWith(projectDir) && dir !== projectDir) {
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); else break; } catch { break; }
    dir = path.dirname(dir);
  }
}

function getFileBuffer(projectId, relativePath) {
  // Prevent path traversal
  if (relativePath.includes('..')) return null;
  const fullPath = path.join(PROJECTS_ROOT, projectId, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

function deleteProjectDir(projectId) {
  const dir = path.join(PROJECTS_ROOT, projectId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function scanProjectFiles(projectId) {
  const dir = path.join(PROJECTS_ROOT, projectId);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  function walk(d, base) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.tmp-')) continue;
      const fp = path.join(d, e.name);
      const rp = base ? path.posix.join(base, e.name) : e.name;
      if (e.isDirectory()) walk(fp, rp);
      else if (e.isFile()) {
        const buf = fs.readFileSync(fp);
        files.push({ path: rp.replace(/\\/g, '/'), hash: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length, mtime: Math.floor(fs.statSync(fp).mtimeMs / 1000) });
      }
    }
  }
  walk(dir, '');
  return files;
}

function rebuildSnapshot(projectId) {
  const files = scanProjectFiles(projectId);
  const db = getDb();
  const t = db.transaction(() => {
    db.prepare('DELETE FROM file_snapshots WHERE project_id = ?').run(projectId);
    const ins = db.prepare('INSERT INTO file_snapshots (project_id, file_path, file_hash, file_size, mtime) VALUES (?, ?, ?, ?, ?)');
    for (const f of files) ins.run(projectId, f.path, f.hash, f.size, f.mtime);
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), projectId);
  });
  t();
  return files;
}

// ---- Atomic upload ----

const TMP_DIR = '.tmp-upload';

function beginUpload(projectId) {
  const dir = path.join(PROJECTS_ROOT, projectId);
  ensureDir(dir);
  const tmpDir = path.join(dir, TMP_DIR);
  // Clean any leftover temp dir
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  ensureDir(tmpDir);
  return tmpDir;
}

function saveFileAtomic(projectId, relativePath, buffer) {
  const tmpDir = path.join(PROJECTS_ROOT, projectId, TMP_DIR);
  const fullPath = path.join(tmpDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);
}

function commitUpload(projectId, deletedFiles) {
  const projectDir = path.join(PROJECTS_ROOT, projectId);
  const tmpDir = path.join(projectDir, TMP_DIR);

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // 1. Delete files marked for deletion
  if (deletedFiles && deletedFiles.length > 0) {
    for (const fp of deletedFiles) {
      const target = path.join(projectDir, fp);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      db.prepare('DELETE FROM file_snapshots WHERE project_id = ? AND file_path = ?').run(projectId, fp);
      // Clean empty dirs
      let d = path.dirname(target);
      while (d.startsWith(projectDir) && d !== projectDir) {
        try { if (fs.readdirSync(d).length === 0) fs.rmdirSync(d); else break; } catch { break; }
        d = path.dirname(d);
      }
    }
  }

  // 2. Move new files from tmp to project dir
  if (fs.existsSync(tmpDir)) {
    const moveFiles = (srcDir, basePath) => {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const e of entries) {
        const src = path.join(srcDir, e.name);
        const rp = basePath ? path.posix.join(basePath, e.name) : e.name;
        if (e.isDirectory()) {
          moveFiles(src, rp);
        } else {
          const target = path.join(projectDir, rp);
          ensureDir(path.dirname(target));
          fs.renameSync(src, target);
          const buf = fs.readFileSync(target);
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          db.prepare(
            'INSERT INTO file_snapshots (project_id, file_path, file_hash, file_size, mtime) VALUES (?, ?, ?, ?, ?) ON CONFLICT (project_id, file_path) DO UPDATE SET file_hash = excluded.file_hash, file_size = excluded.file_size, mtime = excluded.mtime'
          ).run(projectId, rp, hash, buf.length, now);
        }
      }
    };
    moveFiles(tmpDir, '');
    // Remove tmp dir
    fs.rmSync(tmpDir, { recursive: true });
  }

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
}

function rollbackUpload(projectId) {
  const tmpDir = path.join(PROJECTS_ROOT, projectId, TMP_DIR);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
}

module.exports = {
  getFileBuffer, deleteProjectDir, rebuildSnapshot,
  beginUpload, saveFileAtomic, commitUpload, rollbackUpload,
  ensureDir, PROJECTS_ROOT,
};
