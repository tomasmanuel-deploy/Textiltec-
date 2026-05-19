import { NextApiRequest, NextApiResponse } from 'next';
import { CentralStore } from '../../../lib/centralStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = CentralStore.getStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
}
