import { NextApiRequest, NextApiResponse } from 'next';
import { seriesStore } from '../../../lib/seriesStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, year } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Campo code é obrigatório' });
  const y = typeof year === 'number' ? year : new Date().getFullYear();
  try {
    const s = seriesStore.resetSeries(code, y);
    return res.status(200).json({ series: s });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}