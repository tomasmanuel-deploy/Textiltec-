import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const invoiceNo = typeof req.query.invoiceNo === 'string' ? req.query.invoiceNo : '';
  if (!invoiceNo) return res.status(400).json({ error: 'invoiceNo is required' });
  try {
    const svc = new AgtService();
    const resp = await svc.consultarFactura(invoiceNo);
    return res.status(200).json(resp);
  } catch (e: any) {
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
