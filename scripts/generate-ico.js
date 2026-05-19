const fs = require('fs');
const path = require('path');

(async () => {
  const src = path.join(process.cwd(), 'assets', 'icon.png');
  const destDir = path.join(process.cwd(), 'build', 'icons');
  const dest = path.join(destDir, 'icon.ico');

  if (!fs.existsSync(src)) {
    console.log('assets/icon.png missing; skipping Windows icon generation');
    process.exit(0);
  }
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  try {
    const pngToIco = require('png-to-ico');
    const buf = await pngToIco(src);
    fs.writeFileSync(dest, buf);
    console.log('Generated', dest);
  } catch (e) {
    console.error('Failed to generate ICO:', e);
    process.exit(1);
  }
})();