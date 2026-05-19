import type { NextApiRequest, NextApiResponse } from 'next';
import { installLicense, readInstalledLicense } from '@/services/LicenseService';
import { seriesStore } from '@/lib/seriesStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const { key } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Missing license key' });
    }
    const result = installLicense(key);
    if (!result.valid) {
      return res.status(200).json({ ok: false, message: result.reason || 'Invalid license key' });
    }
    
    // Trigger series seeding after successful license installation
    try {
      const currentYear = new Date().getFullYear();
      seriesStore.ensureDefaults(currentYear);
      console.log(`[License] Seeded default series for year ${currentYear}`);
    } catch (err) {
      console.error('[License] Failed to seed default series:', err);
      // Continue execution, do not fail license installation
    }

    const installed = readInstalledLicense();
    return res.status(200).json({
      ok: true,
      message: 'License installed successfully.',
      expiresAt: (installed as any).extendedExp || result.payload?.exp,
      notBefore: result.payload?.nbf,
      licenseId: result.payload?.licenseId,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Server error' });
  }
}
