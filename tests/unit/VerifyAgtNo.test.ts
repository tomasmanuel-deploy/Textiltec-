
import { AgtService } from '../../src/services/AgtService';
import { IDocument, DocumentType } from '../../src/models/Document';

describe('Verify AGT Document Number Generation', () => {
  it('should generate correct AGT document number for Aviso de Cobrança (AC)', async () => {
    const agtService = new AgtService();
    
    const doc: Partial<IDocument> = {
      documentType: 'aviso_cobranca' as DocumentType,
      issueDate: new Date('2026-03-09'),
      series: 'AC',
      sequentialNumber: 2,
      seller: {
          seriesBase: 'XVE'
      } as any
    };

    console.log('Testing computeAgtDocumentNo for Aviso de Cobrança (AC)...');
    const result = await agtService.computeAgtDocumentNo(doc as IDocument);
    console.log('Result:', result);
    
    const expected = 'AC AC7926S14521N/0002';
    expect(result).toBe(expected);
  });
});
