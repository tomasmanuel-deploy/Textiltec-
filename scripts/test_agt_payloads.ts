
import { AgtService } from '../src/services/AgtService';
import { DocumentType, DocumentStatus } from '../src/models/Document';

// Mock Document Interface (simplified for testing)
const mockDocument = (type: DocumentType, series: string, num: number, isReceipt: boolean = false) => {
  const baseDoc: any = {
    uuid: `test-uuid-${type}-${num}`,
    series: series,
    sequentialNumber: num,
    documentType: type,
    issueDate: new Date(),
    taxableDate: new Date(),
    status: DocumentStatus.SUBMITTED, // AGT payload usually generated for submitted/signed docs
    seller: {
      name: 'Test Seller',
      nif: '5417000000',
      address: 'Luanda, Angola',
      city: 'Luanda'
    },
    buyer: {
      name: 'Test Buyer',
      nif: '999999999',
      address: 'Luanda, Angola',
      city: 'Luanda'
    },
    lines: [],
    totals: {
      subtotal: 1000,
      vatTotal: 140,
      total: 1140,
      vatBreakdown: [{ rate: 14, base: 1000, amount: 140 }]
    },
    payment: {
      method: 'cash',
      status: 'paid'
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    hash: 'test-hash-1234'
  };

  if (!isReceipt) {
    baseDoc.lines = [
      {
        sku: 'ITEM001',
        description: 'Test Item',
        quantity: 1,
        unit: 'UN',
        unitPrice: 1000,
        discount: 0,
        vatRate: 14,
        lineTotal: 1000
      }
    ];
  } else {
    // Receipt-specific fields
    baseDoc.relatedDocuments = ['FT 2024/1']; // Mock related doc
  }

  return baseDoc;
};

async function testPayloads() {
  const agtService = new AgtService();
  
  // 1. Factura (FT)
  console.log('\n--- Testing FT (Factura) ---');
  try {
    const docFT = mockDocument(DocumentType.INVOICE, 'FT', 1);
    const payloadFT = await agtService.generateRegistarFacturaPayload(docFT);
    console.log('FT Payload generated successfully.');
    // Check key fields
    console.log('DocumentType:', payloadFT.documents[0].documentType); // Should be FT
    console.log('Lines count:', payloadFT.documents[0].lines?.length); // Should be 1
  } catch (e) {
    console.error('Error generating FT payload:', e);
  }

  // 2. Factura-Recibo (FR)
  console.log('\n--- Testing FR (Factura-Recibo) ---');
  try {
    const docFR = mockDocument(DocumentType.INVOICE_RECEIPT, 'FR', 1);
    const payloadFR = await agtService.generateRegistarFacturaPayload(docFR);
    console.log('FR Payload generated successfully.');
    console.log('DocumentType:', payloadFR.documents[0].documentType); // Should be FR
    console.log('Lines count:', payloadFR.documents[0].lines?.length); // Should be 1
  } catch (e) {
    console.error('Error generating FR payload:', e);
  }

  // 3. Nota de Crédito (NC)
  console.log('\n--- Testing NC (Nota de Crédito) ---');
  try {
    const docNC = mockDocument(DocumentType.CREDIT_NOTE, 'NC', 1);
    docNC.referenceInvoiceNo = 'FT 2024/1';
    docNC.cancellation = { reason: 'Correction' };
    const payloadNC = await agtService.generateRegistarFacturaPayload(docNC);
    console.log('NC Payload generated successfully.');
    console.log('DocumentType:', payloadNC.documents[0].documentType); // Should be NC
    // Check referenceInfo
    console.log('ReferenceInfo:', payloadNC.documents[0].lines[0].referenceInfo);
    // Check debit/credit amount
    console.log('Line 0 keys:', Object.keys(payloadNC.documents[0].lines[0]));
  } catch (e) {
    console.error('Error generating NC payload:', e);
  }

  // 4. Nota de Débito (ND)
  console.log('\n--- Testing ND (Nota de Débito) ---');
  try {
    const docND = mockDocument(DocumentType.DEBIT_NOTE, 'ND', 1);
    docND.referenceInvoiceNo = 'FT 2024/1';
    const payloadND = await agtService.generateRegistarFacturaPayload(docND);
    console.log('ND Payload generated successfully.');
    console.log('DocumentType:', payloadND.documents[0].documentType); // Should be ND
    // Check debit/credit amount (Expect creditAmount for ND per memory?)
    // Memory: "em ND as linhas usam creditAmount"
    console.log('Line 0 keys:', Object.keys(payloadND.documents[0].lines[0]));
  } catch (e) {
    console.error('Error generating ND payload:', e);
  }

  // 5. Recibo (RC)
  console.log('\n--- Testing RC (Recibo) ---');
  try {
    const docRC = mockDocument(DocumentType.RECEIPT, 'RC', 1, true);
    const payloadRC = await agtService.generateRegistarFacturaPayload(docRC);
    console.log('RC Payload generated successfully.');
    console.log('DocumentType:', payloadRC.documents[0].documentType); // Should be RC
    console.log('Lines present?', !!payloadRC.documents[0].lines); // Should be false or empty
    console.log('PaymentReceipt present?', !!payloadRC.documents[0].paymentReceipt); // Should be true
    console.log('Payments present?', !!payloadRC.documents[0].payment); // Should be true (per recent fix)
  } catch (e) {
    console.error('Error generating RC payload:', e);
  }
}

testPayloads();
