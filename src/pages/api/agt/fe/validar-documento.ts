import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { documentNo, action, deductibleVATPercentage, nonDeductibleAmount, deductibleAmount } = req.body || {};
  if (!documentNo || !action) return res.status(400).json({ error: 'documentNo and action are required' });
  if (action !== 'C' && action !== 'R') return res.status(400).json({ error: 'action must be C or R' });
  try {
    const svc = new AgtService();
    const opts: any = {};
    if (deductibleVATPercentage !== undefined) opts.deductibleVATPercentage = Number(deductibleVATPercentage);
    if (nonDeductibleAmount !== undefined) opts.nonDeductibleAmount = Number(nonDeductibleAmount);
    if (opts.deductibleVATPercentage === undefined && opts.nonDeductibleAmount === undefined && deductibleAmount !== undefined) {
      opts.nonDeductibleAmount = Number(deductibleAmount);
    }
    const resp = await svc.validarDocumento(String(documentNo), action, opts);
    return res.status(200).json(resp);
  } catch (e: any) {
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
