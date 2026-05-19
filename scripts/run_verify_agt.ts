
import { AgtService } from '../src/services/AgtService';
import fs from 'fs';
import path from 'path';

// Mock config if needed
const mockConfig = {
  submissionMode: 'online',
  companyNif: '5417012345',
  testMode: true
};

async function run() {
  console.log('Starting AGT Verification...');
  
  // Mock AgtService methods to avoid database calls or complex config loading
  const agtService = new AgtService();
  
  // We need to ensure getActiveConfig returns something valid
  agtService.getActiveConfig = async () => mockConfig;
  (agtService as any).getCompanyInfo = async () => ({ nif: '5417012345', name: 'Test Company' });
  (agtService as any).getSignedSoftwareInfo = async () => ({
      softwareInfoDetail: { productId: 'Test', productVersion: '1.0', softwareValidationNumber: '0' },
      jwsSoftwareSignature: 'mock-sig'
  });
  // Mock private key reading
  (agtService as any).getPrivateKey = () => {
      // Return a dummy PEM key for testing
      return `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDZ...
-----END PRIVATE KEY-----`; 
  };
  (agtService as any).signJws = () => 'mock-jws-signature';

  const results: any[] = [];

  const testCases = [
    { type: 'factura_generica', expected: 'FT', isReceipt: false },
    { type: 'factura_global', expected: 'FT', isReceipt: false },
    { type: 'factura_adiantamento', expected: 'FT', isReceipt: false },
    { type: 'factura_recibo_autofacturacao', expected: 'FR', isReceipt: false, selfBilling: 1 },
    { type: 'recibo_estorno', expected: 'RE', isReceipt: true },
    { type: 'aviso_cobranca_recibo', expected: 'RC', isReceipt: true },
    { type: 'outros_recibos', expected: 'RG', isReceipt: true },
    { type: 'aviso_cobranca', expected: 'AC', isReceipt: false },
  ];

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
        selfBillingIndicator: test.selfBilling ? 1 : 0
      };

      // Special handling for receipt types (need payment info)
      if (test.isReceipt) {
          doc.payment = { method: 'cash', paidDate: doc.issueDate, paidAmount: 1140, status: 'paid' };
      }

      // Add related document for RE (required for reference)
      if (test.type === 'recibo_estorno') {
          doc.relatedDocuments = ['ORIGIN-RC-1'];
          doc.referenceInvoiceNo = 'RC TEST/1';
      }

      try {
        // We use generateRegistarFacturaPayload
        // Note: generateRegistarFacturaPayload calls mapDocumentTypeToAgt internally
        const result = await agtService.generateRegistarFacturaPayload(doc);
        const payload = result.documents[0];
        
        // Check if lines are present
        const hasLines = payload.lines && payload.lines.length > 0;
        const hasPaymentReceipt = !!payload.paymentReceipt;
        
        let expectedAgtType = test.expected;
        if (test.selfBilling) expectedAgtType = 'AF';

        const passed = payload.documentType === expectedAgtType;
        
        console.log(`Test: ${test.type} -> Expected: ${expectedAgtType}, Got: ${payload.documentType}`);
        console.log(`   Has Lines: ${hasLines}, Has PaymentReceipt: ${hasPaymentReceipt}`);
        
        if (!passed) console.error(`   FAILED: Type mismatch`);
        
        // Check structure rules
        if (expectedAgtType === 'RE' || expectedAgtType === 'RC' || expectedAgtType === 'RG' || expectedAgtType === 'AR') {
             if (hasLines) console.error(`   FAILED: Receipt type ${expectedAgtType} should NOT have lines`);
             if (!hasPaymentReceipt) console.error(`   FAILED: Receipt type ${expectedAgtType} MUST have paymentReceipt`);
        } else {
             if (!hasLines) console.error(`   FAILED: Invoice type ${expectedAgtType} MUST have lines`);
             if (hasPaymentReceipt) console.error(`   FAILED: Invoice type ${expectedAgtType} should NOT have paymentReceipt`);
        }

      } catch (e: any) {
        console.error(`Error processing ${test.type}:`, e.message);
      }
  }
}

run().catch(console.error);
