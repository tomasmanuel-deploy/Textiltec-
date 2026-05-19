
import { AgtService } from '../../src/services/AgtService';
import { DocumentType } from '../../src/models/Document';
import fs from 'fs';

// Mock dependencies
jest.mock('../../src/lib/dataPaths', () => ({
  resolveDataPath: (p: string) => `/tmp/${p}`,
  companyJsonPath: () => '/tmp/company.json',
  licenseJsonPath: () => '/tmp/license.json',
  systemJsonPath: () => '/tmp/system.json',
}));

jest.mock('../../src/lib/documentStore', () => ({
  documentStore: {
    getDocument: jest.fn(),
  }
}));

// Mock FS for company.json
jest.mock('fs');

describe('AGT AC Payload Compliance', () => {
  let service: AgtService;
  const { documentStore } = require('../../src/lib/documentStore');

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    service = new AgtService();
    
    // Mock internal methods
    (service as any).getActiveConfig = async () => ({
      submissionMode: 'online',
      companyNif: '5417098765'
    });
    (service as any).getCompanyInfo = async () => ({ 
      nif: '5417098765', name: 'Test Company', address: 'Luanda' 
    });
    (service as any).getSignedSoftwareInfo = async () => ({
        certId: 'cert-123',
        version: '1.0.0',
        hash: 'hash'
    });
    (service as any).signJws = () => 'mock_signature';
    (service as any).generateSubmissionUUID = () => 'uuid-123';

    // Mock FS
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
      taxRegistrationNumber: '5417098765',
      companyName: 'Test Company',
      authorizedSeries: {
        FT: { '2025': 'FT2025' }, 
        RG: { '2025': 'RG2025' }
      }
    }));
  });

  test('Aviso de Cobranca (AC) should map to AC and include lines (no paymentReceipt)', async () => {
    // 1. Setup the Referenced Invoice (FT)
    const ftDoc = {
      id: 'ft1',
      documentType: 'factura',
      series: '2025',
      sequentialNumber: 123,
      issueDate: '2025-03-08T10:00:00Z',
      totals: { total: 5000, subtotal: 5000, vatTotal: 0 }
    };
    documentStore.getDocument.mockImplementation((id: string) => {
      if (id === 'ft1') return ftDoc;
      return null;
    });

    // 2. Setup the Aviso de Cobranca (AC)
    const acDoc = {
      id: 'ac1',
      documentType: 'aviso_cobranca',
      series: '2025',
      sequentialNumber: 1,
      issueDate: '2025-03-08T12:00:00Z',
      createdAt: '2025-03-08T12:00:00Z',
      status: 'N',
      seller: { nif: '5417098765', name: 'Seller' },
      buyer: { nif: '999999999', name: 'Buyer' },
      totals: { total: 5000, subtotal: 5000, vatTotal: 0 },
      relatedDocuments: ['ft1'], // References FT
      payment: {
        method: 'NU',
        amount: 5000,
        paidDate: '2025-03-08T12:00:00Z'
      }
    };

    // 3. Generate Payload
    const payload = await service.generateRegistarFacturaPayload(acDoc as any);
    const docPayload = payload.documents[0];

    expect(docPayload.invoiceType).toBe('AC');
    expect(docPayload.documentType).toBe('AC');
    expect(docPayload.paymentReceipt).toBeUndefined();
    expect(docPayload.lines).toBeDefined();
  });
});
