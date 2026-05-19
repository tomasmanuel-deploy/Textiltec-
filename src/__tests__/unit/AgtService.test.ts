import { AgtService } from '../../services/AgtService';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { CentralLogService } from '../../services/CentralLogService';

// Mock dependencies
jest.mock('../../services/CentralLogService');
jest.mock('fs');
jest.mock('axios');
jest.mock('child_process', () => ({
  execFileSync: jest.fn(() => { throw new Error('Mock Curl Error'); })
}));
jest.mock('crypto', () => {
    return {
        ...jest.requireActual('crypto'),
        createSign: jest.fn(() => ({
            update: jest.fn(),
            end: jest.fn(),
            sign: jest.fn(() => 'mock_signature')
        })),
        createPrivateKey: jest.fn(() => ({
             asymmetricKeyDetails: { modulusLength: 2048 }
        }))
    };
});

jest.mock('mongoose', () => {
  class MockSchema {
    methods = {};
    index = jest.fn();
    pre = jest.fn();
    post = jest.fn();
    add = jest.fn();
    set = jest.fn();
    virtual = jest.fn(() => ({ get: jest.fn(), set: jest.fn() }));
    
    static Types = {
      ObjectId: 'ObjectId',
      String: 'String',
      Number: 'Number',
      Boolean: 'Boolean',
      Date: 'Date',
      Mixed: 'Mixed'
    };
  }
  
  return {
    Schema: MockSchema,
    model: jest.fn(),
    models: {},
    connect: jest.fn(),
    connection: { on: jest.fn(), once: jest.fn() },
    Types: { ObjectId: class {} }
  };
});

// Mock Data Paths
jest.mock('../../lib/dataPaths', () => ({
  companyJsonPath: () => '/mock/company.json',
  resolveDataPath: (p: string) => `/mock/${p}`
}));

describe('AgtService', () => {
  let service: AgtService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgtService();
    
    // Mock fs.existsSync to return true for keys
    (fs.existsSync as jest.Mock).mockImplementation((p) => {
        if (p.includes('private.pem')) return true;
        if (p.includes('company.json')) return true;
        if (p.includes('agt_config.json')) return true;
        return false;
    });

    // Mock fs.readFileSync
    (fs.readFileSync as jest.Mock).mockImplementation((p) => {
        if (p.includes('private.pem')) {
            return '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQMCcCQ...\n-----END PRIVATE KEY-----';
        }
        if (p.includes('company.json')) {
            return JSON.stringify({
                authorizedSeries: {
                    FT: { '2025': 'FT2025' }
                },
                saftProductId: 'TestProduct',
                saftProductVersion: '1.0.0'
            });
        }
        if (p.includes('agt_config.json')) {
            return JSON.stringify({
                apiUrl: 'https://test.agt.gov.ao',
                active: true
            });
        }
        return '';
    });
  });

  const createMockDoc = (type: string, lines = true) => ({
      documentType: type,
      documentNo: `${type.toUpperCase()} 2025/1`,
      documentDate: new Date(),
      issueDate: new Date(),
      seller: {
          nif: '500000000',
          name: 'Seller Inc',
          address: 'Luanda'
      },
      buyer: {
          nif: '999999999',
          name: 'Consumer',
          address: 'Luanda'
      },
      lines: lines ? [
          {
              sku: 'ITEM1',
              description: 'Item 1',
              quantity: 1,
              unitPrice: 100,
              vatRate: 14,
              discount: 0
          }
      ] : [],
      documentTotals: {
          netTotal: 100,
          taxPayable: 14,
          grossTotal: 114
      },
      totals: {
          grandTotal: 114,
          total: 114
      }
  });

  test('generateRegistarFacturaPayload for FT (Invoice)', async () => {
      const doc = createMockDoc('factura');
      const payload = await service.generateRegistarFacturaPayload(doc);
      
      const documentData = payload.documents[0];
      expect(documentData.documentType).toBe('FT');
      expect(documentData.lines).toHaveLength(1);
      expect(documentData.lines[0].creditAmount).toBe("100.00");
      expect(documentData.lines[0].debitAmount).toBeUndefined();
  });

  test('generateRegistarFacturaPayload for NC (Credit Note)', async () => {
      const doc = createMockDoc('nota_de_credito');
      const payload = await service.generateRegistarFacturaPayload(doc);
      
      const documentData = payload.documents[0];
      expect(documentData.documentType).toBe('NC');
      expect(documentData.lines).toHaveLength(1);
      // NC uses debitAmount according to implementation
      expect(documentData.lines[0].debitAmount).toBe("100.00");
      expect(documentData.lines[0].creditAmount).toBeUndefined();
  });

  test('generateRegistarFacturaPayload for ND (Debit Note)', async () => {
      const doc = createMockDoc('nota_de_debito');
      const payload = await service.generateRegistarFacturaPayload(doc);
      
      const documentData = payload.documents[0];
      expect(documentData.documentType).toBe('ND');
      // ND uses creditAmount according to implementation
      expect(documentData.lines[0].creditAmount).toBe("100.00");
      expect(documentData.lines[0].debitAmount).toBeUndefined();
  });

  test('generateRegistarFacturaPayload for RC (Receipt)', async () => {
      const doc = createMockDoc('recibo', false);
      // Receipts usually have payment details
      (doc as any).payment = {
          amount: 114,
          method: 'cash',
          paidDate: new Date()
      };
      // Receipts usually have related documents (invoices being paid)
      (doc as any).relatedDocuments = ['FT 2025/1'];
      
      const payload = await service.generateRegistarFacturaPayload(doc);
      
      const documentData = payload.documents[0];
      expect(documentData.documentType).toBe('RC');
      // RC should NOT have lines
      expect(documentData.lines).toBeUndefined();
      // It should have paymentReceipt
      expect(documentData.paymentReceipt).toBeDefined();
      expect(documentData.paymentReceipt.sourceDocuments).toHaveLength(1);
      // It MUST have payment array (fix for AGT showing 0)
      expect(documentData.payment).toBeDefined();
      expect(documentData.payment).toHaveLength(1);
      expect(documentData.payment[0].paymentMechanism).toBe('NU');
      expect(documentData.payment[0].paymentAmount).toBe('114.00');
  });

  test('submitRestRequest retries 3 times on failure', async () => {
      // Mock getActiveConfig
      jest.spyOn(service, 'getActiveConfig').mockResolvedValue({
        agtRestUrl: 'https://test.agt.gov.ao',
        timeout: 1000
      });
      
      // Mock axios to fail
      const error = new Error('Network Error');
      (axios.post as jest.Mock).mockRejectedValue(error);
      
      // Call submitRestRequest and expect it to fail
      await expect(service.submitRestRequest('registarFactura', { documents: [{ invoiceNo: 'FT 2025/1' }] }))
        .rejects.toThrow('Network Error');
      
      // Verify 3 attempts
      expect(axios.post).toHaveBeenCalledTimes(3);
      
      // Verify error logging
      expect(CentralLogService.logSubmission).toHaveBeenCalledWith(
          'FT 2025/1',
          'failure',
          expect.any(Object)
      );
  }, 15000);

  test('submitRestRequest succeeds after retries', async () => {
      // Mock getActiveConfig
      jest.spyOn(service, 'getActiveConfig').mockResolvedValue({
        agtRestUrl: 'https://test.agt.gov.ao',
        timeout: 1000
      });
      
      // Mock axios to fail twice then succeed
      const error = new Error('Network Error');
      (axios.post as jest.Mock)
          .mockRejectedValueOnce(error)
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce({ data: { resultCode: 1 } });
      
      // Call submitRestRequest
      const result = await service.submitRestRequest('registarFactura', { documents: [{ invoiceNo: 'FT 2025/1' }] });
      
      // Verify 3 attempts
      expect(axios.post).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ resultCode: 1 });
      
      // Verify success logging
      expect(CentralLogService.logSubmission).toHaveBeenCalledWith(
          'FT 2025/1',
          'success',
          expect.any(Object)
      );
  });

});
