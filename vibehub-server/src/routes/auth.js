const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 30) return res.status(400).json({ error: '用户名 2-30 字符' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '用户名已被注册' });

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, hash);

  // Auto-make first user admin
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM server_admins').get();
  if (adminCount.c === 0) {
    db.prepare('INSERT INTO server_admins (user_id, username, added_by) VALUES (?, ?, ?)').run(id, username, 'system');
  }

  const token = generateToken({ id, username });
  res.status(201).json({ user: { id, username }, token });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken({ id: user.id, username: user.username });
  res.json({ user: { id: user.id, username: user.username }, token });
  } catch (err) { next(err); }
});

// GET /api/auth/me - verify token
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
