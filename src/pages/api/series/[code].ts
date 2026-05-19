import { NextApiRequest, NextApiResponse } from 'next';
import { seriesStore } from '../../../lib/seriesStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query;
  const yearParam = req.query.year;
  const year = typeof yearParam === 'string' && yearParam ? Number(yearParam) : undefined;

  if (typeof code !== 'string' || !code) {
    return res.status(400).json({ error: 'Parâmetro code inválido' });
  }

  try {
    if (req.method === 'GET') {
      const s = seriesStore.getSeries(code, year);
      if (!s) return res.status(404).json({ error: 'Série não encontrada' });
      return res.status(200).json({ series: s });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const y = year ?? new Date().getFullYear();
      const patch = req.body || {};
      const s = seriesStore.updateSeries(code, y, patch);
      return res.status(200).json({ series: s });
    }

    if (req.method === 'DELETE') {
      const y = year ?? new Date().getFullYear();
      const ok = seriesStore.deleteSeries(code, y);
      return res.status(ok ? 200 : 404).json({ success: ok });
    }

    res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('series detail error', e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}