import { NextApiRequest, NextApiResponse } from 'next';
import { seriesStore, SeriesConfig } from '../../../lib/seriesStore';
import connectToDatabase from '../../../lib/mongoose';
import Company from '../../../models/Company';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    const companyId = activeCompany ? String(activeCompany._id) : null;

    if (req.method === 'GET') {
      const { type, active, year, default: def } = req.query as any;
      const y = typeof year === 'string' && year ? Number(year) : undefined;
      const all = seriesStore.getAllSeries();
      const norm = (v: any) => String(v || '').trim().toLowerCase();
      const normalizeType = (x: any) => {
        const t = norm(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Map synonyms to canonical forms used in series store
        const map: Record<string, string> = {
          'factura': 'FT',
          'fatura': 'FT',
          'ft': 'FT',
          
          'orcamento': 'OR',
          'or': 'OR',
          
          'nota_de_entrega': 'GR', // Map Nota de Entrega to Guia de Remessa
          'guia_de_remessa': 'GR',
          'gr': 'GR',
          
          'recibo': 'RC',
          'rc': 'RC',
          
          'factura_recibo': 'FR',
          'fr': 'FR',
          
          'nota_de_debito': 'ND',
          'nd': 'ND',
          
          'nota_de_credito': 'NC',
          'nc': 'NC',
          
          'proforma': 'PP',
          'pp': 'PP'
        };
        return map[t] || t.toUpperCase();
      };
      const filtered = all.filter(s => {
        // Company isolation: only show series belonging to the active company
        // Legacy series (no companyId) are shown to all companies for backward compat
        const companyOk = !companyId || !s.companyId || s.companyId === companyId;
        const typeOk = typeof type === 'string' && type ? normalizeType(s.documentType) === normalizeType(type) : true;
        const activeOk = typeof active === 'string' && active ? (active === 'true' ? s.active : !s.active) : true;
        const yearOk = typeof y === 'number' ? s.year === y : true;
        const defaultOk = typeof def === 'string' ? (def === 'true' ? !!s.isDefault : !s.isDefault) : true;
        return companyOk && typeOk && activeOk && yearOk && defaultOk;
      });
      return res.status(200).json({ series: filtered });
    } else if (req.method === 'POST') {
      const body = req.body as Partial<SeriesConfig>;
      if (!body.code || !body.documentType || !body.year) {
        return res.status(400).json({ error: 'Campos obrigatórios: code, documentType, year' });
      }
      const cfg = seriesStore.createSeries({
        code: body.code,
        name: body.name || body.code,
        documentType: body.documentType,
        year: Number(body.year),
        startNumber: typeof body.startNumber === 'number' ? body.startNumber : 1,
        currentNumber: typeof body.currentNumber === 'number' ? body.currentNumber : 0,
        active: typeof body.active === 'boolean' ? body.active : true,
        isDefault: typeof body.isDefault === 'boolean' ? body.isDefault : false,
        companyId: companyId || undefined, // Tag with active company
        createdAt: '',
        updatedAt: '',
      } as any);
      return res.status(201).json({ series: cfg });
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('series index error', e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}