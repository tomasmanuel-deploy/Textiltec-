import { NextApiRequest, NextApiResponse } from 'next';
import { seriesStore, SeriesConfig, SupportedDocumentType } from '../../../lib/seriesStore';
import connectToDatabase from '../../../lib/mongoose';
import Company from '../../../models/Company';

const DEFAULTS: Array<{ documentType: SupportedDocumentType; code: string; name: string }> = [
  { documentType: 'factura', code: 'FT', name: 'Factura' },
  { documentType: 'orçamento', code: 'OR', name: 'Orçamento' },
  { documentType: 'nota_de_entrega', code: 'GR', name: 'Guia de Remessa' },
  { documentType: 'recibo', code: 'RC', name: 'Recibo' },
  { documentType: 'nota_de_credito', code: 'NC', name: 'Nota de Crédito' },
  { documentType: 'nota_de_debito', code: 'ND', name: 'Nota de Débito' },
  { documentType: 'factura_recibo', code: 'FR', name: 'Factura-Recibo' },
  { documentType: 'proforma', code: 'PP', name: 'Proforma' },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    const companyId = activeCompany ? String(activeCompany._id) : undefined;

    const year = new Date().getFullYear();
    const created: SeriesConfig[] = [];

    for (const { documentType, code, name } of DEFAULTS) {
      const hasDefault = seriesStore.getDefaultSeries(documentType, year);
      const hasCode = seriesStore.getSeries(code, year);
      if (!hasDefault && !hasCode) {
        const cfg = seriesStore.createSeries({
          code,
          name: `${code} · ${name}`,
          documentType,
          year,
          startNumber: 1,
          currentNumber: 0,
          active: true,
          isDefault: true,
          companyId,
        });
        created.push(cfg);
      }
    }

    return res.status(201).json({ created, year });
  } catch (e: any) {
    console.error('seed-defaults error', e);
    return res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}