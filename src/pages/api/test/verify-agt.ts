import { NextApiRequest, NextApiResponse } from 'next';
import { AgtService } from '../../../services/AgtService';
import { DocumentType } from '../../../models/Document';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agtService = new AgtService();
  const results = [];

  const testCases = [
    { type: 'factura_generica', expected: 'FT', isReceipt: false },
    { type: 'factura_global', expected: 'FT', isReceipt: false },
    { type: 'factura_adiantamento', expected: 'FT', isReceipt: false },
    { type: 'factura_recibo_autofacturacao', expected: 'FR', isReceipt: false, selfBilling: 1 }, // Maps to AF if selfBilling=1
    { type: 'recibo_estorno', expected: 'RE', isReceipt: true },
    { type: 'aviso_cobranca_recibo', expected: 'RC', isReceipt: true },
    { type: 'outros_recibos', expected: 'RG', isReceipt: true },
    { type: 'aviso_cobranca', expected: 'AC', isReceipt: false }, // Should remain AC (not submitted)
  ];

  try {
    for (const test of testCases) {
      const doc: any = {
        id: `test-${test.type}`,
        documentType: test.type,
        status: 'issued',
        issueDate: new Date().toISOString(),
        series: 'TEST',
        sequentialNumber: 1,
        buyer: { nif: '999999999', name: 'Test Client', address: 'Luanda' },
        seller: { nif: '5417012345', name: 'Test Company', address: 'Luanda' },
        lines: [
          { sku: 'ITEM1', description: 'Item 1', quantity: 1, unitPrice: 1000, vatRate: 14 }
        ],
        totals: {
          netTotal: 1000,
          vatTotal: 140,
          grandTotal: 1140,
          total: 1140
        },
        selfBillingIndicator: test.selfBilling
      };

      // Special handling for receipt types (need payment info)
      if (test.isReceipt) {
          doc.payment = { method: 'cash', paidDate: doc.issueDate, paidAmount: 1140, status: 'paid' };
          // Receipts shouldn't have lines in AGT payload, but we provide them to see if they are stripped
      }

      // Add related document for RE (required for reference)
      if (test.type === 'recibo_estorno') {
          doc.relatedDocuments = ['ORIGIN-RC-1'];
          doc.referenceInvoiceNo = 'RC TEST/1';
      }

      try {
        const payload = await agtService.generateRegistarFacturaPayload(doc);
        
        // Check if lines are present
        const hasLines = payload.lines && payload.lines.length > 0;
        const hasPaymentReceipt = !!payload.paymentReceipt;
        
        results.push({
          input: test.type,
          agtType: payload.documentType,
          expectedType: test.expected,
          match: payload.documentType === (test.selfBilling ? 'AF' : test.expected),
          hasLines,
          hasPaymentReceipt,
          selfBilling: payload.documentType === 'AF',
          payloadSnippet: {
              type: payload.documentType,
              linesCount: payload.lines?.length,
              paymentReceipt: payload.paymentReceipt ? 'Present' : 'Absent'
          }
        });

      } catch (e: any) {
        results.push({
          input: test.type,
          error: e.message
        });
      }
    }

    res.status(200).json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
