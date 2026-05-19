import type { NextApiRequest, NextApiResponse } from 'next';
import { readInstalledLicense, verifyLicenseKey } from '@/services/LicenseService';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const installed = readInstalledLicense();
  if (!installed.key) {
    return res.status(200).json({ valid: false, message: 'No license installed' });
  }
  const result = verifyLicenseKey(installed.key, { allowExtension: true });
  if (!result.valid) {
    return res.status(200).json({ valid: false, message: result.reason || 'Invalid license' });
  }
  const effectiveExp = (installed as any).extendedExp || result.payload?.exp;
  return res.status(200).json({
    valid: true,
    message: 'License valid',
    expiresAt: effectiveExp,
    notBefore: result.payload?.nbf,
    licenseId: result.payload?.licenseId,
    kid: result.payload?.kid,
  });
}