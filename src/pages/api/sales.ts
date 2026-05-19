import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../lib/documentStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const documents = documentStore.getAllDocuments();

    const sales = documents
      .filter((d) => d.documentType === 'factura')
      .map((d) => {
        const idNum = parseInt(String(d.id), 10);
        const clientIdNum = parseInt(String((d.buyer && (d.buyer as any).nif))?.replace(/\D/g, '') || '0', 10) || d.sequentialNumber;
        const status = d.status === 'paid' ? 'paid' : d.status === 'cancelled' ? 'cancelled' : 'pending';

        return {
          id: isNaN(idNum) ? d.sequentialNumber : idNum,
          clientId: clientIdNum,
          total: d.totals.total,
          date: d.issueDate,
          status,
        };
      });

    return res.status(200).json(sales);
  } catch (error) {
    console.error('Error building sales:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}