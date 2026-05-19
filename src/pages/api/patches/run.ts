import type { NextApiRequest, NextApiResponse } from 'next';
import { PatchingService, builtInPatches } from '../../../services/PatchingService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const dryQuery = (req.query?.dry ?? '').toString();
    const dryRun = dryQuery === '1' || dryQuery.toLowerCase() === 'true';
    const forceQuery = (req.query?.force ?? '').toString();
    const force = forceQuery === '1' || forceQuery.toLowerCase() === 'true';

    // Optional auth: require token when PATCH_TOKEN is set and not a dry-run
    const enforceAuth = Boolean(process.env.PATCH_TOKEN);
    if (enforceAuth && !dryRun) {
      const authHeader = String(req.headers['authorization'] || '');
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
      const queryToken = String(req.query?.token || '');
      const providedToken = bearerToken || queryToken;
      if (!providedToken || providedToken !== process.env.PATCH_TOKEN) {
        return res.status(403).json({ error: 'Forbidden: invalid token' });
      }
      // Optional IP allowlist
      const allowlistStr = String(process.env.PATCH_IP_ALLOWLIST || '');
      const allowlist = allowlistStr.split(',').map(s => s.trim()).filter(Boolean);
      if (allowlist.length) {
        const xff = String(req.headers['x-forwarded-for'] || '');
        const candidate = xff ? xff.split(',')[0].trim() : (req.socket.remoteAddress || '');
        if (!allowlist.includes(candidate)) {
          return res.status(403).json({ error: 'Forbidden: IP not allowed', ip: candidate });
        }
      }
    }

    const svc = new PatchingService();
    const { results, summary } = await svc.applyAll(builtInPatches, {
      dryRun,
      force,
      log: (msg: string) => console.log(`[patch] ${msg}`),
    });

    return res.status(200).json({
      dryRun,
      force,
      summary,
      results,
    });
  } catch (error) {
    console.error('Error running patches:', error);
    return res.status(500).json({ error: 'Failed to run patches' });
  }
}