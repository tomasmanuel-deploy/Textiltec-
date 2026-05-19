const fs = require('fs');
const path = require('path');

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

(function cleanup() {
  const distDir = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distDir)) {
    console.log('dist folder not found, nothing to clean');
    process.exit(0);
  }
  const removeDirs = new Set([
    'win-unpacked',
    'win-x64-unpacked',
    'win-arm64-unpacked'
  ]);
  const removed = [];
  const kept = [];

  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(distDir, e.name);
    if (e.isDirectory()) {
      if (removeDirs.has(e.name)) {
        rmrf(full);
        removed.push(e.name);
      } else {
        kept.push(e.name);
      }
    } else if (e.isFile()) {
      const n = e.name.toLowerCase();
      const isWinZip = n.endsWith('.zip') && n.includes('win');
      const isBlockMap = n.endsWith('.blockmap') && n.includes('.exe');
      const isExe = n.endsWith('.exe');
      if (isWinZip || isBlockMap) {
        rmrf(full);
        removed.push(e.name);
      } else if (isExe) {
        kept.push(e.name);
      } else {
        // keep other artifacts (mac dmg, config files)
        kept.push(e.name);
      }
    }
  }
  console.log('Cleanup complete. Removed:', removed);
  console.log('Kept:', kept);
})();