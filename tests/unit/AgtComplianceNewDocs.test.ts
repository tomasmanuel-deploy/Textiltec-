
import fs from 'fs';
import path from 'path';
import { IDocument, DocumentType } from '../../src/models/Document';

// Mock process.env.DATA_DIR
const TEST_DATA_DIR = path.join(__dirname, 'test_data_agt_compliance');

// Helper to create test data
const createCompanyJson = (overrides: any = {}) => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  // Create dummy agt_config.json
  if (!fs.existsSync(path.join(TEST_DATA_DIR, 'agt_config.json'))) {
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'agt_config.json'), JSON.stringify({ submissionMode: 'online' }));
  }

  const defaultCompany = {
    authorizedSeries: {}
  };
  const finalCompany = { ...defaultCompany, ...overrides };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'company.json'), JSON.stringify(finalCompany, null, 2));
};

describe('AGT Compliance for New Document Types', () => {
  let AgtServiceClass: any;
  let agtService: any;
  let SignatureServiceClass: any;

  beforeAll(() => {
    process.env.DATA_DIR = TEST_DATA_DIR;
    
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    
    // Dynamic import
    const agtModule = require('../../src/services/AgtService');
    AgtServiceClass = agtModule.default;
    agtService = new AgtServiceClass();

    const sigModule = require('../../src/services/SignatureService');
    SignatureServiceClass = sigModule.default;
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  // Test Cases for Document Number Generation
  const testCases = [
    { type: DocumentType.GENERIC_INVOICE, code: 'GF', name: 'Factura Genérica' },
    { type: DocumentType.GLOBAL_INVOICE, code: 'FG', name: 'Factura Global' },
    { type: DocumentType.ADVANCE_INVOICE, code: 'FA', name: 'Factura de Adiantamento' },
    { type: DocumentType.PAYMENT_NOTICE_RECEIPT, code: 'AR', name: 'Aviso de Cobrança/Recibo' },
    { type: DocumentType.REVERSAL_RECEIPT, code: 'RE', name: 'Recibo de Estorno' },
    { type: DocumentType.SELF_BILLING_INVOICE_RECEIPT, code: 'AF', name: 'Autofacturação' }, // Should be AF now
    { type: DocumentType.AVISO_COBRANCA, code: 'AC', name: 'Aviso de Cobrança' },
    { type: DocumentType.OTHER_RECEIPT, code: 'RG', name: 'Outros Recibos' },
  ];

  testCases.forEach(({ type, code, name }) => {
    it(`should generate correct AGT Document Number for ${name} (${code})`, async () => {
      // Setup authorized series
      const seriesKey = code;
      const seriesValue = `${code}2024S1`;
      
      createCompanyJson({
        authorizedSeries: {
          [seriesKey]: {
            '2024': seriesValue
          }
        }
      });

      const doc: Partial<IDocument> = {
        documentType: type,
        issueDate: new Date('2024-03-09'),
        series: code,
        sequentialNumber: 123,
        seller: { seriesBase: 'XVE' } as any,
        selfBillingIndicator: code === 'AF' ? 1 : 0
      };

      const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
      
      // Expected format: CODE SERIES/NUMBER (padded to 4 digits usually, but logic depends on implementation)
      // The implementation usually pads to 4 digits: /0123
      expect(docNo).toBe(`${code} ${seriesValue}/0123`);
    });
  });

  // Test Payload Generation (InvoiceType and Hash input)
  testCases.forEach(({ type, code, name }) => {
    it(`should generate correct InvoiceType in Payload for ${name} (${code})`, async () => {
      // Setup authorized series
      const seriesKey = code;
      const seriesValue = `${code}2024S1`;
      createCompanyJson({
        authorizedSeries: {
          [seriesKey]: { '2024': seriesValue }
        }
      });

      const doc: Partial<IDocument> = {
        uuid: 'test-uuid',
        documentType: type,
        issueDate: new Date('2024-03-09'),
        taxableDate: new Date('2024-03-09'),
        series: code,
        sequentialNumber: 123,
        seller: { seriesBase: 'XVE', nif: '5417000000' } as any,
        buyer: { nif: '5417000001', name: 'Buyer' } as any,
        lines: [
          { sku: 'SKU1', description: 'Item 1', quantity: 1, unit: 'Un', unitPrice: 100, discount: 0, vatRate: 14, lineTotal: 100 }
        ],
        totals: {
          taxableBase: 100, vatBreakdown: [{ rate: 14, base: 100, amount: 14 }], subtotal: 100, discountTotal: 0, rounding: 0, grandTotal: 114, currency: 'AOA'
        },
        payment: { method: 'cash', status: 'pending' },
        status: 'issued',
        selfBillingIndicator: code === 'AF' ? 1 : 0,
        createdAt: new Date('2024-03-09')
      };

      const payload = await agtService.generateRegistarFacturaPayload(doc as IDocument);
      const d = payload.documents[0];
      
      // Verify DocumentType in payload
      // For AF, the payload type should be AF or FR depending on implementation, but we changed it to AF.
      // For others, it should match the code.
      expect(d.documentType).toBe(code);

      // Verify DocumentNumber format in payload
      expect(d.documentNo).toBe(`${code} ${seriesValue}/0123`);
      
      // Verify Hash exists (implies signature service worked)
      expect(d.hash).toBeDefined();
      expect(d.hash.length).toBeGreaterThan(10);
    });
  });

  it('should treat AC as Invoice-like (has lines)', async () => {
    // Mock company series for AC
    createCompanyJson({
      taxRegistrationNumber: '5417055555',
      authorizedSeries: {
        'AC': { '2024': 'AC2024' }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.AVISO_COBRANCA,
      issueDate: new Date('2024-03-09'),
      series: 'AC', // Should match series in company.json
      sequentialNumber: 1,
      seller: { nif: '5417055555' } as any,
      buyer: { nif: '999999999' } as any,
      lines: [
        { sku: '1', description: 'Item A', quantity: 1, unitPrice: 100, vatRate: 14, total: 100 } as any
      ],
      totals: {
        grandTotal: 114,
        netTotal: 100,
        taxTotal: 14
      } as any
    };

    const payload = await agtService.generateRegistarFacturaPayload(doc as IDocument);
    const d = payload.documents[0];

    // AC should be treated as Invoice (SourceDocuments/SalesInvoices)
    // It should have lines and NO paymentReceipt
    expect(d.lines).toBeDefined();
    expect(d.lines.length).toBe(1);
    expect(d.paymentReceipt).toBeUndefined();
    // Validate mapping
    expect(agtService.mapDocumentTypeToAgt(DocumentType.AVISO_COBRANCA)).toBe('AC');
  });

  it('should handle Autofacturação (AF) correctly', async () => {
     // Mock company series for AF
     createCompanyJson({
      taxRegistrationNumber: '5417055555',
      authorizedSeries: {
        'AF': { '2024': 'AF2024' }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.SELF_BILLING_INVOICE_RECEIPT,
      issueDate: new Date('2024-03-09'),
      series: 'AF',
      sequentialNumber: 10,
      seller: { nif: '5417055555' } as any,
      buyer: { nif: '999999999' } as any,
      lines: [
        { sku: 'SB1', description: 'Self Bill Item', quantity: 1, unitPrice: 500, vatRate: 14, total: 500 } as any
      ],
      totals: {
        grandTotal: 570,
        netTotal: 500,
        taxTotal: 70
      } as any
    };

    const payload = await agtService.generateRegistarFacturaPayload(doc as IDocument);
    const d = payload.documents[0];

    // AF maps to 'AF' code in our system (which maps to correct SAFT structure internally)
    // In strict SAFT 1.01_01, AF usually goes to SalesInvoices with SelfBillingIndicator = 1
    // The internal mapDocumentTypeToAgt should return 'AF'
    expect(agtService.mapDocumentTypeToAgt(DocumentType.SELF_BILLING_INVOICE_RECEIPT)).toBe('AF');
    
    // Check payload structure
    expect(d.lines).toBeDefined();
  });

});
