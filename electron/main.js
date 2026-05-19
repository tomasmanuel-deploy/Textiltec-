const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const next = require('next');

let serverInstance;
let logFilePath = null;

function log(...args) {
  try {
    console.log('[Main]', ...args);
    if (logFilePath) {
      const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
      fs.appendFileSync(logFilePath, line);
    }
  } catch (_) {}
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });
  return win;
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 460,
    height: 460,
    resizable: false,
    movable: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#7e3492',
    show: true,
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.center();
  return splash;
}

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        // Consider ready only when home returns 200
        if (res.statusCode === 200) {
          res.resume();
          resolve(true);
        } else {
          res.resume();
          if (Date.now() - start > timeoutMs) return reject(new Error('Server not ready'));
          setTimeout(check, 500);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Server not reachable'));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function listenWithFallback(server, startPort, host = 'localhost', maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let port = Number(startPort);
    let attempts = 0;
    const tryListen = () => {
      attempts += 1;
      const onError = (err) => {
        server.removeListener('error', onError);
        if (err && err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          port += 1;
          log('Port in use, retrying on', port);
          tryListen();
        } else {
          reject(err);
        }
      };
      server.once('error', onError);
      try {
        server.listen(port, host, () => {
          server.removeListener('error', onError);
          resolve(port);
        });
      } catch (err) {
        onError(err);
      }
    };
    tryListen();
  });
}

async function startNextServer() {
  // Resolve the actual Next app directory in packaged builds.
  // electron-builder typically places the app under Resources/app when asar is disabled,
  // and under Resources/app.asar when asar is enabled. Some setups may copy .next to Resources.
  let appDir;
  if (app.isPackaged) {
    const candidates = [
      process.resourcesPath,
      path.join(process.resourcesPath, 'app'),
      path.join(process.resourcesPath, 'app.asar'),
    ];
    for (const candidate of candidates) {
      try {
        const nextRoot = path.join(candidate, '.next');
        const nextServer = path.join(nextRoot, 'server');
        if (fs.existsSync(nextRoot) && fs.existsSync(nextServer)) {
          appDir = candidate;
          break;
        }
      } catch (_) {}
    }
    if (!appDir) appDir = process.resourcesPath; // fallback
  } else {
    appDir = path.join(__dirname, '..');
  }
  try { process.chdir(appDir); } catch (_) {}

  // Avoid dev-server port conflicts when packaged
  const port = app.isPackaged ? (process.env.PORT || '3300') : (process.env.PORT || '3000');
  log('Starting Next server', { appDir, port, packaged: app.isPackaged, hasNext: fs.existsSync(path.join(appDir, '.next')) });

  // Start Next programmatically to avoid relying on CLI binaries
  const nextApp = next({ dev: false, dir: appDir });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  serverInstance = http.createServer((req, res) => handle(req, res));
  const chosenPort = await listenWithFallback(serverInstance, port, '127.0.0.1');
  log('Next server listening on', chosenPort);
  return chosenPort;
}

app.on('ready', async () => {
  // Set application name and About panel to desired branding on macOS
  if (process.platform === 'darwin') {
    try {
      if (typeof app.setName === 'function') {
        app.setName('Prakash');
      }
      if (typeof app.setAboutPanelOptions === 'function') {
        app.setAboutPanelOptions({
          applicationName: 'Prakash',
          applicationVersion: app.getVersion(),
        });
      }
      // Re-apply menu so the app name updates in the macOS menu bar
      const currentMenu = Menu.getApplicationMenu();
      Menu.setApplicationMenu(currentMenu);
    } catch (_) {}
  }
  // Initialize writable DATA_DIR for app JSON storage
  try {
    const userDataDir = path.join(app.getPath('userData'), 'data');
    process.env.DATA_DIR = userDataDir;
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    // Initialize log file
    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
      logFilePath = path.join(logsDir, 'main.log');
      fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] App started\n`);
    } catch (_) {}

    // Ensure clean slate on first install: keep only series/system and seed them
    try {
      const firstRunMarker = path.join(userDataDir, '.installed');
      const whitelist = new Set(['series.json', 'system.json']);
      if (!fs.existsSync(firstRunMarker)) {
        const entries = fs.readdirSync(userDataDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith('.json') && !whitelist.has(e.name)) {
            try { fs.unlinkSync(path.join(userDataDir, e.name)); } catch (_) {}
          }
        }
        // Seed whitelisted files from bundled resources if available
        try {
          const resRoot = process.resourcesPath || path.dirname(process.execPath);
          const candidates = [
            path.join(resRoot, 'data'),
            path.join(resRoot, 'app', 'data'),
            path.join(resRoot, 'app.asar', 'data'),
          ];
          let bundledData = null;
          for (const c of candidates) { if (fs.existsSync(c)) { bundledData = c; break; } }
          for (const name of whitelist) {
            const src = bundledData ? path.join(bundledData, name) : null;
            const dest = path.join(userDataDir, name);
            if (src && fs.existsSync(src) && !fs.existsSync(dest)) {
              fs.copyFileSync(src, dest);
            }
          }
        } catch (_) {}
        fs.writeFileSync(firstRunMarker, new Date().toISOString());
        log('First-run cleanup done; seeded series/system; marker created');
      }
    } catch (_) {}

    // On packaged app, ensure series/system exist by copying from resources if missing
    if (app.isPackaged) {
      const resRoot = process.resourcesPath || path.dirname(process.execPath);
      const candidates = [
        path.join(resRoot, 'data'),
        path.join(resRoot, 'app', 'data'),
        path.join(resRoot, 'app.asar', 'data'),
      ];
      let bundledData = null;
      for (const c of candidates) { if (fs.existsSync(c)) { bundledData = c; break; } }
      try {
        const files = ['series.json', 'system.json', 'agt_config.json'];
        for (const name of files) {
          const src = bundledData ? path.join(bundledData, name) : null;
          const dest = path.join(userDataDir, name);
          let shouldSeed = false;
          
          if (src && fs.existsSync(src)) {
             if (!fs.existsSync(dest)) {
                shouldSeed = true;
             } else if (name === 'series.json' || name === 'system.json') {
                try {
                  const raw = fs.readFileSync(dest, 'utf-8');
                  const json = raw ? JSON.parse(raw) : null;
                  if (name === 'series.json') {
                    const arr = json && Array.isArray(json.series) ? json.series : [];
                    shouldSeed = arr.length === 0; 
                  } else if (name === 'system.json') {
                    shouldSeed = !json || Object.keys(json || {}).length === 0;
                  }
                } catch (_) { shouldSeed = true; }
             }
          }
          
          if (shouldSeed) {
            fs.copyFileSync(src, dest);
          }
        }
        
        // Copy agt_keys directory if missing
        const keysSrc = bundledData ? path.join(bundledData, 'agt_keys') : null;
        const keysDest = path.join(userDataDir, 'agt_keys');
        if (keysSrc && fs.existsSync(keysSrc) && !fs.existsSync(keysDest)) {
            const copyDir = (src, dest) => {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                const entries = fs.readdirSync(src, { withFileTypes: true });
                for (const entry of entries) {
                    const srcPath = path.join(src, entry.name);
                    const destPath = path.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        copyDir(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                }
            };
            copyDir(keysSrc, keysDest);
        }
      } catch (seedErr) {
        log('Failed to seed DATA_DIR from resources:', seedErr);
      }
    }
  } catch (e) {
    log('Failed to initialize DATA_DIR:', e);
  }
  const splash = createSplashWindow();
  if (app.isPackaged) {
    let port;
    try {
      port = await startNextServer();
    } catch (err) {
      log('Failed to start Next server:', err);
    }
    const url = `http://127.0.0.1:${port || 3300}`;
    // Wait until Next returns 200 from home to avoid connection refused
    try { await waitForServer(url, 30000); log('Server ready'); } catch (err) { log('Server wait error:', err); }
    const win = createMainWindow();
    win.loadURL(url);
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      log('did-fail-load', { errorCode, errorDescription, validatedURL });
    });
    win.on('unresponsive', () => log('Window became unresponsive'));
    const reveal = () => {
      setTimeout(() => {
        try { if (!splash.isDestroyed()) splash.close(); } catch (_) {}
        win.show();
      }, 350);
    };
    win.once('ready-to-show', reveal);
    // Fallback: reveal after timeout even if 'ready-to-show' doesn't trigger
    setTimeout(() => { if (!win.isVisible()) reveal(); }, 8000);
  } else {
    const win = createMainWindow();
    win.loadURL('http://localhost:3000');
    win.once('ready-to-show', () => {
      setTimeout(() => {
        try { if (!splash.isDestroyed()) splash.close(); } catch (_) {}
        win.show();
      }, 350);
    });
  }
});

app.on('window-all-closed', () => {
  if (serverInstance) {
    try { serverInstance.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS: re-create window if none open
});