const { spawn } = require('child_process');
const net = require('net');

process.env.NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || '.next-dev';

const preferredPort = Number(process.env.PORT || 3000);

const sanitizeEnv = (env) => {
  const nextEnv = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value !== 'string') continue;
    if (process.platform === 'win32' && key.startsWith('=')) continue;
    nextEnv[key] = value;
  }
  return nextEnv;
};

const findAvailablePort = (startPort, maxTries = 20) =>
  new Promise((resolve, reject) => {
    let port = startPort;
    let tries = 0;

    const tryPort = () => {
      const server = net.createServer();
      server.unref();

      server.once('error', (err) => {
        server.close();
        if (err && err.code === 'EADDRINUSE') {
          tries += 1;
          if (tries > maxTries) {
            reject(new Error(`No available port found starting at ${startPort}`));
            return;
          }
          port += 1;
          tryPort();
          return;
        }
        reject(err);
      });

      server.listen(port, () => {
        const chosen = port;
        server.close(() => resolve(chosen));
      });
    };

    tryPort();
  });

const childEnv = sanitizeEnv(process.env);

const clean = spawn(process.execPath, ['scripts/clean-next.js'], {
  stdio: 'inherit',
  env: childEnv,
});

clean.on('exit', (code) => {
  if (code !== 0) process.exit(code || 1);

  findAvailablePort(preferredPort)
    .then((port) => {
      process.env.PORT = String(port);
      childEnv.PORT = String(port);
      const nextBin = require.resolve('next/dist/bin/next');
      const nextArgs = [nextBin, 'dev', '-p', String(port)];

      const child = spawn(process.execPath, nextArgs, {
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('exit', (c) => process.exit(c || 0));
    })
    .catch((err) => {
      console.error('Failed to start server');
      console.error(err);
      process.exit(1);
    });
});
