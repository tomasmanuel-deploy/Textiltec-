import fs from 'fs';
import path from 'path';
import { IDocument, DocumentType } from '../../src/models/Document';

// Mock process.env.DATA_DIR
const TEST_DATA_DIR = path.join(__dirname, 'test_data_agt_series');

// Helper to create test data
const createCompanyJson = (overrides: any = {}) => {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  // Create dummy agt_config.json to prevent Mongoose fallback/timeout
  if (!fs.existsSync(path.join(TEST_DATA_DIR, 'agt_config.json'))) {
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'agt_config.json'), JSON.stringify({ submissionMode: 'online' }));
  }

  const defaultCompany = {
    // No seriesBase by default to allow testing fallback
    authorizedSeries: {}
  };
  const finalCompany = { ...defaultCompany, ...overrides };
  fs.writeFileSync(path.join(TEST_DATA_DIR, 'company.json'), JSON.stringify(finalCompany, null, 2));
};

describe('AgtService Document Number Generation', () => {
  let AgtServiceClass: any;
  let agtService: any;

  beforeAll(() => {
    // Set env var BEFORE importing service to ensure it picks up the test directory
    process.env.DATA_DIR = TEST_DATA_DIR;
    
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    
    // Dynamic import to ensure env var is read correctly
    // We need to use require here because static imports are hoisted
    const serviceModule = require('../../src/services/AgtService');
    AgtServiceClass = serviceModule.AgtService;
    agtService = new AgtServiceClass();
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  it('should generate FT document number with long series code from authorizedSeries', async () => {
    // Setup authorized series
    createCompanyJson({
      authorizedSeries: {
        'FT': {
          '2024': 'FT7926S29030N'
        }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.INVOICE, // 'factura'
      issueDate: new Date('2024-03-09'),
      series: 'FT', // Short series code used internally
      sequentialNumber: 135,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    expect(docNo).toBe('FT FT7926S29030N/0135');
  });

  it('should generate GR (Delivery Note) document number with long series code', async () => {
    // Setup authorized series for GR
    // Note: 'nota_de_entrega' maps to 'GR'
    createCompanyJson({
      authorizedSeries: {
        'GR': {
          '2024': 'GR7926S29030N'
        }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.DELIVERY_NOTE, // 'nota_de_entrega'
      issueDate: new Date('2024-03-09'),
      series: 'GR',
      sequentialNumber: 50,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    expect(docNo).toBe('GR GR7926S29030N/0050');
  });

  it('should generate PP (Proforma) document number with long series code', async () => {
    // Setup authorized series for PP
    createCompanyJson({
      authorizedSeries: {
        'PP': {
          '2024': 'PP7926S29030N'
        }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.PROFORMA, // 'proforma'
      issueDate: new Date('2024-03-09'),
      series: 'PP',
      sequentialNumber: 10,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    expect(docNo).toBe('PP PP7926S29030N/0010');
  });

  it('should generate AC document number for Aviso de Cobrança', async () => {
    createCompanyJson({
      authorizedSeries: {
        'AC': {
          '2024': 'AC7926S29030N'
        }
      }
    });

    const doc: Partial<IDocument> = {
      documentType: DocumentType.AVISO_COBRANCA,
      issueDate: new Date('2024-03-09'),
      series: 'AC',
      sequentialNumber: 135,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    expect(docNo).toBe('AC AC7926S29030N/0135');
  });

  it('should fallback to default series if not in authorizedSeries', async () => {
    createCompanyJson({}); // Empty series

    const doc: Partial<IDocument> = {
      documentType: DocumentType.INVOICE,
      issueDate: new Date('2024-03-09'),
      series: 'FT',
      sequentialNumber: 135,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    // Should be FT XVE2024/0135 because fallback uses seriesBase + Year
    expect(docNo).toBe('FT XVE2024/0135');
  });

  it('should use document.series directly if it is already a long code', async () => {
    createCompanyJson({}); 

    const doc: Partial<IDocument> = {
      documentType: DocumentType.INVOICE,
      issueDate: new Date('2024-03-09'),
      series: 'FT7926S29030N', // Explicit long code
      sequentialNumber: 135,
      seller: { seriesBase: 'XVE' } as any
    };

    const docNo = await agtService.computeAgtDocumentNo(doc as IDocument);
    expect(docNo).toBe('FT FT7926S29030N/0135');
  });
});
