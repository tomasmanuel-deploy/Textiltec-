import AgtService from '../../services/AgtService';
import axios from 'axios';
import { CentralLogService } from '../../services/CentralLogService';

// Mock mongoose and models BEFORE imports
jest.mock('mongoose', () => ({
  Schema: class {},
  model: jest.fn(),
  Document: class {},
  connect: jest.fn(),
  disconnect: jest.fn()
}));
jest.mock('../../models/Document', () => ({
  Document: {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn()
  }
}));

// Mock dependencies
jest.mock('axios');
jest.mock('../../services/CentralLogService');
jest.mock('fs');
jest.mock('child_process', () => ({
  execFileSync: jest.fn(() => { throw new Error('Mock Curl Error'); })
}));
jest.mock('crypto', () => ({
  createSign: () => ({
    update: jest.fn(),
    end: jest.fn(),
    sign: jest.fn().mockReturnValue('mock-signature')
  }),
  createHash: () => ({
    update: jest.fn(),
    digest: jest.fn().mockReturnValue('mock-hash')
  }),
  createPrivateKey: jest.fn(),
  constants: {
    SSL_OP_LEGACY_SERVER_CONNECT: 0
  }
}));

describe('AgtService Integration - Retry Logic', () => {
  let service: AgtService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgtService();
    
    // Mock getActiveConfig to avoid real config loading
    jest.spyOn(service as any, 'getActiveConfig').mockResolvedValue({
      agtRestUrl: 'https://test.agt.gov.ao',
      timeout: 1000,
      allowMock: false
    });
  });

  test('should retry 3 times on network failure and log error', async () => {
    // Simulate network error for all attempts
    const networkError = new Error('Network Error');
    (axios.post as jest.Mock).mockRejectedValue(networkError);

    // Call validate (which calls submitRestRequest internally for online mode)
    // We use a mock document that triggers 'registarFactura'
    const mockDoc = {
      invoiceNo: 'FT 2025/1',
      customerName: 'Test Customer',
      customerTaxID: '999999999',
      issueDate: new Date(),
      dueDate: new Date(),
      lines: [{ description: 'Item 1', quantity: 1, unitPrice: 100, tax: { code: 'NOR', percentage: 14 } }],
      totals: { total: 100, tax: 14, grandTotal: 114 },
      payment: { method: 'cash', amount: 114, paidDate: new Date() }
    };

    // We need to bypass the payload generation logic which might fail if dependencies are missing
    // So we'll spy on generateRegistarFacturaPayload
    jest.spyOn(service, 'generateRegistarFacturaPayload').mockResolvedValue({
      documents: [{
        invoiceNo: 'FT 2025/1',
        documentType: 'FT',
        // minimal required fields
        documentStatus: {
          documentStatus: 'N',
          documentStatusDate: new Date().toISOString(),
          sourceID: 'Source',
          sourceBilling: 'P'
        },
        customer: {
          customerTaxID: '999999999',
          companyName: 'Test Customer',
          billingAddress: {
             addressDetail: 'Test Address',
             city: 'Luanda',
             country: 'AO'
          },
          selfBillingIndicator: 0
        }
      }]
    } as any);

    // Force online mode
    (service as any).isOnline = true;

    // Execute
    try {
      await service.submitRestRequest('registarFactura', { documents: [{ invoiceNo: 'FT 2025/1' }] });
    } catch (e) {
      // Expected to fail after retries
    }

    // Verify
    expect(axios.post).toHaveBeenCalledTimes(3);
    expect(CentralLogService.logSubmission).toHaveBeenCalledWith(
      'FT 2025/1',
      'failure',
      expect.objectContaining({
        error: expect.stringContaining('Network Error')
      })
    );
  });

  test('should succeed after 2 failures and 1 success', async () => {
    const networkError = new Error('Network Error');
    const successResponse = { data: { resultCode: 1, requestID: 'REQ-123' } };

    (axios.post as jest.Mock)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(successResponse);

    const result = await service.submitRestRequest('registarFactura', { documents: [{ invoiceNo: 'FT 2025/2' }] });

    expect(result).toEqual(successResponse.data);
    expect(axios.post).toHaveBeenCalledTimes(3);
  });
});
