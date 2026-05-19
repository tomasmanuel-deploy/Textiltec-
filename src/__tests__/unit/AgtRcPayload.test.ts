
import AgtService from '../../services/AgtService';
import { documentStore } from '../../lib/documentStore';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../lib/documentStore');
jest.mock('fs');
jest.mock('axios'); // Mock axios to avoid actual HTTP calls

describe('AGT RC Payload Generation', () => {
  let service: AgtService;
  
  const mockConfig = {
    submissionMode: 'online',
    companyNif: '5002821079',
    taxRegistrationNumber: '5002821079',
    agtRestUrl: 'https://test.agt.ao',
    agtUsername: 'user',
    agtPassword: 'pass',
    issuer: {
      seriesBase: 'TEST'
    }
  };

  const mockCompanyJson = JSON.stringify({
    nif: '5002821079',
    authorizedSeries: {
      FT: {
        '2026': 'FT7926S29030N' // Authorized series for FT in 2026
      },
      RC: {
        '2026': 'RC7926S7461C' // Authorized series for RC in 2026
      }
    }
  });

  beforeEach(() => {
    service = new AgtService();
    // Mock getActiveConfig
    jest.spyOn(service, 'getActiveConfig').mockResolvedValue(mockConfig);
    // Mock getSignedSoftwareInfo
    jest.spyOn(service as any, 'getSignedSoftwareInfo').mockResolvedValue({
        softwareInfoDetail: {},
        jwsSoftwareSignature: 'mock-sig'
    });
    // Mock signJws
    jest.spyOn(service as any, 'signJws').mockReturnValue('mock-jws');
    
    // Mock fs for company.json
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(mockCompanyJson);
  });

  test('generateRegistarFacturaPayload correctly resolves originatingON using authorizedSeries', async () => {
    // Arrange
    const rcDoc = {
      id: 'rc-123',
      documentType: 'RC', // Receipt
      status: 'N',
      issueDate: '2026-03-07T10:00:00.000Z',
      series: 'RC', // Local series name
      sequentialNumber: 12,
      seller: { nif: '5002821079', seriesBase: 'TEST' },
      buyer: { nif: '999999999', name: 'Consumer' },
      totals: { total: 171.00, subtotal: 0, vatTotal: 0, grandTotal: 171.00 },
      payment: { method: 'Cash', paidDate: '2026-03-07T10:00:00.000Z' },
      relatedDocuments: ['ft-100']
    };

    const ftDoc = {
      id: 'ft-100',
      documentType: 'FT', // Invoice
      issueDate: '2026-02-01T10:00:00.000Z', // 2026
      series: 'FT', // Local series name
      sequentialNumber: 134,
      seller: { nif: '5002821079' },
      buyer: { nif: '999999999' }
    };

    // Mock documentStore to return the invoice
    (documentStore.getDocument as jest.Mock).mockReturnValue(ftDoc);

    // Act
    const payload = await service.generateRegistarFacturaPayload(rcDoc as any);

    // Assert
    expect(payload).toBeDefined();
    const docPayload = payload.documents[0];
    expect(docPayload.documentType).toBe('RC');
    expect(docPayload.documentNo).toBe('RC RC7926S7461C/0012'); // Should use authorized series for RC

    // Check PaymentReceipt
    expect(docPayload.paymentReceipt).toBeDefined();
    expect(docPayload.paymentReceipt.sourceDocuments).toHaveLength(1);
    
    const sourceDoc = docPayload.paymentReceipt.sourceDocuments[0];
    // This is the CRITICAL check: originatingON should use the AUTHORIZED series for FT, not the local series 'FT'
    expect(sourceDoc.sourceDocumentID.originatingON).toBe('FT FT7926S29030N/0134');
    expect(sourceDoc.debitAmount).toBe('171.00');

    // Check Document Totals
    // The user reported "Valores totais do documento ... 0,00 kz"
    // We need to ensure that even if subtotal/vatTotal are 0 in the source document,
    // the fallback logic populates netTotal/grossTotal correctly.
    expect(docPayload.documentTotals.taxPayable).toBe('0.00');
    expect(docPayload.documentTotals.netTotal).toBe('171.00');
    expect(docPayload.documentTotals.grossTotal).toBe('171.00');
    expect(docPayload.documentTotals.settlementAmount).toBe('171.00');
    expect(docPayload.documentTotals.paymentMechanism).toBeDefined();
  });

  test('generateRegistarFacturaPayload falls back correctly if no authorizedSeries', async () => {
    // Arrange: Mock fs to return empty authorizedSeries
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ authorizedSeries: {} }));

    const rcDoc = {
      id: 'rc-123',
      documentType: 'RC',
      issueDate: '2026-03-07T10:00:00.000Z',
      series: 'RC', 
      sequentialNumber: 12,
      seller: { nif: '5002821079', seriesBase: 'TEST' },
      buyer: { nif: '999999999' },
      totals: { total: 100 },
      relatedDocuments: ['ft-100']
    };

    const ftDoc = {
      id: 'ft-100',
      documentType: 'FT',
      issueDate: '2026-02-01T10:00:00.000Z',
      series: 'FT',
      sequentialNumber: 134
    };

    (documentStore.getDocument as jest.Mock).mockReturnValue(ftDoc);

    // Act
    const payload = await service.generateRegistarFacturaPayload(rcDoc as any);
    const docPayload = payload.documents[0];

    // Assert
    // Should fallback to seriesBase + Year
    const expectedSeries = 'TEST2026'; // seriesBase + Year
    expect(docPayload.documentNo).toBe(`RC ${expectedSeries}/0012`);
    expect(docPayload.paymentReceipt.sourceDocuments[0].sourceDocumentID.originatingON).toBe(`FT ${expectedSeries}/0134`);
  });
});
