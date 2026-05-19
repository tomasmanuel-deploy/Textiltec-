import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';
import agtAuditService from '@/services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const svc = new AgtService();
    const resp = await svc.registarFacturaRaw(body);
    agtAuditService.log('agt_registar_factura_raw', 'success', 'registarFactura called', { response: resp });
    return res.status(200).json(resp);
  } catch (e: any) {
    agtAuditService.log('agt_registar_factura_raw', 'error', e?.message || 'Erro', {});
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
