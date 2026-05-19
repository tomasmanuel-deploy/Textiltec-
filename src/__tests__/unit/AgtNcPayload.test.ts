import AgtService from '../../services/AgtService';
import { documentStore } from '../../lib/documentStore';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../lib/documentStore');
jest.mock('fs');
jest.mock('axios');

describe('AGT NC Payload Generation', () => {
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
      NC: {
        '2026': 'NC7926S16403C'
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

  test('generateRegistarFacturaPayload for NC handles negative quantity correctly', async () => {
    // Arrange: Create an NC document with negative quantity line (typical internal representation)
    const ncDoc = {
      id: 'nc-121',
      documentType: 'NC', // Credit Note
      status: 'N',
      issueDate: '2026-03-07T21:33:37.000Z',
      series: 'NC', // Local series name
      sequentialNumber: 121,
      seller: { nif: '5002821079', seriesBase: 'TEST' },
      buyer: { nif: '999999999', name: 'Consumer' },
      lines: [
        {
          sku: 'PROD001',
          description: 'Produto Devolvido',
          quantity: -3.00, // Negative quantity as reported in error
          unitPrice: 100,
          vatRate: 14,
          total: -300
        }
      ],
      totals: { total: -342, subtotal: -300, vatTotal: -42, grandTotal: -342 },
      relatedDocuments: ['ft-100']
    };

    const ftDoc = {
      id: 'ft-100',
      documentType: 'FT',
      issueDate: '2026-02-01T10:00:00.000Z',
      series: 'FT',
      sequentialNumber: 100,
      seller: { nif: '5002821079' },
      buyer: { nif: '999999999' }
    };

    // Mock documentStore to return the invoice
    (documentStore.getDocument as jest.Mock).mockReturnValue(ftDoc);

    // Act
    const payload = await service.generateRegistarFacturaPayload(ncDoc as any);

    // Assert
    expect(payload).toBeDefined();
    const docPayload = payload.documents[0];
    
    // Check Document Header
    expect(docPayload.documentType).toBe('NC');
    expect(docPayload.documentNo).toBe('NC NC7926S16403C/0121'); // Should use authorized series

    // Check Lines
    expect(docPayload.lines).toHaveLength(1);
    const line = docPayload.lines[0];
    
    // CRITICAL CHECK: Quantity must be positive ("3.00") not negative ("-3.00")
    expect(line.quantity).toBe('3.00');
    expect(Number(line.quantity)).toBeGreaterThan(0);
    
    // Check Amounts
    // NC should ALWAYS use DebitAmount (Reversal), regardless of whether input is positive or negative
    // Logic: 
    // - Input Quantity -3 -> lineNet -300 -> DebitAmount 300
    // - Input Quantity 3  -> lineNet 300  -> DebitAmount 300
    expect(line.debitAmount).toBeDefined();
    expect(line.debitAmount).toBe('300.00');
    expect(line.creditAmount).toBeUndefined();

    // Check Document Totals
    // Totals must be positive strings (absolute values)
    expect(docPayload.documentTotals).toBeDefined();
    expect(docPayload.documentTotals.taxPayable).toBe('42.00'); // Math.abs(-42)
    expect(docPayload.documentTotals.netTotal).toBe('300.00');  // Math.abs(-300)
    expect(docPayload.documentTotals.grossTotal).toBe('342.00'); // Math.abs(-342)

    // Check Billing References
    expect(docPayload.billingReference).toBeDefined();
    expect(docPayload.billingReference).toHaveLength(1);
    expect(docPayload.billingReference[0].invoiceDocument.invoiceNo).toBe('FT TEST2026/0100'); // Fallback series TEST + Year

    // Check Line References (Mandatory for value processing in AGT)
    expect(line.referenceInfo).toBeDefined();
    expect(line.referenceInfo.reference).toBe('FT TEST2026/0100');
    expect(line.referenceInfo.reason).toBe('Devolução');
  });
});
