import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../../lib/documentStore';
import AgtService from '../../../../services/AgtService';
import documentValidationService from '../../../../services/DocumentValidationService';
import agtAuditService from '../../../../services/AgtAuditService';
import AgtServiceClass from '../../../../services/AgtService';

/**
 * API endpoint to submit a document to AGT
 * POST /api/documents/{id}/submit-agt
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Document ID is required' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    try {
      const cfg = await new AgtServiceClass().getActiveConfig();
      if ((cfg as any)?.submissionMode === 'offline') {
        const updated = documentStore.updateDocument(id, {
          agtSubmission: {
            status: 'offline_pending',
            mode: 'offline',
            submissionDate: new Date().toISOString()
          }
        } as any);
        agtAuditService.logDocumentSubmission(
          id,
          (updated as any)?.documentType || 'unknown',
          'success',
          'Marked for offline submission',
          { mode: 'offline' }
        );
        return res.status(202).json({
          success: true,
          message: 'Offline mode active. Document queued for later submission.',
          validation: { isValid: true, warnings: [] }
        });
      }
    } catch {}
    // Get document
    const document = documentStore.getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Validate document before submission
    const validation = documentValidationService.validateForAgtSubmission(document as any);
    
    if (!validation.isValid) {
      agtAuditService.logDocumentSubmission(
        id,
        document.documentType,
        'error',
        'Document validation failed',
        { errors: validation.errors, warnings: validation.warnings }
      );
      
      return res.status(400).json({
        error: 'Document validation failed',
        validation: {
          isValid: false,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    // Submit to AGT using REST interface (standard AGT endpoint)
    const agtService = new AgtService();
    // Use registarFactura instead of submitToAgt (which points to incorrect SAFT endpoint)
    let result: any;
    try {
      const response = await agtService.registarFactura(document as any);
      // Map AGT REST response to internal result format
      const rc = response?.resultCode;
      const numeric = typeof rc === 'string' ? parseInt(rc, 10) : Number(rc);
      const token = response?.submissionToken || response?.agtToken || response?.requestID || response?.successRequestID || 'AGT-OK';
      const isSuccess = numeric === 1;
      const isPending = numeric === 2 && token;

      if (isSuccess) {
         result = {
            success: true,
            token,
            message: 'Document submitted successfully (REST)'
         };
      } else if (isPending) {
         result = {
            success: false,
            pending: true,
            token,
            message: 'Submitted, awaiting processing'
         };
      } else {
         const resultCode = response?.resultCode;
         const errorList = response?.errorList;
         let errorDetails = '';
         
         if (Array.isArray(errorList) && errorList.length > 0) {
            errorDetails = errorList.map((e: any) => 
               typeof e === 'string' ? e : (e.description || e.code || JSON.stringify(e))
            ).join('; ');
         } else {
            errorDetails = `AGT Error (Code: ${resultCode !== undefined ? resultCode : 'undefined/network'}) - Full Response: ${JSON.stringify(response)}`;
         }

         result = {
            success: false,
            message: errorDetails
         };
      }
    } catch (err: any) {
       // Check for network errors to handle offline fallback
       const isNetworkError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || (err.message && err.message.includes('Network Error'));
       const msg = String(err?.message || '').toLowerCase();
       const alreadyExists = msg.includes('já consta no repositório') || msg.includes('já consta no repositório') || msg.includes('duplicada');
       if (alreadyExists) {
          result = {
             success: true,
             token: (document as any).uuid || String(id),
             message: 'Already exists on AGT'
          };
       } else {
          result = {
             success: false,
             isOffline: isNetworkError,
             message: err.message || 'Submission exception'
          };
       }
    }

    if (result.success) {
      // Update document with AGT submission info
      documentStore.updateDocument(id, {
        agtSubmission: {
          status: 'success',
          agtToken: result.token,
          submissionDate: new Date().toISOString(),
        },
      } as any);

      agtAuditService.logDocumentSubmission(
        id,
        document.documentType,
        'success',
        'Document submitted successfully to AGT',
        { token: result.token }
      );

      return res.status(200).json({
        success: true,
        message: result.message || 'Document submitted successfully to AGT',
        token: result.token,
        validation: {
          isValid: true,
          warnings: validation.warnings,
        },
      });
    } else if (result.pending && result.token) {
      documentStore.updateDocument(id, {
        agtSubmission: {
          status: 'pending',
          agtToken: String(result.token),
          submissionDate: new Date().toISOString(),
          message: result.message,
          mode: 'online'
        },
      } as any);
      return res.status(202).json({
        success: false,
        pending: true,
        message: result.message,
        token: result.token,
        validation: { isValid: true, warnings: validation.warnings },
      });
    } else if (result.isOffline) {
      // Handle offline/network error by queuing
      documentStore.updateDocument(id, {
        agtSubmission: {
          status: 'offline_pending',
          mode: 'offline',
          message: result.message,
          submissionDate: new Date().toISOString(),
        },
      } as any);

      agtAuditService.logDocumentSubmission(
        id,
        document.documentType,
        'error',
        'Network unavailable - Document queued for offline sync',
        { error: result.message }
      );

      return res.status(202).json({
        success: false,
        message: 'Network unavailable. Document queued for later submission.',
        validation: { isValid: true, warnings: [] }
      });
    } else {
      // Update document with error
      documentStore.updateDocument(id, {
        agtSubmission: {
          status: 'error',
          message: result.message,
          submissionDate: new Date().toISOString(),
        },
      } as any);

      agtAuditService.logDocumentSubmission(
        id,
        document.documentType,
        'error',
        result.message || 'Failed to submit document to AGT',
        { error: result.message }
      );

      return res.status(500).json({
        success: false,
        error: result.message || 'Failed to submit document to AGT',
        validation: {
          isValid: true,
          warnings: validation.warnings,
        },
      });
    }
  } catch (error: any) {
    console.error('Error submitting document to AGT:', error);
    try {
      const updated = documentStore.updateDocument(id, {
        agtSubmission: {
          status: 'offline_pending',
          mode: 'offline',
          message: error?.message || 'Network/timeout',
          submissionDate: new Date().toISOString()
        }
      } as any);
      agtAuditService.logDocumentSubmission(
        id as string,
        (updated as any)?.documentType || 'unknown',
        'error',
        error.message || 'Internal server error',
        { fallback: 'queued_offline' }
      );
    } catch {}
    
    agtAuditService.logDocumentSubmission(
      id as string,
      'unknown',
      'error',
      error.message || 'Internal server error',
      { error: error.message }
    );

    return res.status(202).json({
      success: false,
      message: 'Temporary issue contacting AGT. Document queued for offline sync.',
    });
  }
}
