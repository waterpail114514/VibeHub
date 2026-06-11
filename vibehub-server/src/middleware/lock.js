const { getDb } = require('../db');

// Lock timeout: auto-release after 10 minutes (upload should finish within this)
const LOCK_TIMEOUT = 600;

// Acquire a lock for a project. Returns { ok: true } or { ok: false, holder, operation, remaining }
function acquireLock(projectId, operation, username) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // First, clean up expired locks
  db.prepare('DELETE FROM project_locks WHERE expires_at < ?').run(now);

  // Try atomic insert — project_id has a UNIQUE constraint, so this fails if a lock exists
  try {
    db.prepare(
      'INSERT INTO project_locks (project_id, operation, locked_by, locked_at, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(projectId, operation, username || '未知', now, now + LOCK_TIMEOUT);
    return { ok: true };
  } catch (e) {
    // INSERT failed because a lock already exists — read who holds it
    if (e.message && e.message.includes('UNIQUE constraint')) {
      const existing = db.prepare('SELECT * FROM project_locks WHERE project_id = ?').get(projectId);
      if (existing) {
        const remaining = existing.expires_at - now;
        return {
          ok: false,
          locked: true,
          holder: existing.locked_by,
          operation: existing.operation,
          remaining: Math.max(0, remaining)
        };
      }
    }
    throw e;
  }
}

// Release a lock
function releaseLock(projectId) {
  const db = getDb();
  db.prepare('DELETE FROM project_locks WHERE project_id = ?').run(projectId);
}

// Keep lock alive (extend timeout) — call during long operations
function keepAlive(projectId) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE project_locks SET expires_at = ? WHERE project_id = ?')
    .run(now + LOCK_TIMEOUT, projectId);
}

// Check if project is locked (for pull/sync operations)
function checkLock(projectId) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM project_locks WHERE expires_at < ?').run(now);
  const lock = db.prepare('SELECT * FROM project_locks WHERE project_id = ?').get(projectId);
  if (!lock) return { locked: false };
  return {
    locked: true,
    holder: lock.locked_by,
    operation: lock.operation,
    remaining: Math.max(0, lock.expires_at - now)
  };
}

module.exports = { acquireLock, releaseLock, keepAlive, checkLock };
