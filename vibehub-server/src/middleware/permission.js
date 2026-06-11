const { getDb } = require('../db');
const { isAdmin } = require('../routes/admin');

function canPush(userId, projectId) {
  if (!userId) return { ok: false, reason: '请更新到 VibeHub v1.3 并登录' };
  if (isAdmin(userId)) return { ok: true };
  const db = getDb();
  const approved = db.prepare('SELECT id FROM push_requests WHERE project_id = ? AND user_id = ? AND status = ?').get(projectId, userId, 'approved');
  if (approved) {
    db.prepare('DELETE FROM push_requests WHERE id = ?').run(approved.id);
    return { ok: true };
  }
  return { ok: false, reason: '需要管理员审批' };
}

module.exports = { canPush };
