import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { resolveDataPath } from '@/lib/dataPaths';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const alertsPath = resolveDataPath('alerts.json');
  try {
    if (fs.existsSync(alertsPath)) {
      const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf-8'));
      // Return last 20 alerts, sorted by date desc
      const sorted = alerts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.status(200).json({ alerts: sorted.slice(0, 20) });
    } else {
      res.status(200).json({ alerts: [] });
    }
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
