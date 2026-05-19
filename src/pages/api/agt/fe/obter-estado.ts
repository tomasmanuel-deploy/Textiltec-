import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';
import agtAuditService from '@/services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const requestID = typeof req.query.requestID === 'string' ? req.query.requestID : '';
  if (!requestID) return res.status(400).json({ error: 'requestID is required' });
  try {
    const svc = new AgtService();
    const resp = await svc.obterEstado(requestID);
    agtAuditService.log('agt_obter_estado', 'success', 'Estado obtido', { requestID, resp });
    return res.status(200).json(resp);
  } catch (e: any) {
    agtAuditService.log('agt_obter_estado', 'error', e?.message || 'Erro', { requestID });
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
