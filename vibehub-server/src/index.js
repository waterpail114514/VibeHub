const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const projectsRouter = require('./routes/projects');
const syncRouter = require('./routes/sync');
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');
const changelogRouter = require('./routes/changelog');
const chunkRouter = require('./routes/chunk');
const { router: adminRouter } = require('./routes/admin');
const { router: historyRouter } = require('./routes/history');
const { optionalAuth } = require('./middleware/auth');
const { closeDb, getDb } = require('./db');
const { getFileBuffer } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3456;

// CORS - allow desktop client connections
app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : '(direct)';
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// File download endpoint - middleware that manually parses the URL
// This bypasses Express 5 wildcard issues by using regex on the raw URL
app.use((req, res, next) => {
  // Only handle GET requests matching /api/projects/:id/files/:filePath
  if (req.method !== 'GET') return next();

  const url = req.originalUrl.split('?')[0]; // strip query string
  const match = url.match(/^\/api\/projects\/([^/]+)\/files(\/.+)$/);
  if (!match) return next();

  const projectId = match[1];
  const filePath = decodeURIComponent(match[2].replace(/^\//, ''));

  if (!filePath) return next();

  // Prevent path traversal
  if (filePath.includes('..')) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Verify project exists
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const buffer = getFileBuffer(projectId, filePath);
  if (buffer === null) {
    return res.status(404).json({ error: 'File not found', path: filePath });
  }

  // Content type
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeTypes = {
    'js': 'application/javascript', 'ts': 'application/typescript',
    'jsx': 'application/javascript', 'tsx': 'application/typescript',
    'json': 'application/json', 'html': 'text/html', 'css': 'text/css',
    'md': 'text/markdown', 'txt': 'text/plain', 'svg': 'image/svg+xml',
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif', 'ico': 'image/x-icon', 'wasm': 'application/wasm',
    'woff2': 'font/woff2', 'ttf': 'font/ttf', 'yaml': 'text/yaml',
    'yml': 'text/yaml', 'xml': 'application/xml', 'toml': 'text/plain',
    'lock': 'text/plain', 'gitignore': 'text/plain', 'env': 'text/plain',
  };
  res.set('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.set('Content-Length', buffer.length);
  res.send(buffer);
});

// Auth (global)
app.use('/api/auth', optionalAuth);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', optionalAuth);
app.use('/api/projects', projectsRouter);
app.use('/api/projects', syncRouter);
app.use('/api/projects', historyRouter);
app.use('/api/projects', chatRouter);
app.use('/api/projects', changelogRouter);
app.use('/api/projects', chunkRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: '1.5.0',
    timestamp: Math.floor(Date.now() / 1000)
  });
});

// Error log
const ERR_LOG = path.join(__dirname, '..', 'data', 'error.log');
function logError(err) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(ERR_LOG, `[${ts}] ${err.message}\n${err.stack || ''}\n\n`);
  } catch { /* */ }
}

// Error handler
app.use((err, req, res, next) => {
  logError(err);
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

const server = app.listen(PORT, () => {
  // Long timeout for large uploads
  server.timeout = 600000; // 10 minutes
  server.keepAliveTimeout = 610000;
  console.log(`
╔══════════════════════════════════════════╗
║         🔮 VibeHub Server Ready          ║
║                                          ║
║   Address:  http://localhost:${PORT}        ║
║   Health:   http://localhost:${PORT}/api/health ║
║                                          ║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  closeDb();
  server.close(() => process.exit(0));
});
