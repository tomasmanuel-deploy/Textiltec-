
import { AgtService } from '../src/services/AgtService';
import { IDocument, DocumentType } from '../src/models/Document';

async function main() {
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
  if (result === expected) {
      console.log('SUCCESS: Matches expected format.');
  } else {
      console.log(`FAILURE: Expected ${expected}, got ${result}`);
  }

  // Check mapping
  console.log('Mapping aviso_cobranca:', agtService.mapDocumentTypeToAgt('aviso_cobranca'));
}

main().catch(console.error);
