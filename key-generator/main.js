const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    title: 'Prakash License Generator',
    icon: path.join(__dirname, '../build/icons/icon.icns')
  });

  mainWindow.loadFile('renderer.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Key generation logic
function durationToSeconds(d) {
  switch (d) {
    case 'week': return 7 * 24 * 60 * 60;
    case 'month': return 30 * 24 * 60 * 60;
    case 'year': return 365 * 24 * 60 * 60;
    default:
      if (/^\d+[smhd]$/.test(d)) {
        const n = parseInt(d, 10);
        const unit = d.slice(-1);
        const m = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
        return n * m;
      }
      throw new Error('Invalid duration');
  }
}

function bufferToBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function computePublicKeyFingerprint(publicPem) {
  const body = publicPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
  const der = Buffer.from(body, 'base64');
  return crypto.createHash('sha256').update(der).digest('base64');
}

ipcMain.handle('select-private-key', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Private Key File',
    filters: [
      { name: 'PEM Files', extensions: ['pem'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  try {
    const keyPath = result.filePaths[0];
    const keyContent = fs.readFileSync(keyPath, 'utf-8');
    return { path: keyPath, content: keyContent };
  } catch (error) {
    throw new Error(`Failed to read key file: ${error.message}`);
  }
});

ipcMain.handle('generate-license', async (event, { privateKeyPem, duration, product, issuer, machineCode }) => {
  try {
    if (!machineCode || typeof machineCode !== 'string' || machineCode.length < 8) {
      throw new Error('Missing or invalid computer code');
    }
    // Derive public key fingerprint (kid)
    const publicPem = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
    const kid = computePublicKeyFingerprint(publicPem);

    const now = Date.now();
    const iat = new Date(now).toISOString();
    const nbf = new Date(now - 30_000).toISOString();
    const durSec = durationToSeconds(duration);
    const exp = new Date(now + durSec * 1000).toISOString();

    const payload = {
      kid,
      iss: issuer,
      product: product,
      iat,
      nbf,
      exp,
      licenseId: 'LIC-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
      durationSeconds: durSec,
      machineCode: machineCode.replace(/\s+/g, ''),
    };

    const payloadStr = JSON.stringify(payload);
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(payloadStr);
    sign.end();
    const sig = sign.sign(privateKeyPem);

    const token = ['PRK', bufferToBase64Url(Buffer.from(payloadStr)), bufferToBase64Url(sig)].join('.');

    return {
      success: true,
      token,
      payload
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('save-license', async (event, { token, filename }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save License Key',
    defaultPath: filename || 'license-key.txt',
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, token, 'utf-8');
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});