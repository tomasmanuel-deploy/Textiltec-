const fs = require('fs');
const path = require('path');

const dir = process.env.NEXT_DIST_DIR || '.next';
const nextDir = path.join(process.cwd(), dir);

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
  }
} catch (e) {
  process.stderr.write(String(e && e.message ? e.message : e) + '\n');
  process.exit(1);
}
