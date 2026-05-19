import { machineIdSync } from 'node-machine-id';
import crypto from 'crypto';

const APP_ID = 'com.example.prakash';

function hashHex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').toUpperCase();
}

function segment(code: string, group = 4): string {
  const parts: string[] = [];
  for (let i = 0; i < code.length; i += group) {
    parts.push(code.slice(i, i + group));
  }
  return parts.join('-');
}

export function getMachineIdRaw(): string {
  try {
    // Prefer native machine id; allow override for testing
    const override = process.env.MACHINE_ID_OVERRIDE;
    if (override && override.length > 8) return override;
    return machineIdSync();
  } catch {
    // Fallback to random but stable per run (not ideal)
    return hashHex(`${APP_ID}:${process.platform}:${process.arch}`);
  }
}

export function getComputerCode(): string {
  const raw = getMachineIdRaw();
  const digest = hashHex(`${APP_ID}:${raw}`); // App-bound
  const short = digest.slice(0, 40); // 20 bytes -> 40 hex chars
  return segment(short, 4); // XXXX-XXXX-... (10 groups)
}

export function matchesComputerCode(code: string): boolean {
  const local = getComputerCode();
  return typeof code === 'string' && code.replace(/\s+/g, '') === local;
}