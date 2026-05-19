import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { licenseJsonPath } from '@/lib/dataPaths';

// License format: PRK.<base64url(payloadJson)>.<base64url(signatureBytes)>
// payload fields: { kid, iss, product, iat, nbf, exp, licenseId, durationSeconds }

function base64UrlToBuffer(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return Buffer.from(b64 + pad, 'base64');
}

function bufferToBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function computePublicKeyFingerprint(publicPem: string): string {
  const body = publicPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
  const der = Buffer.from(body, 'base64');
  return crypto.createHash('sha256').update(der).digest('base64');
}

function getPublicKeyPem(): string | null {
  // Prefer env var injection for production
  if (process.env.LICENSE_PUBLIC_KEY_PEM) {
    return process.env.LICENSE_PUBLIC_KEY_PEM;
  }
  // Fallback to bundled file if available
  const candidates = [
    path.join(process.cwd(), 'data', 'agt_keys', 'public.pem'),
    path.join(process.cwd(), 'public.pem'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8'); } catch {}
  }
  return null;
}

export type LicensePayload = {
  kid: string;
  iss: string;
  product: string;
  iat: string; // ISO
  nbf: string; // ISO
  exp: string; // ISO
  licenseId: string;
  durationSeconds: number;
  machineCode?: string; // Computer binding code
};

export type VerifyResult = {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
};

export function verifyLicenseKey(key: string, opts?: { allowExtension?: boolean }): VerifyResult {
  try {
    if (!key || typeof key !== 'string') return { valid: false, reason: 'Empty key' };
    const parts = key.split('.');
    if (parts.length !== 3 || parts[0] !== 'PRK') return { valid: false, reason: 'Malformed key' };
    const payloadBuf = base64UrlToBuffer(parts[1]);
    const sigBuf = base64UrlToBuffer(parts[2]);
    const payloadStr = payloadBuf.toString('utf-8');
    const payload: LicensePayload = JSON.parse(payloadStr);

    const pubPem = getPublicKeyPem();
    if (!pubPem) return { valid: false, reason: 'Missing public key' };
    const kid = computePublicKeyFingerprint(pubPem);
    if (payload.kid && payload.kid !== kid) {
      return { valid: false, reason: 'Key fingerprint mismatch' };
    }

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(payloadStr);
    verify.end();
    const ok = verify.verify(pubPem, sigBuf);
    if (!ok) return { valid: false, reason: 'Signature invalid' };

    const now = Date.now();
    const nbf = Date.parse(payload.nbf);
    const exp = Date.parse(payload.exp);
    if (Number.isFinite(nbf) && now < nbf - 60_000) {
      return { valid: false, reason: 'Not yet valid' };
    }
    if (Number.isFinite(exp) && now > exp + 5_000) {
      if (opts?.allowExtension) {
        try {
          const p = licenseJsonPath();
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf-8');
            const j = raw ? JSON.parse(raw) : {};
            const extStr = j.extendedExp || j.effectiveExpiry || j.extendUntil || j.notAfter;
            const ext = Date.parse(extStr);
            if (Number.isFinite(ext) && now <= ext + 5_000) {
              // Allow via stacked extension
            } else {
              return { valid: false, reason: 'Expired' };
            }
          } else {
            return { valid: false, reason: 'Expired' };
          }
        } catch {
          return { valid: false, reason: 'Expired' };
        }
      } else {
        return { valid: false, reason: 'Expired' };
      }
    }

    const appId = 'com.example.prakash';
    if (payload.product !== appId) return { valid: false, reason: 'Product mismatch' };

    // Require machine binding if present
    try {
      const { getComputerCode } = require('@/services/MachineIdService');
      const localCode = getComputerCode();
      if (payload.machineCode && payload.machineCode !== localCode) {
        return { valid: false, reason: 'License bound to different computer' };
      }
    } catch {}

    return { valid: true, payload };
  } catch (e: any) {
    return { valid: false, reason: 'Verification error' };
  }
}

export function readInstalledLicense(): { key?: string } {
  try {
    const p = licenseJsonPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const j = raw ? JSON.parse(raw) : {};
      if (j && typeof j === 'object') return j;
    }
  } catch {}
  return {};
}

export function installLicense(key: string) {
  const res = verifyLicenseKey(key, { allowExtension: false });
  if (!res.valid) return res;
  try {
    const p = licenseJsonPath();
    const payload = res.payload!;
    let prev: any = {};
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        prev = raw ? JSON.parse(raw) : {};
      }
    } catch {}
    const prevApplied: string[] = Array.isArray(prev?.appliedIds) ? prev.appliedIds : [];
    const duplicateKey = typeof prev?.key === 'string' && prev.key === key;
    const duplicateId = typeof payload.licenseId === 'string' && prevApplied.includes(payload.licenseId);
    const prevExpMs = Date.parse(prev?.extendedExp || prev?.notAfter);
    const proposedExpMs = Date.parse(payload.exp);
    let effectiveExpMs = Number.isFinite(prevExpMs) ? Math.max(prevExpMs, proposedExpMs) : proposedExpMs;

    if (duplicateKey || duplicateId) {
      const effectiveIso = Number.isFinite(prevExpMs) ? new Date(prevExpMs).toISOString() : payload.exp;
      res.payload = { ...payload, exp: effectiveIso };
      return res;
    }

    const record = {
      key,
      installedAt: new Date().toISOString(),
      notBefore: payload.nbf,
      notAfter: payload.exp,
      extendedExp: new Date(effectiveExpMs).toISOString(),
      licenseId: payload.licenseId,
      kid: payload.kid,
      appliedIds: Array.from(new Set([...(prevApplied || []), payload.licenseId].filter(Boolean))),
      tokenHash: crypto.createHash('sha256').update(key).digest('hex'),
    };
    fs.writeFileSync(p, JSON.stringify(record, null, 2), 'utf-8');
    // Adjust payload exp for immediate caller convenience
    res.payload = { ...payload, exp: record.extendedExp };
  } catch {}
  return res;
}
