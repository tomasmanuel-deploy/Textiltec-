import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../../lib/documentStore';
import AgtService from '../../../../services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid document ID' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paidAmount, paidDate, method, reference } = req.body || {};
    const paidAmountNum = typeof paidAmount === 'number'
      ? paidAmount
      : parseFloat(String(paidAmount ?? '').replace(',', '.'));

    console.log(`[ConfirmPayment] Attempting to confirm payment for ID: ${id}`);
    const exists = documentStore.getDocument(id as string);
    if (!exists) {
      console.error(`[ConfirmPayment] Document ID ${id} not found in store. Available IDs: ${Object.keys(documentStore['documents']).slice(0, 5).join(', ')}...`);
    }

    const updated = documentStore.confirmPayment(id as string, {
      paidAmount: !isNaN(paidAmountNum) ? paidAmountNum : undefined,
      paidDate,
      method,
      reference,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Document not found' });
    }

    let receipt = (updated.relatedDocuments || [])
      .map((rid: string) => documentStore.getDocument(rid))
      .filter((d) => d && d.documentType === 'recibo')
      .pop() || null;

    // Auto-submit receipt to AGT if created
    if (receipt) {
      try {
        const agtService = new AgtService();
        const config = await agtService.getActiveConfig();
        
        if (config.submissionMode === 'online') {
          let originReady = true;
          try {
            const origin = documentStore.getDocument(id as string);
            const originStatus = origin?.agtSubmission?.status;
            if (origin && origin.status !== 'draft' && originStatus !== 'success') {
              const respOrigin = await agtService.registarFactura(origin as any);
              const rcOrigin = respOrigin?.resultCode;
              const numericOrigin = typeof rcOrigin === 'string' ? parseInt(rcOrigin, 10) : Number(rcOrigin);
              const tokenOrigin = respOrigin?.submissionToken || respOrigin?.agtToken || respOrigin?.requestID || respOrigin?.successRequestID;
              const isOriginSuccess = numericOrigin === 1;
              const isOriginPending = numericOrigin === 2 && tokenOrigin;
              if (isOriginSuccess) {
                documentStore.updateDocument(origin.id, {
                  agtSubmission: {
                    status: 'success',
                    agtToken: tokenOrigin || 'mock-token',
                    submissionDate: new Date().toISOString(),
                    message: 'Auto-submitted successfully (Origin)',
                    mode: 'online'
                  }
                } as any);
              } else if (isOriginPending) {
                originReady = false;
                documentStore.updateDocument(origin.id, {
                  agtSubmission: {
                    status: 'pending',
                    agtToken: String(tokenOrigin),
                    submissionDate: new Date().toISOString(),
                    message: 'Submitted, awaiting processing',
                    mode: 'online'
                  }
                } as any);
              }
            }
          } catch {
            originReady = false;
          }

          if (!originReady) {
            documentStore.updateDocument(receipt.id, {
              agtSubmission: {
                status: 'blocked',
                submissionDate: new Date().toISOString(),
                message: 'Documento de origem ainda não confirmado na AGT. Submissão do recibo será retomada após sincronização.',
                mode: 'online'
              }
            } as any);
            return res.status(202).json({
              message: 'Payment confirmed. Receipt queued until origin is confirmed on AGT.',
              document: updated,
              receipt: documentStore.getDocument(receipt.id)
            });
          }

          console.log(`[ConfirmPayment] Auto-submitting receipt ${receipt.id} to AGT...`);
          const response = await agtService.registarFactura(receipt);
          const rc = response?.resultCode;
          const numeric = typeof rc === 'string' ? parseInt(rc, 10) : Number(rc);
          const token = response?.submissionToken || response?.agtToken || response?.requestID || response?.successRequestID;
          const isSuccess = numeric === 1;
          const isPending = numeric === 2 && token;

          if (isSuccess) {
            console.log(`[ConfirmPayment] Receipt submitted successfully. Token: ${token}`);
            
            const updatedReceipt = documentStore.updateDocument(receipt.id, {
              agtSubmission: {
                status: 'success',
                agtToken: token || 'mock-token',
                submissionDate: new Date().toISOString(),
                message: 'Auto-submitted successfully (Receipt)'
              }
            } as any);
            
            if (updatedReceipt) {
              receipt = updatedReceipt;
            }
          } else if (isPending) {
            documentStore.updateDocument(receipt.id, {
              agtSubmission: {
                status: 'pending',
                agtToken: String(token),
                submissionDate: new Date().toISOString(),
                message: 'Submitted, awaiting processing',
                mode: 'online'
              }
            } as any);
          } else {
            console.error(`[ConfirmPayment] AGT Error for receipt:`, response);
            const resultCode = response?.resultCode;
            const errorList = response?.errorList;
            let errorDetails = '';
            if (Array.isArray(errorList) && errorList.length > 0) {
              errorDetails = errorList
                .map((e: any) => (typeof e === 'string' ? e : (e.description || e.code || JSON.stringify(e))))
                .join('; ');
            } else {
              errorDetails = `AGT Error (Code: ${resultCode !== undefined ? resultCode : 'undefined/network'}) - Full Response: ${JSON.stringify(response)}`;
            }
            if (String(errorDetails).toLowerCase().includes('documento de origem') || String(errorDetails).includes('originatingON')) {
              documentStore.updateDocument(receipt.id, {
                agtSubmission: {
                  status: 'blocked',
                  message: errorDetails,
                  submissionDate: new Date().toISOString(),
                  mode: 'online'
                }
              } as any);
              return res.status(202).json({
                message: 'Payment confirmed. Receipt blocked by missing origin on AGT.',
                document: updated,
                receipt: documentStore.getDocument(receipt.id)
              });
            }
            documentStore.updateDocument(receipt.id, {
              agtSubmission: {
                status: 'error',
                message: errorDetails,
                submissionDate: new Date().toISOString()
              }
            } as any);
          }
        } else if (config.submissionMode === 'offline') {
           documentStore.updateDocument(receipt.id, {
             agtSubmission: {
               status: 'offline_pending',
               mode: 'offline',
               submissionDate: new Date().toISOString()
             }
           } as any);
        }
      } catch (agtError: any) {
        console.error(`[ConfirmPayment] Failed to submit receipt to AGT:`, agtError);
        // Don't fail the whole request, but log the error on the receipt if possible
         documentStore.updateDocument(receipt.id, {
            agtSubmission: {
              status: 'error',
              message: `Exception: ${agtError.message}`,
              submissionDate: new Date().toISOString()
            }
          } as any);
      }
    }

    return res.status(200).json({
      message: 'Payment confirmed successfully',
      document: updated,
      receipt,
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
