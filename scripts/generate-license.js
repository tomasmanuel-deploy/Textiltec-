#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function usage() {
  console.log(`Usage: node scripts/generate-license.js [--duration week|month|year] [--product <appId>] [--issuer <name>] [--key <private.pem>]`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { duration: 'week', product: 'com.example.prakash', issuer: 'Prakash Licensing', keyPath: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--duration') opts.duration = args[++i];
    else if (a === '--product') opts.product = args[++i];
    else if (a === '--issuer') opts.issuer = args[++i];
    else if (a === '--key') opts.keyPath = args[++i];
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
  }
  return opts;
}

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

(function main() {
  const opts = parseArgs();
  const privPem = process.env.LICENSE_PRIVATE_KEY_PEM || (opts.keyPath ? fs.readFileSync(path.resolve(opts.keyPath), 'utf-8') : null);
  if (!privPem) {
    console.error('Missing private key PEM. Provide via --key path or LICENSE_PRIVATE_KEY_PEM env var.');
    process.exit(1);
  }

  // Derive public key fingerprint (kid)
  const publicPem = crypto.createPublicKey(privPem).export({ type: 'spki', format: 'pem' }).toString();
  const kid = computePublicKeyFingerprint(publicPem);

  const now = Date.now();
  const iat = new Date(now).toISOString();
  const nbf = new Date(now - 30_000).toISOString();
  const durSec = durationToSeconds(opts.duration);
  const exp = new Date(now + durSec * 1000).toISOString();

  const payload = {
    kid,
    iss: opts.issuer,
    product: opts.product,
    iat,
    nbf,
    exp,
    licenseId: 'LIC-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
    durationSeconds: durSec,
  };

  const payloadStr = JSON.stringify(payload);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadStr);
  sign.end();
  const sig = sign.sign(privPem);

  const token = ['PRK', bufferToBase64Url(Buffer.from(payloadStr)), bufferToBase64Url(sig)].join('.');

  console.log('License Key:');
  console.log(token);
  console.log('\nDetails:', payload);
})();