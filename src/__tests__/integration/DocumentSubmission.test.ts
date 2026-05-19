
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/documents/[id]/submit-agt';
import { documentStore } from '../../lib/documentStore';
import AgtService from '../../services/AgtService';
import agtAuditService from '../../services/AgtAuditService';

// Mock dependencies
jest.mock('../../lib/documentStore', () => ({
  documentStore: {
    getDocument: jest.fn(),
    updateDocument: jest.fn(),
  }
}));

jest.mock('../../services/AgtService');
jest.mock('../../services/AgtAuditService');
jest.mock('../../services/DocumentValidationService', () => ({
  validateForAgtSubmission: jest.fn(() => ({ isValid: true, warnings: [] }))
}));

describe('Document Submission API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully submits a valid document to AGT', async () => {
    // Arrange
    const mockDoc = {
      id: '1',
      documentType: 'factura',
      status: 'draft',
      // ... other fields needed
    };

    (documentStore.getDocument as jest.Mock).mockReturnValue(mockDoc);
    
    // Mock AgtService.registarFactura to return success
    const mockRegistarFactura = jest.fn().mockResolvedValue({
      resultCode: 1,
      requestID: 'AGT-TOKEN-123'
    });
    
    // Mock getActiveConfig
    const mockGetActiveConfig = jest.fn().mockResolvedValue({
        submissionMode: 'online'
    });

    (AgtService as jest.Mock).mockImplementation(() => ({
      registarFactura: mockRegistarFactura,
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '1' },
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.token).toBe('AGT-TOKEN-123');

    // Verify document status update
    expect(documentStore.updateDocument).toHaveBeenCalledWith('1', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'success',
        agtToken: 'AGT-TOKEN-123'
      })
    }));

    // Verify audit log
    expect(agtAuditService.logDocumentSubmission).toHaveBeenCalledWith(
      '1', 
      'factura', 
      'success', 
      expect.stringContaining('successfully'), 
      expect.anything()
    );
  });

  test('handles AGT submission failure', async () => {
    // Arrange
    const mockDoc = {
      id: '2',
      documentType: 'factura',
    };

    (documentStore.getDocument as jest.Mock).mockReturnValue(mockDoc);
    
    // Mock AgtService to return failure
    const mockRegistarFactura = jest.fn().mockResolvedValue({
      resultCode: 0,
      errorList: [{ code: 'E001', description: 'Invalid NIF' }]
    });
    
     const mockGetActiveConfig = jest.fn().mockResolvedValue({
        submissionMode: 'online'
    });

    (AgtService as jest.Mock).mockImplementation(() => ({
      registarFactura: mockRegistarFactura,
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '2' },
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid NIF');

    // Verify document status update
    expect(documentStore.updateDocument).toHaveBeenCalledWith('2', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('Invalid NIF')
      })
    }));
  });

  test('queues for offline when mode is offline', async () => {
     // Arrange
     // Mock getActiveConfig to return offline mode
     // Note: The handler instantiates AgtServiceClass directly: const cfg = await new AgtServiceClass().getActiveConfig();
     // So we need to ensure the mock returns this config.
     
     const mockGetActiveConfig = jest.fn().mockResolvedValue({
        submissionMode: 'offline'
    });

    (AgtService as jest.Mock).mockImplementation(() => ({
      getActiveConfig: mockGetActiveConfig
    }));
    
    (documentStore.updateDocument as jest.Mock).mockReturnValue({ documentType: 'factura' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: '3' },
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(202);
    const data = JSON.parse(res._getData());
    expect(data.message).toContain('Offline mode active');

    // Verify document status update
    expect(documentStore.updateDocument).toHaveBeenCalledWith('3', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'offline_pending',
        mode: 'offline'
      })
    }));
  });
});
