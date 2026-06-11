const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vibehub-secret-change-me';

// Generate token
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

// Verify token middleware (optional - attaches user if token present)
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch { /* token invalid, proceed without user */ }
  }
  next();
}

// Require token
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

module.exports = { generateToken, optionalAuth, requireAuth, JWT_SECRET };
