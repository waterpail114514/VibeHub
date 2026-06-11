const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { loadConfig, saveConfig, getConfig } = require('./config');
const { setupIPC } = require('./ipc-handlers');

const ICON_PATH = path.join(__dirname, 'src', 'assets', 'icon.png');

let mainWindow = null;
let isQuitting = false;

// Tell DWM to give our frameless window rounded corners (Windows 11)
function enableRoundedCorners(win) {
  if (process.platform !== 'win32') return;
  try {
    const hwndBuf = win.getNativeWindowHandle();
    const hwnd = hwndBuf.readBigUInt64LE(0);

    // Write a temporary PowerShell script to avoid escaping hell
    const scriptPath = path.join(os.tmpdir(), 'vibehub-round-corners.ps1');
    const script = `
Add-Type -Name DWM -Namespace Win32 -MemberDefinition '
[DllImport("dwmapi.dll")]
public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int val, int size);
'
$hwnd = [IntPtr]::new(${hwnd})
$DWMWA_CORNER = 33
$ROUND = 2
[Win32.DWM]::DwmSetWindowAttribute($hwnd, $DWMWA_CORNER, [ref]$ROUND, 4)
`;
    fs.writeFileSync(scriptPath, script, 'utf-8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 5000 });
    try { fs.unlinkSync(scriptPath); } catch { /* */ }
    console.log('✅ Rounded corners applied');
  } catch (e) {
    console.log('⚠ Rounded corners skipped (may need Win11 22000+):', e.message?.slice(0, 80));
  }
}

function createWindow() {
  const cfg = getConfig();

  mainWindow = new BrowserWindow({
    icon: ICON_PATH,
    width: 480,
    height: 640,
    minWidth: 440,
    minHeight: 500,
    maxWidth: 600,
    maxHeight: 900,
    x: cfg.windowX,
    y: cfg.windowY,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic',
    } : {
      vibrancy: 'under-window',
      visualEffectState: 'active',
    }),

    alwaysOnTop: cfg.alwaysOnTop || false,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,

    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Enable native rounded corners on Win11 after window is ready
  mainWindow.once('ready-to-show', () => {
    enableRoundedCorners(mainWindow);
  });

  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (process.env.VIBEHUB_DEV === '1' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('moved', () => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      saveConfig({ windowX: x, windowY: y });
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  loadConfig();
  setupIPC();
  createWindow();

  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    }
  });

  app.on('activate', () => {
    if (mainWindow) mainWindow.show();
    else createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  saveConfig();
});
