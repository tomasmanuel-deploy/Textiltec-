import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const start = req.query.start ? String(req.query.start) : '';
  const end = req.query.end ? String(req.query.end) : '';
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
  try {
    const svc = new AgtService();
    const resp = await svc.listarFacturas(new Date(start), new Date(end));
    return res.status(200).json(resp);
  } catch (e: any) {
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
