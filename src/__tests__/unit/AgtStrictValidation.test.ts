
import AgtService from '../../services/AgtService';
import axios from 'axios';
import CentralLogService from '../../services/CentralLogService';

// Mock dependencies
jest.mock('axios');
jest.mock('../../services/CentralLogService');
jest.mock('mongoose', () => {
  const Schema = function() {
    return {
      index: jest.fn(),
      pre: jest.fn(),
      virtual: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn()
      })),
      methods: {},
      statics: {}
    };
  };
  (Schema as any).Types = { ObjectId: class {} };
  return {
    Schema,
    model: jest.fn(),
    Document: class {},
    connect: jest.fn(),
    disconnect: jest.fn(),
    models: {},
    Types: { ObjectId: class {} }
  };
});

describe('AgtService Strict Validation', () => {
  let service: AgtService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgtService();
    // Mock getActiveConfig to return a valid config
    jest.spyOn(service, 'getActiveConfig').mockResolvedValue({
      agtRestUrl: 'https://test.agt.gov.ao',
      timeout: 1000,
      clientId: 'test-client',
      clientSecret: 'test-secret',
      companyNif: '123456789'
    } as any);
  });

  test('submitRestRequest throws error when resultCode is not 1 (Business Error)', async () => {
    // Arrange
    const errorResponse = {
      resultCode: -1,
      requestID: 'REQ-FAIL',
      errorList: [{ code: 'E01', message: 'Invalid NIF' }]
    };

    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: errorResponse
    });

    // Act & Assert
    await expect(service.submitRestRequest('registarFactura', { documents: [] }))
      .rejects.toThrow('AGT Business Error (resultCode: -1)');
    
    // Should verify it did NOT retry (since it's a business error)
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('submitRestRequest succeeds when resultCode is 1', async () => {
    // Arrange
    const successResponse = {
      resultCode: 1,
      requestID: 'REQ-SUCCESS'
    };

    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: successResponse
    });

    // Act
    const result = await service.submitRestRequest('registarFactura', { documents: [] });

    // Assert
    expect(result).toEqual(successResponse);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('submitRestRequest throws error when resultCode is missing', async () => {
    // Arrange
    const invalidResponse = {
      // Missing resultCode
      status: 'OK'
    };

    (axios.post as jest.Mock).mockResolvedValue({
      status: 200,
      data: invalidResponse
    });

    // Act & Assert
    await expect(service.submitRestRequest('registarFactura', { documents: [] }))
      .rejects.toThrow('AGT Invalid Response (Missing resultCode)');
    
    // It should retry because "Invalid Response" is treated as potential network/server glitch (unlike explicit Business Error)
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('submitRestRequest retries on Network Error', async () => {
    // Arrange
    const networkError = new Error('Network Error');
    (axios.post as jest.Mock).mockRejectedValue(networkError);

    // Act & Assert
    await expect(service.submitRestRequest('registarFactura', { documents: [] }))
      .rejects.toThrow('Network Error');
    
    // Verify retries (1 initial + 3 retries = 4 calls total? Or loop logic: 1..3 attempts)
    // The code loop is: for (let attempt = 1; attempt <= MAX_RETRIES; attempt++)
    // MAX_RETRIES is 3. So it runs 3 times.
    expect(axios.post).toHaveBeenCalledTimes(3);
  });
});
