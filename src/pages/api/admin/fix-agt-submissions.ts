
import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import AgtService from '../../../services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST or GET for testing
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const agtService = new AgtService();
    const config = await agtService.getActiveConfig();
    
    if (config.submissionMode !== 'online') {
      return res.status(400).json({ error: 'AGT submission mode is not online' });
    }

    const allDocs = documentStore.getAllDocuments();
    const submittableTypes = [
  'factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito',
  'ft', 'fr', 'rc', 'nc', 'nd',
  'ac', 'aviso_cobranca',
  'ar', 'aviso_cobranca_recibo',
  'rg', 'outros_recibos',
  'gf', 'factura_generica',
  'fg', 'factura_global',
  'fa', 'factura_adiantamento',
  'af', 'factura_recibo_autofacturacao',
  're', 'recibo_estorno',
  'gr', 'nota_de_entrega'
  // 'pp'/'proforma' removed due to AGT error E03
];

    const results = [];
    const errors = [];

    // Filter documents that need submission
    const pendingDocs = allDocs.filter(d => {
      const type = String(d.documentType || '').toLowerCase();
      const isSubmittable = submittableTypes.includes(type);
      const st = String((d as any).status || '');
      const isFinal = st === 'issued' || st === 'paid' || st === 'finalized';
      const agtStatus = d.agtSubmission?.status;
      
      // Retry if status is missing, 'pending', or 'error'
      // Note: Retrying 'error' might be risky if it was a real rejection, but usually safe to try if it was a connection error.
      // Let's be conservative: retry if missing or pending.
      // If user wants to retry errors, they can specify.
      return isSubmittable && isFinal && (!agtStatus || agtStatus === 'pending' || agtStatus === 'offline_pending');
    });

    console.log(`Found ${pendingDocs.length} documents to submit to AGT.`);

    for (const doc of pendingDocs) {
      try {
        console.log(`Submitting document ${doc.id} (${doc.documentType})...`);
        const response = await agtService.registarFactura(doc as any);
        
        const rc = response?.resultCode;
        const numeric = typeof rc === 'string' ? parseInt(rc, 10) : Number(rc);
        const token = response?.submissionToken || response?.agtToken || response?.requestID || response?.successRequestID || 'recovered-token';
        const isSuccess = numeric === 1;
        const isPending = numeric === 2 && token;

        if (isSuccess) {
          documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'success',
              agtToken: token,
              submissionDate: new Date().toISOString(),
              message: 'Recovered via fix-agt-submissions'
            }
          } as any);
          results.push({ id: doc.id, status: 'success', token });
        } else if (isPending) {
          documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'pending',
              agtToken: String(token),
              submissionDate: new Date().toISOString(),
              message: 'Submitted, awaiting processing',
              mode: 'online'
            }
          } as any);
          results.push({ id: doc.id, status: 'pending', token });
        } else {
           const errorMsg = response?.errorList ? JSON.stringify(response.errorList) : `Code: ${response?.resultCode}`;
           documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'error',
              message: errorMsg,
              submissionDate: new Date().toISOString()
            }
          } as any);
          errors.push({ id: doc.id, status: 'error', message: errorMsg });
        }
      } catch (e: any) {
        console.error(`Failed to submit ${doc.id}:`, e);
        const msg = String(e?.message || '');
        const lower = msg.toLowerCase();
        const alreadyExists =
          lower.includes('já consta no repositório') ||
          lower.includes('já consta no repositório') ||
          lower.includes('duplicada');
        if (alreadyExists) {
          const token = (doc as any).uuid || String(doc.id);
          documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'success',
              agtToken: token,
              submissionDate: new Date().toISOString(),
              message: 'Synced successfully (Already exists)'
            }
          } as any);
          results.push({ id: doc.id, status: 'success', token });
        } else {
          errors.push({ id: doc.id, status: 'exception', message: msg });
        }
      }
    }

    res.status(200).json({
      message: 'AGT Submission Fix Complete',
      processed: pendingDocs.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors
    });

  } catch (error: any) {
    console.error('Error in fix-agt-submissions:', error);
    res.status(500).json({ error: error.message });
  }
}
