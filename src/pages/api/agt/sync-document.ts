import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import AgtService from '../../../services/AgtService';
import agtAuditService from '../../../services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { documentId } = req.body;
  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  };

  try {
    const agtService = new AgtService();
    const config = await agtService.getActiveConfig();
    const requestTimeout = Math.max(60000, Number(config?.timeout) || 60000);

    let doc = documentStore.getDocument(documentId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const token = doc.agtSubmission?.agtToken;
    if (doc.agtSubmission?.status === 'pending' && token) {
      let estado: any;
      try {
        estado = await withTimeout(agtService.obterEstado(token), requestTimeout);
      } catch (err: any) {
        const isTimeout = err.message === 'timeout' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            ...(documentStore.getDocument(doc.id) as any)?.agtSubmission,
            status: 'pending',
            agtToken: token,
            mode: 'online',
            lastPollAt: new Date().toISOString(),
            message: isTimeout ? 'Status poll timeout' : (err.message || 'Status poll failed')
          }
        } as any);
        return res.status(202).json({ success: false, pending: true, token });
      }
      const reqErrors = Array.isArray(estado?.requestErrorList) ? estado.requestErrorList : [];
      const rateLimited = reqErrors.some((e: any) => {
        const code = String(e?.idError || e?.code || '').trim();
        const desc = String(e?.descriptionError || e?.message || '').toLowerCase();
        return code === '429' || desc.includes('limite de requisi');
      });
      if (rateLimited) {
        const msg = reqErrors.map((e: any) => String(e?.descriptionError || e?.message || e?.idError || e?.code || '')).filter(Boolean).join('; ') || 'Rate limited';
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            ...(documentStore.getDocument(doc.id) as any)?.agtSubmission,
            status: 'pending',
            agtToken: token,
            mode: 'online',
            lastPollAt: new Date().toISOString(),
            message: msg,
          }
        } as any);
        return res.status(202).json({ success: false, pending: true, token, estado });
      }

      const notFound = reqErrors.some((e: any) => {
        const code = String(e?.idError || e?.code || '').trim().toUpperCase();
        const desc = String(e?.descriptionError || e?.message || '').toLowerCase();
        return code === 'E94' || (desc.includes('solicita') && desc.includes('não encontrada'));
      });
      if (notFound) {
        const msg = reqErrors
          .map((e: any) => String(e?.descriptionError || e?.message || e?.idError || e?.code || ''))
          .filter(Boolean)
          .join('; ') || 'Solicitação não encontrada (E94).';
        
        // GENIUS E94 FIX: AGT recommends waiting 30 minutes. Do NOT mark as error or resubmit.
        // Keep it as pending to allow subsequent polls.
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            ...(documentStore.getDocument(doc.id) as any)?.agtSubmission,
            status: 'pending',
            agtToken: token,
            mode: 'online',
            lastPollAt: new Date().toISOString(),
            message: `AGT Processing (E94): ${msg}. Validation in progress. Next check recommended in 10-30 minutes.`,
          }
        } as any);
        
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', 'AGT Processing (E94): Request not found yet. Keeping as pending for retry.', { token, estado });
        return res.status(202).json({ success: false, pending: true, token, message: 'Processing (E94)' });
      } else {
      const list = Array.isArray(estado?.documentStatusList) ? estado.documentStatusList : [];
      const errors: string[] = [];
      for (const entry of list) {
        const entryErrors = Array.isArray(entry?.errorList) ? entry.errorList : [];
        for (const e of entryErrors) {
          if (!e) continue;
          const msg = String(e.descriptionError || e.message || e.description || e.idError || e.code || '').trim();
          if (msg) errors.push(msg);
        }
      }

      if (errors.length > 0) {
        const errorMessage = errors.join('; ');
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            status: 'error',
            message: errorMessage,
            submissionDate: new Date().toISOString(),
            mode: 'online'
          }
        } as any);
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'error', 'Status check failed', { token, estado });
        return res.status(400).json({ success: false, error: errorMessage, estado });
      }

      const numeric = typeof estado?.resultCode === 'string' ? parseInt(estado.resultCode, 10) : Number(estado?.resultCode);
      const isProcessedOk =
        numeric === 1 ||
        String(estado?.status || '').toUpperCase() === 'PROCESSADO' ||
        list.some((entry: any) => {
          const s = String(entry?.status || entry?.documentStatus || entry?.documentState || '').toUpperCase();
          return s.includes('PROCESSADO');
        });
      if (isProcessedOk) {
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            status: 'success',
            agtToken: token,
            submissionDate: new Date().toISOString(),
            message: 'Synced successfully',
            mode: 'online'
          }
        } as any);
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', 'Status confirmed', { token, estado });
        return res.status(200).json({ success: true, token, estado });
      }

      console.log(`[Sync] Document ${doc.id} still pending on AGT. Status: ${estado?.status || 'Unknown'}`);
      return res.status(202).json({ success: false, pending: true, token, estado });
      }
    }

    // Double check if already submitted to avoid duplicates
    if (doc.agtSubmission?.status === 'success') {
      return res.status(200).json({ 
        success: true, 
        message: 'Already submitted', 
        token: doc.agtSubmission.agtToken 
      });
    }

    // 1. SMART RECOVERY: Before trying to submit, check if document already exists on AGT
    // This handles cases where a previous attempt timed out but was actually saved by AGT
    const docNo = await agtService.computeAgtDocumentNo(doc as any);
    if (docNo) {
      try {
        console.log(`[Sync] Checking if document ${docNo} already exists on AGT...`);
        const existing = await withTimeout(agtService.consultarFactura(docNo), 60000);
        
        const isRegistered = 
          existing && 
          (Number(existing.resultCode) === 1 || 
           (existing.invoiceNo === docNo && existing.taxRegistrationNumber));

        if (isRegistered) {
          const recoveredToken = existing.requestID || existing.agtToken || existing.submissionToken || (doc as any).uuid || 'recovered';
          console.log(`[Sync] Document ${docNo} recovered via consultation. Marking as success.`);
          
          documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'success',
              agtToken: recoveredToken,
              submissionDate: new Date().toISOString(),
              message: 'Recovered successfully (Consultation)',
              mode: 'online'
            }
          } as any);
          
          agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', 'Recovered via consultation', { recoveredToken });
          return res.status(200).json({ success: true, token: recoveredToken, message: 'Recovered successfully' });
        }
      } catch (consultErr) {
        // If consultation fails, just proceed with normal submission
        console.log(`[Sync] Consultation failed for ${docNo}, proceeding with normal submission...`);
      }
    }

    let response: any;
    try {
      response = await withTimeout(agtService.registarFactura(doc as any), requestTimeout);
    } catch (err: any) {
      const isTimeout = err.message === 'timeout' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: isTimeout ? 'offline_pending' : 'error',
          mode: isTimeout ? 'offline' : 'online',
          message: isTimeout ? 'AGT timeout. Document queued for later submission.' : (err.message || 'Submission failed'),
          submissionDate: new Date().toISOString(),
        },
      } as any);

      if (isTimeout) {
        return res.status(202).json({ success: false, pending: true, message: 'AGT timeout. Queued for later submission.' });
      } else {
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'error', err.message || 'Submission failed', { error: err });
        return res.status(400).json({ success: false, error: err.message || 'Submission failed' });
      }
    }
    const requestID = response?.requestID || response?.agtToken || response?.successRequestID;
    const rc = response?.resultCode;
    const numeric = typeof rc === 'string' ? parseInt(rc, 10) : Number(rc);
    const isSuccess = numeric === 1;
    const isPending = numeric === 2 || (!isNaN(numeric) && numeric !== 1);

    if (isSuccess) {
      const token = requestID || 'mock-token';
      const successMessage = response?.message || 'Synced successfully';
      
      // Update document store
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'success',
          agtToken: token,
          submissionDate: new Date().toISOString(),
          message: successMessage,
          mode: 'online'
        }
      } as any);

      agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', successMessage, { token });

      return res.status(200).json({ success: true, token, message: successMessage });
    } else if (isPending && requestID) {
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'pending',
          agtToken: String(requestID),
          submissionDate: new Date().toISOString(),
          message: 'Submitted, awaiting processing',
          mode: 'online'
        }
      } as any);
      agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'pending' as any, 'Awaiting processing', { token: requestID });
      return res.status(202).json({ success: false, pending: true, token: String(requestID) });
    } else {
      // Update with error
      const resultCode = response?.resultCode;
      const errorList = response?.errorList;
      const errorMessage = (Array.isArray(errorList) && errorList.length > 0)
        ? errorList.map((e: any) => (typeof e === 'string' ? e : (e.description || e.code || JSON.stringify(e)))).join('; ')
        : `AGT Error (Code: ${resultCode !== undefined ? resultCode : 'undefined/network'}) - Full Response: ${JSON.stringify(response)}`;
      const isReceiptDoc = ['recibo', 'aviso_cobranca_recibo', 'recibo_estorno', 'outros_recibos', 'factura_generica'].includes(String(doc.documentType));
      const isMissingOrigin = String(errorMessage).toLowerCase().includes('documento de origem') || String(errorMessage).includes('originatingON');
      if (isReceiptDoc && isMissingOrigin) {
        const originId = Array.isArray((doc as any).relatedDocuments) && (doc as any).relatedDocuments.length
          ? String((doc as any).relatedDocuments[0])
          : '';
        const origin = originId ? documentStore.getDocument(originId) : null;
        if (origin) {
          try {
            console.log(`[Sync] Attempting to sync origin document ${origin.id} for receipt ${doc.id}...`);
            const respOrigin = await withTimeout(agtService.registarFactura(origin as any), requestTimeout);
            const tokenOrigin = respOrigin?.submissionToken || respOrigin?.agtToken || respOrigin?.requestID || respOrigin?.successRequestID;
            const rcOrigin = respOrigin?.resultCode;
            const numericOrigin = typeof rcOrigin === 'string' ? parseInt(rcOrigin, 10) : Number(rcOrigin);
            const isOriginSuccess = numericOrigin === 1;
            const isOriginPending = numericOrigin === 2 || (!isNaN(numericOrigin) && numericOrigin !== 1);

            if (isOriginSuccess && tokenOrigin) {
              console.log(`[Sync] Origin ${origin.id} synced successfully. Retrying receipt ${doc.id}...`);
              documentStore.updateDocument(origin.id, {
                agtSubmission: {
                  status: 'success',
                  agtToken: tokenOrigin,
                  submissionDate: new Date().toISOString(),
                  message: 'Synced successfully',
                  mode: 'online'
                }
              } as any);
              const retry = await withTimeout(agtService.registarFactura(doc as any), requestTimeout);
              const retryToken = retry?.requestID || retry?.agtToken || retry?.successRequestID;
              const retryRc = retry?.resultCode;
              const retryNumeric = typeof retryRc === 'string' ? parseInt(retryRc, 10) : Number(retryRc);
              if (retryNumeric === 1) {
                documentStore.updateDocument(doc.id, {
                  agtSubmission: {
                    status: 'success',
                    agtToken: retryToken || 'mock-token',
                    submissionDate: new Date().toISOString(),
                    message: retry?.message || 'Synced successfully',
                    mode: 'online'
                  }
                } as any);
                return res.status(200).json({ success: true, token: retryToken, message: retry?.message || 'Synced successfully' });
              }
              if (retryNumeric === 2 && retryToken) {
                documentStore.updateDocument(doc.id, {
                  agtSubmission: {
                    status: 'pending',
                    agtToken: String(retryToken),
                    submissionDate: new Date().toISOString(),
                    message: 'Submitted, awaiting processing',
                    mode: 'online'
                  }
                } as any);
                return res.status(202).json({ success: false, pending: true, token: String(retryToken) });
              }
            } else if (isOriginPending) {
              documentStore.updateDocument(origin.id, {
                agtSubmission: {
                  status: 'pending',
                  agtToken: String(tokenOrigin),
                  submissionDate: new Date().toISOString(),
                  message: 'Submitted, awaiting processing',
                  mode: 'online'
                }
              } as any);
              documentStore.updateDocument(doc.id, {
                agtSubmission: {
                  status: 'blocked',
                  submissionDate: new Date().toISOString(),
                  message: 'Documento de origem ainda não confirmado na AGT. Submissão do recibo será retomada após sincronização.',
                  mode: 'online'
                }
              } as any);
              return res.status(202).json({ success: false, pending: true, message: 'Blocked by origin processing' });
            }
          } catch {}
        }
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            status: 'blocked',
            message: errorMessage,
            submissionDate: new Date().toISOString(),
            mode: 'online'
          }
        } as any);
        return res.status(202).json({ success: false, pending: true, message: 'Blocked by missing origin on AGT' });
      }
      
      const emLower = String(errorMessage || '').toLowerCase();
      const alreadyExists =
        emLower.includes('já consta no repositório') ||
        emLower.includes('já consta no repositório') ||
        emLower.includes('duplicada');
      if (alreadyExists) {
        const recoveredToken = (doc as any).uuid || doc.id || 'already-exists';
        documentStore.updateDocument(doc.id, {
          agtSubmission: {
            status: 'success',
            agtToken: recoveredToken,
            submissionDate: new Date().toISOString(),
            message: 'Synced successfully (Already exists)',
            mode: 'online'
          }
        } as any);
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', 'Already exists on AGT', { recoveredToken, errorMessage });
        return res.status(200).json({ success: true, token: recoveredToken, message: 'Already exists on AGT' });
      }

      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'error',
          message: errorMessage,
          submissionDate: new Date().toISOString()
        }
      } as any);

      agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'error', 'Sync failed', { response });

      return res.status(400).json({ success: false, error: errorMessage });
    }

  } catch (error: any) {
    // Check if it's a "Business Error" that might be a duplicate (E99)
    // Since AgtService now throws on resultCode != 1, we must handle E99 here
    let isDuplicate = false;
    let isAlreadyExists = false;
    const response = error.response?.data || error.response;
    
    if (response && response.errorList) {
      const errors = Array.isArray(response.errorList) ? response.errorList : [];
      isDuplicate = errors.some((e: any) => 
        (e.idError === 'E99' || e.code === 'E99') && 
        (e.descriptionError?.includes('já utilizada') || e.message?.includes('já utilizada') ||
         e.descriptionError?.includes('already used') || e.message?.includes('already used'))
      );
      isAlreadyExists = errors.some((e: any) => {
        const msg = String(e?.descriptionError || e?.message || '').toLowerCase();
        return msg.includes('já consta no repositório') || msg.includes('já consta no repositório') || msg.includes('duplicada');
      });
    }

    const doc = documentStore.getDocument(documentId);
    const errMsg = String(error?.message || '');
    const errLower = errMsg.toLowerCase();
    const msgAlreadyExists =
      errLower.includes('já consta no repositório') ||
      errLower.includes('já consta no repositório') ||
      errLower.includes('duplicada');

    if ((isDuplicate || isAlreadyExists || msgAlreadyExists) && doc) {
        console.log(`[Sync] Document ${doc.id} already exists on AGT (E99). Marking as success.`);
        const token = response.submissionToken || response.agtToken || response.requestID || (doc as any).uuid || 'recovered-uuid';
        
        documentStore.updateDocument(doc.id, {
            agtSubmission: {
              status: 'success',
              agtToken: token,
              submissionDate: new Date().toISOString(),
              message: 'Synced successfully (Already exists)',
              mode: 'online'
            }
        } as any);
        agtAuditService.logDocumentSubmission(doc.id, doc.documentType, 'success', 'Synced from queue (E99)', { token });
        return res.status(200).json({ success: true, token });
    }

    if (doc && errMsg.toLowerCase().includes('timeout')) {
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'offline_pending',
          mode: 'offline',
          message: 'AGT timeout. Document queued for later submission.',
          submissionDate: new Date().toISOString()
        }
      } as any);
      return res.status(202).json({ success: false, pending: true, message: 'AGT timeout. Queued for later submission.' });
    }
    const isReceiptDoc = doc && ['recibo', 'aviso_cobranca_recibo', 'recibo_estorno', 'outros_recibos', 'factura_generica'].includes(String(doc.documentType));
    const isMissingOrigin = errMsg.toLowerCase().includes('documento de origem') || errMsg.includes('originatingON');
    if (doc && isReceiptDoc && isMissingOrigin) {
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'blocked',
          message: errMsg,
          submissionDate: new Date().toISOString(),
          mode: 'online'
        }
      } as any);
      return res.status(202).json({ success: false, pending: true, message: 'Blocked by missing origin on AGT' });
    }
    console.error('Error syncing document:', error);
    
    // Update with exception
    if (doc) {
      documentStore.updateDocument(doc.id, {
        agtSubmission: {
          status: 'error',
          message: error.message,
          submissionDate: new Date().toISOString()
        }
      } as any);
    }

    return res.status(500).json({ success: false, error: error.message });
  }
}
