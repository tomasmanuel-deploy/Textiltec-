
import { AgtService } from '../src/services/AgtService';
import { DocumentType, DocumentStatus } from '../src/models/Document';
import fs from 'fs';
import path from 'path';

async function testNcPayload() {
  const agtService = new AgtService();
  
  const docNC: any = {
    id: '404',
    uuid: 'f170e528-5809-432e-957f-de77c63f7726',
    series: 'NC',
    sequentialNumber: 142,
    documentType: 'nota_de_credito',
    issueDate: '2026-03-29',
    taxableDate: '2026-03-29',
    seller: {
      name: 'Textiltec Soluções',
      nif: '5002821079',
      address: 'LUANDA ',
    },
    buyer: {
      name: 'Rajan Fortes',
      nif: '99999999999',
    },
    lines: [
      {
        sku: '1231434',
        description: 'Nota de crédito referente FT XVE2026/162 — New product ',
        quantity: -1,
        unitPrice: 1,
        discount: 0,
        vatRate: 14,
        total: -1.14
      }
    ],
    totals: {
      subtotal: -1,
      discount: 0,
      vatTotal: -0.14,
      total: -1.14,
      vatBreakdown: [
        {
          rate: 14,
          base: -1,
          amount: -0.14
        }
      ]
    },
    status: 'issued',
    createdAt: '2026-03-29T19:56:49.037Z',
    hash: 'test-hash'
  };

  try {
    const payload = await agtService.generateRegistarFacturaPayload(docNC);
    const doc = payload.documents[0];
    
    console.log('--- NC Payload Verification ---');
    console.log('DocumentNo:', doc.documentNo);
    console.log('InvoiceType:', doc.invoiceType);
    console.log('Line 1 debitAmount:', doc.lines[0].debitAmount);
    console.log('Line 1 creditAmount:', doc.lines[0].creditAmount);
    console.log('Totals netTotal:', doc.documentTotals.netTotal);
    console.log('Totals taxPayable:', doc.documentTotals.taxPayable);
    console.log('Totals grossTotal:', doc.documentTotals.grossTotal);
    console.log('Totals totalDebit:', doc.documentTotals.totalDebit);
    console.log('Totals totalCredit:', doc.documentTotals.totalCredit);
    
    const isCorrect = 
      doc.invoiceType === 'NC' && 
      doc.lines[0].debitAmount === '1.00' && 
      doc.documentTotals.totalDebit === '1.00' && 
      doc.documentTotals.totalCredit === '0.00';
      
    if (isCorrect) {
      console.log('\nSUCCESS: NC payload is correctly formatted for AGT portal recognition.');
    } else {
      console.log('\nFAILURE: NC payload has incorrect formatting.');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

testNcPayload();
