const { app, ipcMain, BrowserWindow, shell, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execSync, exec } = require('child_process');
const { getConfig, saveConfig } = require('./config');
const os = require('os');

let authToken = null;
let currentUser = null;

const ERR_LOG = path.join(os.homedir(), '.vibehub', 'error.log');
function logError(source, err) {
  try {
    const dir = path.dirname(ERR_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    const msg = '[' + ts + '] ' + source + ': ' + (err.message || err) + '\n' + (err.stack || '') + '\n';
    fs.appendFileSync(ERR_LOG, msg);
  } catch (e) { /* ignore */ }
}

function getServerUrl() {
  const cfg = getConfig();
  const activeId = cfg.activeServer || 'default';
  const server = (cfg.servers || []).find(function(s) { return s.id === activeId; });
  return server ? server.url : (cfg.serverUrl || 'http://localhost:3456');
}

function apiRequest(method, urlPath, body, isFormData) {
  return new Promise(function(resolve, reject) {
    const cfg = getConfig();
    const url = new URL(urlPath, getServerUrl());
    const client = url.protocol === 'https:' ? https : http;
    const options = { method: method, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, headers: {}, timeout: isFormData ? 0 : 30000 };
    if (authToken) options.headers['Authorization'] = 'Bearer ' + authToken;
    if (isFormData && body) { options.headers = Object.assign({}, options.headers, body.headers); }
    else if (body && typeof body === 'object') { options.headers['Content-Type'] = 'application/json'; }
    const req = client.request(options, function(res) {
      const chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', function(err) {
      if (err.code === 'EPROTO' || (err.message && err.message.indexOf('SSL') !== -1) || (err.message && err.message.indexOf('WRONG_VERSION') !== -1)) {
        reject(new Error('SSL连接失败，请把地址改成 http:// 开头'));
      } else { reject(err); }
    });
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
    if (body) { if (isFormData) req.write(body.buffer); else req.write(JSON.stringify(body)); }
    req.end();
  });
}

function downloadFile(projectId, filePath, onProgress) {
  return new Promise(function(resolve, reject) {
    const cfg = getConfig();
    const srvUrl = cfg.servers ? (cfg.servers.find(function(s) { return s.id === (cfg.activeServer || 'default'); }) || {}).url : cfg.serverUrl;
    const base = srvUrl || cfg.serverUrl || 'http://localhost:3456';
    const url = new URL('/api/projects/' + projectId + '/files/' + encodeURI(filePath), base);
    url.pathname = url.pathname.replace(/\\/g, '/');
    const client = url.protocol === 'https:' ? https : http;
    let headers = {};
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    client.get(url.toString(), { headers: headers }, function(res) {
      if (res.statusCode !== 200) { let e = ''; res.on('data', function(c) { e += c.toString(); }); res.on('end', function() { reject(new Error(e)); }); return; }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const chunks = [];
      let received = 0;
      let lastUpdate = 0;
      res.on('data', function(c) {
        chunks.push(c);
        received += c.length;
        if (onProgress && received - lastUpdate > 65536) {
          onProgress(received, total);
          lastUpdate = received;
        }
      });
      res.on('end', function() { if (onProgress) onProgress(received, total); resolve(Buffer.concat(chunks)); });
    }).on('error', reject).setTimeout(0, function() { /* no timeout on downloads */ });
  });
}

function loadIgnorePatterns(projectPath) {
  const patterns = ['node_modules', '.git', '.next', 'dist', 'build', '.vibehub'];
  const ignoreFile = path.join(projectPath, '.vibeignore');
  if (fs.existsSync(ignoreFile)) {
    const lines = fs.readFileSync(ignoreFile, 'utf-8').split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('#'); });
    lines.forEach(function(l) { patterns.push(l); });
  }
  return patterns;
}

function isIgnored(filePath, patterns) {
  return patterns.some(function(p) {
    if (p.endsWith('/')) return filePath.startsWith(p) || filePath.indexOf('/' + p) !== -1;
    return filePath === p || filePath.startsWith(p + '/') || filePath.endsWith('/' + p) || filePath.indexOf('/' + p + '/') !== -1;
  });
}

function scanDirectory(dirPath, ignorePatterns) {
  if (!fs.existsSync(dirPath)) return {};
  const manifest = {};
  function walk(d, base) {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < entries.length; i++) {
      let e = entries[i];
      let fp = path.join(d, e.name);
      let rp = base ? path.posix.join(base, e.name) : e.name;
      if (isIgnored(rp, ignorePatterns || [])) continue;
      if (e.isDirectory()) { walk(fp, rp); }
      else if (e.isFile()) {
        try { let c = fs.readFileSync(fp); manifest[rp] = { hash: crypto.createHash('sha256').update(c).digest('hex'), size: c.length }; }
        catch (e) { /* skip */ }
      }
    }
  }
  walk(dirPath, '');
  return manifest;
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function removeZoneId(filePath) {
  try { fs.unlinkSync(filePath + ':Zone.Identifier'); } catch (e) { /* not present */ }
}
function sanitize(name) { return name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').substring(0, 100); }

function cleanupEmptyDirs(dirPath, rootPath) {
  if (!fs.existsSync(dirPath)) return;
  let entries; try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch (e) { return; }
  for (let i = 0; i < entries.length; i++) { if (entries[i].isDirectory()) cleanupEmptyDirs(path.join(dirPath, entries[i].name), rootPath); }
  try { if (fs.readdirSync(dirPath).length === 0 && dirPath !== rootPath) fs.rmdirSync(dirPath); } catch (e) { /* */ }
}

function getFileDiff(projectId) {
  const cfg = getConfig();
  const pc = cfg.projects[projectId];
  if (!pc || !pc.localPath) return { added: [], changed: [], deleted: [], diffs: {} };
  const patterns = loadIgnorePatterns(pc.localPath);
  const local = scanDirectory(pc.localPath, patterns);
  const last = pc.lastSyncSnapshot || {};
  const added = [], changed = [], deleted = [], diffs = {};
  Object.entries(local).forEach(function(entry) {
    let fp = entry[0], info = entry[1];
    if (!(fp in last)) { added.push(fp); }
    else if (last[fp].hash !== info.hash) { changed.push(fp); diffs[fp] = getTextDiff(fp, pc.localPath, last[fp]); }
  });
  Object.keys(last).forEach(function(fp) { if (!(fp in local)) deleted.push(fp); });
  return { added: added, changed: changed, deleted: deleted, diffs: diffs, totalSize: Object.values(local).reduce(function(s, i) { return s + i.size; }, 0) };
}

function getTextDiff(fp, localPath, lastInfo) {
  try {
    const fullPath = path.join(localPath, fp);
    if (!fs.existsSync(fullPath)) return '+new file';
    const ext = path.extname(fp).toLowerCase();
    if (['.png','.jpg','.jpeg','.gif','.ico','.wasm','.woff2','.ttf','.mp3','.mp4','.exe','.dll','.bin','.zip','.gz'].indexOf(ext) !== -1) return '+binary file';
    let content = fs.readFileSync(fullPath, 'utf-8');
    let lines = content.split('\n');
    if (lines.length <= 20) return content;
    return lines.slice(0, 20).join('\n') + '\n... (truncated)';
  } catch (e) { return '+cannot read'; }
}

async function pullProject(projectId) {
  const cfg = getConfig();
  const pc = cfg.projects[projectId];
  if (!pc) throw new Error('Project not configured');
  const localPath = pc.localPath;
  ensureDir(localPath);
  const patterns = loadIgnorePatterns(localPath);
  const local = scanDirectory(localPath, patterns);
  let localHashes = {};
  Object.entries(local).forEach(function(e) { localHashes[e[0]] = e[1].hash; });
  const diffResult = await apiRequest('POST', '/api/projects/' + projectId + '/sync/pull', { localManifest: localHashes });
  if (diffResult.status !== 200) throw new Error(diffResult.data?.error || 'Pull failed');
  const toDownload = diffResult.data.toDownload || [];
  const toDeleteLocally = diffResult.data.toDeleteLocally || [];
  toDeleteLocally.forEach(function(fp) { try { if (fs.existsSync(path.join(localPath, fp))) fs.unlinkSync(path.join(localPath, fp)); } catch (e) { } });

  const snapRes = await apiRequest('GET', '/api/projects/' + projectId + '/snapshot');
  let serverFiles = snapRes.data?.files || [];
  let sizeMap = {};
  let hashMap = {};
  serverFiles.forEach(function(f) { sizeMap[f.path] = f.size; hashMap[f.path] = f.hash; });
  let totalBytes = toDownload.reduce(function(s, f) { return s + (sizeMap[f] || 0); }, 0) + toDeleteLocally.length * 1024;
  const downloaded = [], errors = [];
  let dlBytes = 0;
  function sendPullProgress() {
    let win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('pull-progress', { projectId: projectId, done: dlBytes, total: totalBytes });
  }
  sendPullProgress();
  for (let i = 0; i < toDownload.length; i++) {
    let fp = toDownload[i];
    if (isIgnored(fp, patterns)) continue;
    try {
      let buf = await downloadFile(projectId, fp, function(received, total) { let w = BrowserWindow.getAllWindows()[0]; if (w) w.webContents.send('pull-progress', { projectId: projectId, done: dlBytes + received, total: totalBytes }); });
      // Verify downloaded file hash matches server snapshot
      let dlHash = crypto.createHash('sha256').update(buf).digest('hex');
      let expectedHash = hashMap[fp];
      if (expectedHash && dlHash !== expectedHash) {
        errors.push({ path: fp, error: 'Hash mismatch: expected ' + expectedHash.slice(0,8) + ' got ' + dlHash.slice(0,8) });
        dlBytes += sizeMap[fp] || 0;
        sendPullProgress();
        continue;
      }
      let full = path.join(localPath, fp); ensureDir(path.dirname(full)); fs.writeFileSync(full, buf); removeZoneId(full); downloaded.push(fp); dlBytes += buf.length;
    }
    catch (e) { errors.push({ path: fp, error: e.message }); dlBytes += sizeMap[fp] || 0; }
    sendPullProgress();
  }
  cleanupEmptyDirs(localPath, localPath);
  cfg.projects[projectId].lastSyncSnapshot = scanDirectory(localPath, patterns);
  cfg.projects[projectId].lastSyncAt = Math.floor(Date.now() / 1000);
  saveConfig();
  return { downloaded: downloaded, deleted: toDeleteLocally, errors: errors, fileCount: Object.keys(cfg.projects[projectId].lastSyncSnapshot).length };
}

const CHUNK_SIZE = 50 * 1024 * 1024;

async function pushProject(projectId, selectedFiles) {
  const cfg = getConfig();
  const pc = cfg.projects[projectId];
  if (!pc) throw new Error('Project not configured');
  const localPath = pc.localPath;
  const patterns = loadIgnorePatterns(localPath);
  const local = scanDirectory(localPath, patterns);
  const last = pc.lastSyncSnapshot || {};
  let toUpload = [], toDelete = [];
  Object.entries(local).forEach(function(e) {
    if (!(e[0] in last)) toUpload.push(e[0]);
    else if (last[e[0]].hash !== e[1].hash) toUpload.push(e[0]);
  });
  Object.keys(last).forEach(function(fp) { if (!(fp in local)) toDelete.push(fp); });
  if (selectedFiles && selectedFiles.length > 0) {
    let sf = new Set(selectedFiles);
    toUpload = toUpload.filter(function(f) { return sf.has(f); });
    toDelete = toDelete.filter(function(f) { return sf.has(f); });
  }
  if (toUpload.length === 0 && toDelete.length === 0) return { uploaded: [], deleted: [], errors: [], message: 'No changes' };

  // Upload first, then delete — so a failed upload doesn't leave deleted files gone
  const uploaded = [], errors = [];

  for (let fi = 0; fi < toUpload.length; fi++) {
    let fp = toUpload[fi];
    let fullPath = path.join(localPath, fp);
    let totalSize = fs.statSync(fullPath).size;
    let uploadId = 'up_' + Date.now() + '_' + fi;

    if (totalSize <= CHUNK_SIZE) {
      let smallData = fs.readFileSync(fullPath);
      await uploadChunk(projectId, fp, uploadId, 0, 1, smallData, totalSize, fi, toUpload.length);
      uploaded.push({ path: fp, size: totalSize });
    } else {
      let totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
      let fd = fs.openSync(fullPath, 'r');
      try {
        for (let ci = 0; ci < totalChunks; ci++) {
          let chunkSize = Math.min(CHUNK_SIZE, totalSize - ci * CHUNK_SIZE);
          let buf = Buffer.alloc(chunkSize);
          fs.readSync(fd, buf, 0, chunkSize, ci * CHUNK_SIZE);
          await uploadChunk(projectId, fp, uploadId, ci, totalChunks, buf, totalSize, fi, toUpload.length);
        }
        uploaded.push({ path: fp, size: totalSize });
      } finally { fs.closeSync(fd); }
    }
  }

  // Verify uploaded file hashes against server snapshot (catches binary corruption)
  if (uploaded.length > 0) {
    try {
      const snapCheck = await apiRequest('GET', '/api/projects/' + projectId + '/snapshot');
      const serverHashMap = {};
      (snapCheck.data?.files || []).forEach(function(f) { serverHashMap[f.path] = f.hash; });
      for (const uf of uploaded) {
        const localHash = local[uf.path]?.hash;
        const serverHash = serverHashMap[uf.path];
        if (localHash && serverHash && localHash !== serverHash) {
          errors.push({ path: uf.path, error: 'Hash mismatch after upload (local=' + localHash.slice(0,8) + ' server=' + serverHash.slice(0,8) + ')' });
        }
      }
    } catch (e) { /* best-effort verification, don't fail the whole push */ }
  }

  // Handle deletes after uploads succeed
  if (toDelete.length > 0) {
    let delBoundary = '----VibeHubDel' + Date.now();
    let delParts = [];
    delParts.push('\r\n--' + delBoundary + '\r\nContent-Disposition: form-data; name="filePaths"\r\n\r\n[]');
    delParts.push('\r\n--' + delBoundary + '\r\nContent-Disposition: form-data; name="deletedFiles"\r\n\r\n' + JSON.stringify(toDelete.map(function(p) { return p.replace(/\\/g, '/'); })));
    if (currentUser) delParts.push('\r\n--' + delBoundary + '\r\nContent-Disposition: form-data; name="username"\r\n\r\n' + currentUser.username);
    delParts.push('\r\n--' + delBoundary + '--\r\n');
    let delBody = Buffer.concat(delParts.map(function(p) { return typeof p === 'string' ? Buffer.from(p, 'utf-8') : p; }));
    await apiRequest('POST', '/api/projects/' + projectId + '/sync/upload', { buffer: delBody, headers: { 'Content-Type': 'multipart/form-data; boundary=' + delBoundary, 'Content-Length': String(delBody.length) } }, true);
  }

  cfg.projects[projectId].lastSyncSnapshot = scanDirectory(localPath, patterns);
  cfg.projects[projectId].lastSyncAt = Math.floor(Date.now() / 1000);
  saveConfig();
  return { uploaded: uploaded, deleted: toDelete.map(function(p) { return p.replace(/\\/g, '/'); }), errors: errors };
}

async function uploadChunk(projectId, filePath, uploadId, chunkIndex, totalChunks, data, totalSize, fileIndex, totalFiles) {
  let normPath = filePath.replace(/\\/g, '/');
  let boundary = '----VibeHubChunk' + Date.now();
  let parts = [];
  parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="chunk"; filename="chunk_' + chunkIndex + '"\r\nContent-Type: application/octet-stream\r\n\r\n');
  parts.push(data);
  parts.push('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="filePath"\r\n\r\n' + normPath);
  parts.push('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="chunkIndex"\r\n\r\n' + chunkIndex);
  parts.push('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="totalChunks"\r\n\r\n' + totalChunks);
  parts.push('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="uploadId"\r\n\r\n' + uploadId);
  parts.push('\r\n--' + boundary + '--\r\n');
  let body = Buffer.concat(parts.map(function(p) { return typeof p === 'string' ? Buffer.from(p, 'utf-8') : Buffer.isBuffer(p) ? p : Buffer.from(p); }));

  let cfg = getConfig();
  let url = new URL('/api/projects/' + projectId + '/sync/chunk', getServerUrl());
  let client = url.protocol === 'https:' ? https : http;
  let headers = { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': String(body.length) };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

  // 2-minute timeout per chunk (50MB chunks can be slow on bad networks)
  const CHUNK_TIMEOUT = 120000;

  let res = await new Promise(function(resolve, reject) {
    let done = false;
    let timeout = setTimeout(function() {
      if (!done) { done = true; req.destroy(); reject(new Error('Chunk upload timeout after 2min')); }
    }, CHUNK_TIMEOUT);

    let req = client.request({ method: 'POST', hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, headers: headers, timeout: 0 }, function(res) {
      let chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        if (!done) { done = true; clearTimeout(timeout); }
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (e) { resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString() }); }
      });
    });
    req.on('error', function(err) {
      if (!done) { done = true; clearTimeout(timeout); reject(err); }
    });
    // Send in 256KB sub-chunks for intra-chunk progress
    const SUB = 262144;
    let offset = 0;
    function writeSub() {
      if (done) return;
      if (offset >= body.length) { req.end(); return; }
      let end = Math.min(offset + SUB, body.length);
      let can = req.write(body.slice(offset, end));
      offset = end;
      // Progress: base offset for previous chunks + current intra-chunk offset
      let totalSent = chunkIndex * CHUNK_SIZE + offset;
      let w = BrowserWindow.getAllWindows()[0];
      if (w) w.webContents.send('upload-progress', { projectId: projectId, sent: Math.min(totalSent, totalSize), total: totalSize, file: fileIndex + 1, totalFiles: totalFiles, chunk: chunkIndex + 1, totalChunks: totalChunks });
      if (can) setImmediate(writeSub);
      else req.once('drain', writeSub);
    }
    writeSub();
  });

  if (res.status === 403) throw new Error(res.data?.error || '没有上传权限');
  if (!res.data || res.status !== 200) throw new Error(res.data?.error || 'Chunk ' + (chunkIndex+1) + '/' + totalChunks + ' failed');

  // Verify server-computed hash for single-chunk (complete file) uploads
  if (res.data.done && res.data.hash && totalChunks === 1) {
    let localHash = crypto.createHash('sha256').update(data).digest('hex');
    if (localHash !== res.data.hash) {
      throw new Error('上传校验失败: ' + filePath + ' (本地 ' + localHash.slice(0,8) + ' 服务端 ' + res.data.hash.slice(0,8) + ')');
    }
  }
}

function readFileContents(projectId, maxFiles, maxSize) {
  let cfg = getConfig();
  let pc = cfg.projects[projectId];
  if (!pc || !pc.localPath) return '';
  let patterns = loadIgnorePatterns(pc.localPath);
  let files = [];
  function walk(d, base) {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < entries.length; i++) {
      let e = entries[i];
      let rp = base ? path.posix.join(base, e.name) : e.name;
      if (isIgnored(rp, patterns)) continue;
      let fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp, rp);
      else if (e.isFile()) {
        let stat = fs.statSync(fp);
        let ext = path.extname(e.name).toLowerCase();
        let textExts = ['.js','.ts','.jsx','.tsx','.json','.html','.css','.md','.txt','.yml','.yaml','.xml','.py','.rs','.go','.java','.c','.cpp','.h','.rb','.php','.sh','.bat','.toml','.env','.gitignore','.vibeignore'];
        if (textExts.indexOf(ext) !== -1 && stat.size < 500 * 1024) files.push({ path: rp, size: stat.size });
      }
    }
  }
  walk(pc.localPath, '');
  files.sort(function(a, b) { return a.size - b.size; });
  let selected = files.slice(0, maxFiles || 20);
  let totalRead = 0;
  let contents = '';
  for (let i = 0; i < selected.length; i++) {
    if (totalRead > (maxSize || 80000)) break;
    try {
      let content = fs.readFileSync(path.join(pc.localPath, selected[i].path), 'utf-8');
      let truncated = content.length > 3000 ? content.slice(0, 3000) + '\n... (truncated)' : content;
      contents += '\n### ' + selected[i].path + '\n```\n' + truncated + '\n```\n';
      totalRead += truncated.length;
    } catch (e) { /* */ }
  }
  return contents;
}

async function aiExplain(projectId, mode) {
  let cfg = getConfig();
  if (!cfg.aiApiKey || !cfg.aiBaseUrl) throw new Error('请先配置 AI API Key');

  let results = await Promise.all([
    apiRequest('GET', '/api/projects/' + projectId + '/history'),
    apiRequest('GET', '/api/projects/' + projectId + '/snapshot'),
  ]);
  let history = results[0].data?.history || [];
  let files = results[1].data?.files || [];
  let project = results[1].data?.project || {};
  let fileContents = readFileContents(projectId, 15, 60000);

  let prompt;
  if (mode === 'changes') {
    let diff = getFileDiff(projectId);
    let sysPrompt = '用中文客观描述以下文件变更。只描述事实：哪些文件新增、修改、删除了，每个文件做了什么改动。不要评价改动好坏，不要提建议，不要猜测。';
    let userPrompt = '项目 "' + project.name + '" 的本地更改:\n\n新增: ' + (diff.added.join(', ') || '无') + '\n修改: ' + (diff.changed.join(', ') || '无') + '\n删除: ' + (diff.deleted.join(', ') || '无') + '\n\n文件内容:\n' + fileContents;
    prompt = { system: sysPrompt, user: userPrompt };
  } else if (mode === 'changelog') {
    let sysPrompt2 = '将编辑历史整理成更新日志。每条一行中文，格式：- 功能描述。只使用给定的编辑记录，不添加不存在的内容。';
    let userPrompt2 = '编辑历史:\n' + history.slice(0,10).map(function(h) { return '- ' + h.username + ': ' + h.action + ' ' + h.summary; }).join('\n');
    prompt = { system: sysPrompt2, user: userPrompt2 };
  } else {
    let fileList = files.map(function(f) { return f.path + ' (' + (f.size/1024).toFixed(1) + 'KB)'; }).slice(0,30).join('\n');
    let sysPrompt3 = '用中文说明项目的客观信息：1. 项目是什么（从文件名和代码推断，不确定就说"未知"）2. 用了哪些技术（列出已确认的框架和语言）3. 文件数量。只陈述事实，不说"可能是"、"应该是"等不确定用语。';
    let userPrompt3 = '项目 "' + project.name + '":\n\n文件:\n' + fileList + (files.length > 30 ? '\n...共 ' + files.length + ' 个文件' : '') + '\n\n代码:\n' + fileContents;
    prompt = { system: sysPrompt3, user: userPrompt3 };
  }

  let isAnthropic = cfg.aiBaseUrl.indexOf('anthropic.com') !== -1 || cfg.aiBaseUrl.indexOf('claude') !== -1;
  let res;
  try {
    let messages = isAnthropic ? [
      { role: 'user', content: prompt.system + '\n\n' + prompt.user }
    ] : [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ];
    res = await fetch(cfg.aiBaseUrl + '/v1/' + (isAnthropic ? 'messages' : 'chat/complet ions'), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, isAnthropic ? { 'x-api-key': cfg.aiApiKey, 'anthropic-version': '2023-06-01' } : { 'Authorization': 'Bearer ' + cfg.aiApiKey }),
      body: JSON.stringify(isAnthropic ? { model: cfg.aiModel || 'claude-sonnet-4-6', max_tokens: 1000, messages: messages } : { model: cfg.aiModel || 'gpt-4o-mini', max_tokens: 1000, messages: messages }),
    });
  } catch (e) {
    throw new Error('无法连接到 AI 服务: ' + e.message);
  }
  let text = await res.text();
  if (!res.ok) throw new Error('AI 服务返回错误 (' + res.status + '): ' + text.slice(0, 200));
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('AI 返回非 JSON: ' + text.slice(0, 200)); }
  return { explanation: isAnthropic ? (data.content?.[0]?.text || JSON.stringify(data)) : (data.choices?.[0]?.message?.content || JSON.stringify(data)) };
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title: title, body: body, icon: path.join(__dirname, 'src', 'assets', 'icon.png') }).show();
  }
}

function setupIPC() {
  ipcMain.on('window-minimize', function() { BrowserWindow.getFocusedWindow()?.minimize(); });
  ipcMain.on('window-maximize', function() { let w = BrowserWindow.getFocusedWindow(); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
  ipcMain.on('window-hide', function() { BrowserWindow.getFocusedWindow()?.hide(); });
  ipcMain.on('window-quit', function() { app.emit('before-quit'); app.quit(); });
  ipcMain.handle('window-toggle-pin', function() { let w = BrowserWindow.getFocusedWindow(); if (!w) return false; let c = w.isAlwaysOnTop(); w.setAlwaysOnTop(!c); saveConfig({ alwaysOnTop: !c }); return !c; });
  ipcMain.handle('window-get-state', function() { let w = BrowserWindow.getFocusedWindow(); return w ? { pinned: w.isAlwaysOnTop() } : { pinned: false }; });
  ipcMain.handle('browse-folder', async function() { let r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; });

  ipcMain.handle('get-config', function() { return getConfig(); });
  ipcMain.handle('save-config', function(e, cfg) { saveConfig(cfg); return getConfig(); });

  ipcMain.handle('auth-register', async function(e, u, p) { let r = await apiRequest('POST', '/api/auth/register', { username: u, password: p }); if (r.status !== 201) throw new Error(r.data?.error); authToken = r.data.token; currentUser = r.data.user; saveConfig({ authToken: authToken, currentUser: currentUser }); return currentUser; });
  ipcMain.handle('auth-login', async function(e, u, p) { let r = await apiRequest('POST', '/api/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error(r.data?.error); authToken = r.data.token; currentUser = r.data.user; saveConfig({ authToken: authToken, currentUser: currentUser }); return currentUser; });
  ipcMain.handle('auth-get-token', function() { let cfg = getConfig(); if (cfg.authToken) { authToken = cfg.authToken; currentUser = cfg.currentUser; } return currentUser; });
  ipcMain.handle('auth-logout', function() { authToken = null; currentUser = null; saveConfig({ authToken: null, currentUser: null }); });

  ipcMain.handle('check-server', async function() { try { return (await apiRequest('GET', '/api/health')).status === 200; } catch (e) { return false; } });
  ipcMain.handle('list-projects', async function() { let r = await apiRequest('GET', '/api/projects'); if (r.status !== 200) throw new Error('Failed'); return r.data.projects.map(function(p) { return Object.assign({}, p, { localInfo: getConfig().projects[p.id] || null }); }); });
  ipcMain.handle('create-project', async function(e, name) { let r = await apiRequest('POST', '/api/projects', { name: name }); if (r.status !== 201) throw new Error(r.data?.error); return r.data; });
  ipcMain.handle('request-delete', async function(e, pid) { let r = await apiRequest('POST', '/api/projects/' + pid + '/delete-request', { username: currentUser?.username || '匿名' }); return r.data; });
  ipcMain.handle('cancel-delete', async function(e, pid) { return (await apiRequest('POST', '/api/projects/' + pid + '/delete-cancel')).data; });
  ipcMain.handle('get-history', async function(e, pid) { let r = await apiRequest('GET', '/api/projects/' + pid + '/history'); if (r.status !== 200) throw new Error('Failed'); return r.data; });

  ipcMain.handle('check-lock', async function(e, pid) { let r = await apiRequest('GET', '/api/projects/' + pid + '/lock'); return r.status === 200 ? r.data : { locked: false }; });
  ipcMain.handle('get-diff', function(e, pid) { return getFileDiff(pid); });
  ipcMain.handle('get-pull-preview', async function(e, pid) {
    let cfg = getConfig();
    let pc = cfg.projects[pid];
    let localPath = pc?.localPath;
    let patterns = localPath ? loadIgnorePatterns(localPath) : [];
    let localManifest = localPath ? scanDirectory(localPath, patterns) : {};
    let localHashes = {};
    Object.entries(localManifest).forEach(function(e2) { localHashes[e2[0]] = e2[1].hash; });
    let diff = await apiRequest('POST', '/api/projects/' + pid + '/sync/pull', { localManifest: localHashes });
    return diff.status === 200 ? diff.data : { toDownload: [], toDeleteLocally: [] };
  });
  ipcMain.handle('pull-project', async function(e, pid) { try { return await pullProject(pid); } catch (err) { logError('pull-project', err); throw err; } });
  ipcMain.handle('push-project', async function(e, pid, files) { try { return await pushProject(pid, files); } catch (err) { logError('push-project', err); throw err; } });
  ipcMain.handle('ai-explain', async function(e, pid, mode) { try { return await aiExplain(pid, mode || 'overview'); } catch (err) { logError('ai-explain', err); throw err; } });

  ipcMain.handle('has-claude', function() { try { execSync('claude --version', { stdio: 'ignore' }); return true; } catch (e) { return false; } });
  ipcMain.handle('launch-claude', function(e, pid) {
    let pc = getConfig().projects[pid];
    if (!pc?.localPath) throw new Error('Project not synced');
    let cmd = process.platform === 'win32' ? 'start cmd /k "cd /d "' + pc.localPath + '" && claude"' : 'open -a Terminal "' + pc.localPath + '"';
    exec(cmd);
  });

  ipcMain.handle('get-messages', async function(e, pid) { let r = await apiRequest('GET', '/api/projects/' + pid + '/messages'); return r.data.messages || []; });
  ipcMain.handle('send-message', async function(e, pid, content) { let r = await apiRequest('POST', '/api/projects/' + pid + '/messages', { content: content }); if (r.status !== 201) throw new Error(r.data?.error); return r.data.message; });
  ipcMain.handle('get-changelogs', async function(e, pid) { let r = await apiRequest('GET', '/api/projects/' + pid + '/changelogs'); return r.data.changelogs || []; });
  ipcMain.handle('add-changelog', async function(e, pid, content, version, isAi) { let r = await apiRequest('POST', '/api/projects/' + pid + '/changelogs', { content: content, version: version, isAiGenerated: isAi }); if (r.status !== 201) throw new Error(r.data?.error); return r.data.changelog; });

  ipcMain.handle('notify', function(e, title, body) { showNotification(title, body); });

  ipcMain.handle('admin-status', async function() { let r = await apiRequest('GET', '/api/admin/status'); return r.data; });
  ipcMain.handle('admin-add', async function(e, username) { let r = await apiRequest('POST', '/api/admin/add', { username: username }); if (r.status !== 200) throw new Error(r.data?.error); return r.data; });
  ipcMain.handle('admin-remove', async function(e, userId) { let r = await apiRequest('POST', '/api/admin/remove', { userId: userId }); if (r.status !== 200) throw new Error(r.data?.error); return r.data; });
  ipcMain.handle('check-push-permission', async function(e, pid) { try { let r = await apiRequest('POST', '/api/admin/can-push', { projectId: pid }); if (r.status === 404) return { ok: true }; return r.data; } catch (e2) { return { ok: true }; } });
  ipcMain.handle('request-push', async function(e, pid, summary, fileCount) { let r = await apiRequest('POST', '/api/admin/request-push', { projectId: pid, summary: summary, fileCount: fileCount }); return r.data; });
  ipcMain.handle('get-push-requests', async function() { let r = await apiRequest('GET', '/api/admin/push-requests'); return r.data.requests || []; });
  ipcMain.handle('review-push', async function(e, requestId, approved) { let r = await apiRequest('POST', '/api/admin/review-push', { requestId: requestId, approved: approved }); return r.data; });

  ipcMain.handle('scan-local', function(e, pid) {
    let cfg = getConfig(); let pc = cfg.projects[pid];
    if (!pc || !pc.localPath) return { manifest: {}, hasChanges: false, fileCount: 0, added: [], changed: [], deleted: [] };
    let patterns = loadIgnorePatterns(pc.localPath);
    let manifest = scanDirectory(pc.localPath, patterns);
    let ls = pc.lastSyncSnapshot || {};
    let added = [], changed = [], deleted = [];
    Object.entries(manifest).forEach(function(e2) { if (!(e2[0] in ls)) added.push(e2[0]); else if (ls[e2[0]].hash !== e2[1].hash) changed.push(e2[0]); });
    Object.keys(ls).forEach(function(fp) { if (!(fp in manifest)) deleted.push(fp); });
    let hashes = {};
    Object.entries(manifest).forEach(function(e2) { hashes[e2[0]] = e2[1].hash; });
    return { manifest: hashes, fileCount: Object.keys(manifest).length, totalSize: Object.values(manifest).reduce(function(s, i) { return s + i.size; }, 0), hasChanges: added.length + changed.length + deleted.length > 0, added: added, changed: changed, deleted: deleted };
  });
  ipcMain.handle('set-project-path', function(e, pid, name) { let cfg = getConfig(); let lp = path.join(cfg.syncRoot, sanitize(name)); ensureDir(lp); cfg.projects[pid] = Object.assign({}, cfg.projects[pid] || {}, { localPath: lp, lastSyncSnapshot: null, lastSyncAt: null }); saveConfig(); return lp; });
  ipcMain.handle('get-project-info', function(e, pid) { return getConfig().projects[pid] || null; });
  ipcMain.handle('get-project-icon', function(e, pid) {
    let pc = getConfig().projects[pid];
    if (!pc?.localPath) return null;
    let iconNames = ['favicon.ico', 'icon.ico', 'logo.png', 'icon.png', 'favicon.png', 'app.ico', 'build/icon.ico'];
    for (let i = 0; i < iconNames.length; i++) {
      let fp = path.join(pc.localPath, iconNames[i]);
      if (fs.existsSync(fp)) {
        try {
          let buf = fs.readFileSync(fp);
          let ext = path.extname(iconNames[i]).toLowerCase();
          let mime = ext === '.ico' ? 'image/x-icon' : 'image/png';
          return 'data:' + mime + ';base64,' + buf.toString('base64');
        } catch (e) { /* */ }
      }
    }
    return null;
  });
  ipcMain.handle('open-project-folder', function(e, pid) { let pc = getConfig().projects[pid]; if (pc?.localPath) shell.openPath(pc.localPath); });

  setInterval(async function() {
    try {
      let r = await apiRequest('GET', '/api/projects');
      if (r.status !== 200) return;
      let cfg = getConfig();
      for (let i = 0; i < r.data.projects.length; i++) {
        let p = r.data.projects[i];
        let local = cfg.projects[p.id];
        if (local && local.lastSyncAt && p.updated_at > local.lastSyncAt) {
          showNotification('VibeHub', p.name + ' 有更新');
        }
      }
    } catch (e) { /* */ }
  }, 60000);
}

module.exports = { setupIPC: setupIPC };
