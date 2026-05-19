import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../../lib/documentStore';
import AgtService from '../../../../services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id: documentId } = req.query;

  // Validate document ID
  if (!documentId || typeof documentId !== 'string') {
    return res.status(400).json({ error: 'Invalid document ID' });
  }

  if (req.method === 'GET') {
    // Get single document
    try {
      // 1) Try by internal ID
      let document = documentStore.getDocument(documentId);
      
      // 2) Fallback: if not found and the provided ID looks like an AGT docNo (e.g., "RG RG7926S70187C/0004"),
      // try to resolve by document number
      if (!document) {
        try {
          const raw = decodeURIComponent(documentId);
          const hasSlash = raw.includes('/');
          const hasSpace = raw.includes(' ');
          if (hasSlash && hasSpace) {
            const AgtServiceModule = await import('../../../../services/AgtService');
            const AgtServiceClass = (AgtServiceModule as any).default || (AgtServiceModule as any).AgtService;
            const agtService = new AgtServiceClass();
            const all = documentStore.getAllDocuments();
            for (const d of all) {
              try {
                const docNo = await agtService.computeAgtDocumentNo(d as any);
                if (docNo === raw || decodeURIComponent(docNo) === raw) {
                  document = d;
                  break;
                }
              } catch {}
            }
          }
        } catch {}
      }
      
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.status(200).json({ document });
    } catch (error) {
      console.error('Error getting document:', error);
      res.status(500).json({ error: 'Failed to get document' });
    }
  } else if (req.method === 'PUT') {
    // Update document
    try {
      const updateData = req.body;

      // Validate unit price for invoices on update (PUT)
      try {
        const existing = documentStore.getDocument(documentId);
        const type = String(existing?.documentType || updateData?.documentType || '').toLowerCase();
        if (type === 'factura' && Array.isArray(updateData?.lines)) {
          const invalid = updateData.lines.filter((l: any) => Number(l?.unitPrice) <= 0);
          if (invalid.length) {
            return res.status(400).json({
              error: 'Nenhuma linha de factura pode ter preço unitário igual ou inferior a 0'
            });
          }
        }
      } catch {}
      
      const updatedDocument = documentStore.updateDocument(documentId, updateData);
      
      if (!updatedDocument) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Auto-submit to AGT if status changed to final
      try {
        const submittableTypes = [
          'factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito',
          'ft', 'fr', 'rc', 'nc', 'nd',
          'factura_generica', 'gf',
          'factura_global', 'fg',
          'factura_adiantamento', 'fa',
          'factura_recibo_autofacturacao', 'af',
          'recibo_estorno', 're',
          'aviso_cobranca_recibo', 'ar',
          'outros_recibos', 'rg',
          'aviso_cobranca', 'ac',
          'nota_de_entrega', 'gr'
          // 'proforma'/'pp' removed due to AGT error E03
        ];
        const isFinal = updatedDocument.status === 'issued' || updatedDocument.status === 'paid';
        
        // Check if AGT submission is needed (online mode + final status + not already submitted successfully)
        if (isFinal && submittableTypes.includes(updatedDocument.documentType)) {
             const agtService = new AgtService();
             const config = await agtService.getActiveConfig();
             
             if (config.submissionMode === 'online' && updatedDocument.agtSubmission?.status !== 'success') {
               const pendingUpdate = documentStore.updateDocument(updatedDocument.id, {
                 agtSubmission: {
                   status: 'pending',
                   submissionDate: new Date().toISOString(),
                   message: 'Queued for online submission',
                   mode: 'online'
                 }
               } as any);
               if (pendingUpdate) Object.assign(updatedDocument, pendingUpdate);
             } else if (config.submissionMode === 'offline') {
               const offlineUpdate = documentStore.updateDocument(updatedDocument.id, {
                 agtSubmission: {
                   status: 'offline_pending',
                   mode: 'offline',
                   submissionDate: new Date().toISOString()
                 }
               } as any);
               if (offlineUpdate) Object.assign(updatedDocument, offlineUpdate);
             }
        }
      } catch (agtError: any) {
         console.error('AGT Auto-submit error in PUT:', agtError);
         // Try to log error to document if possible
         try {
            const errorUpdate = documentStore.updateDocument(documentId, {
                agtSubmission: {
                    status: 'error',
                    message: `Exception in PUT: ${agtError.message}`,
                    submissionDate: new Date().toISOString()
                }
            } as any);
         } catch {}
      }

      res.status(200).json({
        message: 'Document updated successfully',
        document: updatedDocument
      });
    } catch (error) {
      console.error('Error updating document:', error);
      if (error instanceof Error && error.message.includes('Cannot update document')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update document' });
      }
    }
  } else if (req.method === 'DELETE') {
    // Delete document
    try {
      const success = documentStore.deleteDocument(documentId);
      
      if (!success) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.status(200).json({
        message: 'Document deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      if (error instanceof Error && error.message.includes('Cannot delete document')) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete document' });
      }
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
