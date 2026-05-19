
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/agt/sync-offline';
import { documentStore } from '../../lib/documentStore';
import AgtService from '../../services/AgtService';
import agtAuditService from '../../services/AgtAuditService';

// Mock dependencies
jest.mock('../../lib/documentStore');
jest.mock('../../services/AgtService');
jest.mock('../../services/AgtAuditService');

describe('Offline Sync API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes offline pending documents successfully', async () => {
    // Arrange: Mock pending documents
    const mockPendingDocs = [
      {
        id: 'doc1',
        documentType: 'factura',
        agtSubmission: { status: 'offline_pending', mode: 'offline' }
      },
      {
        id: 'doc2',
        documentType: 'recibo',
        agtSubmission: { status: 'offline_pending', mode: 'offline' }
      }
    ];

    (documentStore.getAllDocuments as jest.Mock).mockReturnValue(mockPendingDocs);
    (documentStore.getDocument as jest.Mock).mockImplementation((id) => mockPendingDocs.find(d => d.id === id));

    // Mock AgtService
    const mockRegistarFactura = jest.fn().mockResolvedValue({
      resultCode: 1,
      requestID: 'REQ-123',
      message: 'Success'
    });
    
    const mockObterEstado = jest.fn().mockResolvedValue({
      resultCode: 1,
      documentStatusList: [{ documentStatus: 'REGISTRADO' }]
    });

    const mockGetActiveConfig = jest.fn().mockResolvedValue({
        submissionMode: 'online' 
    });

    (AgtService as jest.Mock).mockImplementation(() => ({
      registarFactura: mockRegistarFactura,
      obterEstado: mockObterEstado,
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.processed).toBe(2);

    // Verify registarFactura called for each doc
    expect(mockRegistarFactura).toHaveBeenCalledTimes(2);
    expect(mockRegistarFactura).toHaveBeenCalledWith(mockPendingDocs[0]);
    expect(mockRegistarFactura).toHaveBeenCalledWith(mockPendingDocs[1]);

    // Verify document status update
    expect(documentStore.updateDocument).toHaveBeenCalledWith('doc1', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'submitted',
        requestID: 'REQ-123'
      })
    }));

    // Verify audit log
    expect(agtAuditService.logDocumentSubmission).toHaveBeenCalledTimes(2);
  });

  test('handles submission errors gracefully', async () => {
    // Arrange: Mock one pending document
    const mockPendingDocs = [
      {
        id: 'doc3',
        documentType: 'factura',
        agtSubmission: { status: 'offline_pending', mode: 'offline' }
      }
    ];

    (documentStore.getAllDocuments as jest.Mock).mockReturnValue(mockPendingDocs);

    // Mock AgtService to throw error
    const mockRegistarFactura = jest.fn().mockRejectedValue(new Error('Network Error'));
    const mockGetActiveConfig = jest.fn().mockResolvedValue({ submissionMode: 'online' });

    (AgtService as jest.Mock).mockImplementation(() => ({
      registarFactura: mockRegistarFactura,
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(200); // Should still return 200 even if individual docs fail
    const data = JSON.parse(res._getData());
    expect(data.processed).toBe(1);
    expect(data.results[0].error).toContain('Network Error');

    // Verify document updated with error status
    expect(documentStore.updateDocument).toHaveBeenCalledWith('doc3', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'error',
        errorMessage: 'Network Error'
      })
    }));
  });
});
