
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/documents/index';
import { documentStore } from '../../lib/documentStore';
import { productStore } from '../../lib/productStore';
import { seriesStore } from '../../lib/seriesStore';
import { clientStore } from '../../lib/clientStore';
import AgtService from '../../services/AgtService';
import fs from 'fs';

// Mock dependencies
jest.mock('../../lib/documentStore');
jest.mock('../../lib/productStore');
jest.mock('../../lib/seriesStore');
jest.mock('../../lib/clientStore');
jest.mock('../../services/AgtService');
jest.mock('fs');

describe('Document Creation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false); // Default: no company file
  });

  const validFactura = {
    documentType: 'factura',
    buyer: { name: 'Test Buyer', nif: '123456789' },
    lines: [
      { productId: 'prod1', quantity: 1, unitPrice: 100, vatRate: 14 }
    ],
    totals: { total: 114 },
    payment: { method: 'cash', status: 'pending' }
  };

  test('creates document successfully and queues for AGT (Online)', async () => {
    // Arrange
    const mockCreatedDoc = { ...validFactura, id: 'doc1', status: 'issued', sequentialNumber: 1, series: 'FT' };
    (documentStore.createDocument as jest.Mock).mockReturnValue(mockCreatedDoc);
    (documentStore.getAllDocuments as jest.Mock).mockReturnValue([]);
    (seriesStore.getDefaultSeries as jest.Mock).mockReturnValue({ code: 'FT' });
    (documentStore.updateDocument as jest.Mock).mockImplementation((id, update) => ({ ...mockCreatedDoc, ...update }));
    (productStore.getProductById as jest.Mock).mockReturnValue({ id: 'prod1', name: 'Test Product', price: 100 });

    // Mock AgtService
    const mockGetActiveConfig = jest.fn().mockResolvedValue({ submissionMode: 'online' });

    (AgtService as jest.Mock).mockImplementation(() => ({
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
      body: validFactura
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(201);
    const data = JSON.parse(res._getData());
    expect(data.document.id).toBe('doc1');
    
    // Verify Online Queueing (non-blocking)
    expect(documentStore.updateDocument).toHaveBeenCalledWith('doc1', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'pending',
        mode: 'online'
      })
    }));
  });

  test('creates document and queues for offline (Offline Mode)', async () => {
    // Arrange
    const mockCreatedDoc = { ...validFactura, id: 'doc2', status: 'issued', sequentialNumber: 2, series: 'FT' };
    (documentStore.createDocument as jest.Mock).mockReturnValue(mockCreatedDoc);
    (documentStore.getAllDocuments as jest.Mock).mockReturnValue([]);
    (seriesStore.getDefaultSeries as jest.Mock).mockReturnValue({ code: 'FT' });
    (documentStore.updateDocument as jest.Mock).mockImplementation((id, update) => ({ ...mockCreatedDoc, ...update }));
    (productStore.getProductById as jest.Mock).mockReturnValue({ id: 'prod1', name: 'Test Product', price: 100 });

    // Mock AgtService
    const mockGetActiveConfig = jest.fn().mockResolvedValue({ submissionMode: 'offline' });
    (AgtService as jest.Mock).mockImplementation(() => ({
      getActiveConfig: mockGetActiveConfig
    }));

    const { req, res } = createMocks({
      method: 'POST',
      body: validFactura
    });

    // Act
    await handler(req as any, res as any);

    // Assert
    expect(res._getStatusCode()).toBe(201);
    
    // Verify Offline Queueing
    expect(documentStore.updateDocument).toHaveBeenCalledWith('doc2', expect.objectContaining({
      agtSubmission: expect.objectContaining({
        status: 'offline_pending',
        mode: 'offline'
      })
    }));
  });

  test('validates required fields', async () => {
    const invalidBody = { documentType: 'factura' }; // Missing buyer, lines
    const { req, res } = createMocks({
      method: 'POST',
      body: invalidBody
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Missing required fields');
  });

  test('validates Credit Note references', async () => {
    const invalidCreditNote = {
      documentType: 'nota_de_credito',
      buyer: { name: 'Buyer' },
      lines: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
      relatedDocuments: [] // Empty
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: invalidCreditNote
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('deve referenciar um documento de origem');
  });
});
