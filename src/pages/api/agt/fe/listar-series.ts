import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const year = typeof req.query.anoSerie === 'string'
    ? String(req.query.anoSerie)
    : (typeof req.query.year === 'string' ? String(req.query.year) : undefined);
  const status = req.query.status ? String(req.query.status) : undefined;
  try {
    const svc = new AgtService();
    const resp = await svc.listarSeries(year, status);
    return res.status(200).json(resp);
  } catch (e: any) {
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
