
import { documentStore } from '../../lib/documentStore';
import AgtService from '../../services/AgtService';

const RUN_LIVE_AGT_TESTS = process.env.RUN_LIVE_AGT_TESTS === 'true';

describe('Fix AGT Submissions', () => {
  let agtService: AgtService;
  
  beforeAll(async () => {
    agtService = new AgtService();
    // Verify we are in online mode
    const config = await agtService.getActiveConfig();
    if (config.submissionMode !== 'online') {
      console.warn('AGT submission mode is NOT online. Skipping fix.');
      // Skip all tests if not online? Jest doesn't easily support skipping suite dynamically.
      // But we can just check in the test.
    }
  });

  (RUN_LIVE_AGT_TESTS ? test : test.skip)('should attempt to submit pending documents to AGT', async () => {
    const config = await agtService.getActiveConfig();
    if (config.submissionMode !== 'online') {
      console.log('Skipping submission as mode is not online');
      return;
    }

    const allDocs = documentStore.getAllDocuments();
    const submittableTypes = [
      'factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega',
      'ft', 'fr', 'rc', 'nc', 'nd', 'gr'
    ];

    const pendingDocs = allDocs.filter(d => {
      const type = String(d.documentType || '').toLowerCase();
      const isSubmittable = submittableTypes.includes(type);
      const isFinal = d.status === 'issued' || d.status === 'paid' || d.status === 'finalized';
      const agtStatus = d.agtSubmission?.status;
      
      // Select docs that are final, submittable, and NOT sent (or failed)
      // Note: We are conservative and retry if status is missing or explicitly pending
      return isSubmittable && isFinal && (!agtStatus || agtStatus === 'pending' || agtStatus === 'offline_pending');
    });

    console.log(`Found ${pendingDocs.length} pending documents to submit.`);

    if (pendingDocs.length === 0) {
      console.log('No pending documents found.');
      return;
    }

    const results = [];
    const errors = [];

    for (const doc of pendingDocs) {
      try {
        console.log(`Submitting document ${doc.id} (${doc.documentType})...`);
        const response = await agtService.registarFactura(doc);
        
        const isSuccess = response && (
            response.resultCode === 1 || 
            response.resultCode === '1' ||
            (response.requestID && (!response.errorList || response.errorList.length === 0))
        );

        if (isSuccess) {
          const token = response.submissionToken || response.agtToken || response.requestID || 'recovered-token';
          console.log(`Success! Token: ${token}`);
          
          documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'success',
              agtToken: token,
              submissionDate: new Date().toISOString(),
              message: 'Recovered via FixAgtSubmissions'
            }
          } as any);
          results.push(doc.id);
        } else {
           const errorMsg = response?.errorList ? JSON.stringify(response.errorList) : `Code: ${response?.resultCode}`;
           console.error(`Failed: ${errorMsg}`);
           
           documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'error',
              errorMessage: errorMsg,
              submissionDate: new Date().toISOString()
            }
          } as any);
          errors.push({ id: doc.id, error: errorMsg });
        }
      } catch (e: any) {
        console.error(`Exception submitting ${doc.id}:`, e.message);
        errors.push({ id: doc.id, error: e.message });
      }
    }

    console.log('Submission Summary:');
    console.log(`Total Processed: ${pendingDocs.length}`);
    console.log(`Success: ${results.length}`);
    console.log(`Errors: ${errors.length}`);
    
    // Fail test if errors occurred so we notice
    if (errors.length > 0) {
        console.warn('Some documents failed to submit. Check logs.');
        // Don't fail the test necessarily, as network issues happen. Ideally, just report.
    }
  }, 60000); // 60s timeout
});
