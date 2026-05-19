import fs from 'fs';
import path from 'path';
import { IDocument, DocumentType } from '../../src/models/Document';

const TEST_DATA_DIR = path.join(__dirname, 'test_data_agt_payloads');

const writeJson = (p: string, data: any) => {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
};

const setupEnv = () => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  process.env.DATA_DIR = TEST_DATA_DIR;
  writeJson(path.join(TEST_DATA_DIR, 'agt_config.json'), {
    submissionMode: 'online',
    saftProductId: 'Prakash Software',
    saftProductVersion: '1.0.6',
    saftSoftwareValidationNumber: '0'
  });
};

const setAuthorizedSeries = (map: Record<string, Record<string, string>>) => {
  writeJson(path.join(TEST_DATA_DIR, 'company.json'), {
    authorizedSeries: map,
    name: 'Test Co',
    nif: '5000000000'
  });
};

const makeParty = (name: string, nif: string) => ({
  name,
  address: 'Luanda',
  nif
});

describe('AGT Payload for new document types', () => {
  let AgtServiceClass: any;
  let agtService: any;

  beforeAll(() => {
    setupEnv();
    const serviceModule = require('../../src/services/AgtService');
    AgtServiceClass = serviceModule.AgtService;
    agtService = new AgtServiceClass();
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('PP uses authorized series and includes lines (non-receipt)', async () => {
    setAuthorizedSeries({
      PP: { '2024': 'PP7926S29030N' }
    });
    const doc = {
      uuid: 'pp-uuid',
      series: 'PP',
      sequentialNumber: 10,
      documentType: DocumentType.PROFORMA,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [
        { sku: 'SKU1', description: 'Item 1', quantity: 2, unit: 'Un', unitPrice: 100, discount: 0, vatRate: 14, lineTotal: 200 }
      ],
      totals: {
        taxableBase: 200, vatBreakdown: [{ rate: 14, base: 200, amount: 28 }],
        subtotal: 200, discountTotal: 0, rounding: 0, grandTotal: 228, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'pending' },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('PP');
    expect(d.documentNo).toBe('PP PP7926S29030N/0010');
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.paymentReceipt).toBeUndefined();
  });

  it('GR uses authorized series and includes lines (non-receipt)', async () => {
    setAuthorizedSeries({
      GR: { '2024': 'GR7926S29030N' }
    });
    const doc = {
      uuid: 'gr-uuid',
      series: 'GR',
      sequentialNumber: 50,
      documentType: DocumentType.DELIVERY_NOTE,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [
        { sku: 'SKU1', description: 'Item 1', quantity: 1, unit: 'Un', unitPrice: 100, discount: 0, vatRate: 0, lineTotal: 100 }
      ],
      totals: {
        taxableBase: 100, vatBreakdown: [{ rate: 0, base: 100, amount: 0 }],
        subtotal: 100, discountTotal: 0, rounding: 0, grandTotal: 100, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'pending' },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('GR');
    expect(d.documentNo).toBe('GR GR7926S29030N/0050');
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.paymentReceipt).toBeUndefined();
  });

  it('RG behaves as receipt: no lines, paymentReceipt present with debitAmount', async () => {
    setAuthorizedSeries({
      RG: { '2024': 'RG7926S29030N' }
    });
    const doc = {
      uuid: 'rg-uuid',
      series: 'RG',
      sequentialNumber: 7,
      documentType: DocumentType.OTHER_RECEIPT,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [],
      totals: {
        taxableBase: 0, vatBreakdown: [], subtotal: 0, discountTotal: 0, rounding: 0, grandTotal: 500, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'paid', paidAmount: 500, paidDate: new Date('2024-03-09') },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('RG');
    expect(d.documentNo).toBe('RG RG7926S29030N/0007');
    expect(d.lines).toBeUndefined();
    expect(d.paymentReceipt).toBeDefined();
    const entry = d.paymentReceipt.sourceDocuments?.[0];
    expect(entry.debitAmount).toBeDefined();
  });

  it('RE behaves as reversal document: includes lines and no paymentReceipt', async () => {
    setAuthorizedSeries({
      RE: { '2024': 'RE7926S29030N' }
    });
    const doc = {
      uuid: 're-uuid',
      series: 'RE',
      sequentialNumber: 3,
      documentType: DocumentType.REVERSAL_RECEIPT,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [
        { sku: 'ESTORNO', description: 'Estorno', quantity: 1, unit: 'Un', unitPrice: 250, discount: 0, vatRate: 0, vatExemptionReason: 'M04', lineTotal: 250 }
      ],
      totals: {
        taxableBase: 0, vatBreakdown: [], subtotal: 0, discountTotal: 0, rounding: 0, grandTotal: 250, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'paid', paidAmount: 250, paidDate: new Date('2024-03-09') },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('RE');
    expect(d.documentNo).toBe('RE RE7926S29030N/0003');
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.paymentReceipt).toBeUndefined();
  });

  it('OR uses authorized series and includes lines (non-receipt)', async () => {
    setAuthorizedSeries({
      OR: { '2024': 'OR7926S29030N' }
    });
    const doc = {
      uuid: 'or-uuid',
      series: 'OR',
      sequentialNumber: 21,
      documentType: DocumentType.QUOTE,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [
        { sku: 'SKU2', description: 'Item 2', quantity: 3, unit: 'Un', unitPrice: 50, discount: 0, vatRate: 14, lineTotal: 150 }
      ],
      totals: {
        taxableBase: 150, vatBreakdown: [{ rate: 14, base: 150, amount: 21 }],
        subtotal: 150, discountTotal: 0, rounding: 0, grandTotal: 171, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'pending' },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('OR');
    expect(d.documentNo).toBe('OR OR7926S29030N/0021');
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.paymentReceipt).toBeUndefined();
  });

  it('AC (Aviso de Cobrança) maps to AC and behaves like invoice (has lines, no paymentReceipt)', async () => {
    setAuthorizedSeries({
      AC: { '2024': 'AC7926S29030N' }
    });
    const doc = {
      uuid: 'ac-uuid',
      series: 'AC',
      sequentialNumber: 135,
      documentType: DocumentType.AVISO_COBRANCA,
      issueDate: new Date('2024-03-09'),
      taxableDate: new Date('2024-03-09'),
      seller: makeParty('Seller SA', '5000000000'),
      buyer: makeParty('Buyer LDA', '5417098765'),
      lines: [
        { sku: 'SKU1', description: 'Item 1', quantity: 1, unit: 'Un', unitPrice: 100, discount: 0, vatRate: 14, lineTotal: 100 }
      ],
      totals: {
        taxableBase: 100, vatBreakdown: [{ rate: 14, base: 100, amount: 14 }], subtotal: 100, discountTotal: 0, rounding: 0, grandTotal: 114, currency: 'AOA'
      },
      payment: { method: 'cash', status: 'pending' },
      status: 'issued',
      agtSubmission: { status: 'draft' },
      auditLog: [],
      createdAt: new Date('2024-03-09'),
      updatedAt: new Date('2024-03-09')
    } as unknown as IDocument;

    const payload = await agtService.generateRegistarFacturaPayload(doc);
    const d = payload.documents[0];
    expect(d.documentType).toBe('AC');
    expect(d.documentNo).toBe('AC AC7926S29030N/0135');
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.lines.length).toBe(1);
    expect(d.paymentReceipt).toBeUndefined();
  });
});
