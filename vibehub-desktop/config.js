const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.vibehub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'desktop-config.json');

const DEFAULT_CONFIG = {
  servers: [{ id: 'default', name: '默认服务器', url: 'http://localhost:3456', token: null }],
  activeServer: 'default',
  syncRoot: path.join(os.homedir(), 'Documents', 'VibeHubProjects'),
  alwaysOnTop: false,
  windowX: undefined,
  windowY: undefined,
  projects: {}
};

let config = null;

function normalizeUrl(u) {
  if (!u) return u;
  u = u.trim();
  // If it's just an IP or domain with no protocol
  if (!/^https?:\/\//i.test(u)) {
    u = 'http://' + u;
  }
  // If no port specified, add default
  if (!/:\d+$/.test(u.replace(/\/+$/, ''))) {
    u = u.replace(/\/+$/, '') + ':3456';
  }
  return u;
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  if (!config) config = {};
  config = { ...DEFAULT_CONFIG, ...config };
  config.serverUrl = normalizeUrl(config.serverUrl || DEFAULT_CONFIG.serverUrl);
  try {
    if (!fs.existsSync(config.syncRoot)) {
      fs.mkdirSync(config.syncRoot, { recursive: true });
    }
  } catch { /* ignore */ }
  return config;
}

function saveConfig(partial) {
  if (partial) {
    if (partial.serverUrl) partial.serverUrl = normalizeUrl(partial.serverUrl);
    Object.assign(config, partial);
  }
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfig() {
  if (!config) loadConfig();
  return config;
}

module.exports = { loadConfig, saveConfig, getConfig };
