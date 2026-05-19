import { NextApiRequest, NextApiResponse } from 'next';
import PdfCacheService from '../../../../services/PdfCacheService';
import { documentStore } from '../../../../lib/documentStore';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: documentId } = req.query;

    // Validate document ID
    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Check if document exists
    const document = documentStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if PDF is cached
    const isCached = await PdfCacheService.isCached(documentId);
    
    let cacheInfo = null;
    if (isCached) {
      try {
        const cachePath = path.join(process.cwd(), 'public', 'pdfs', `document-${documentId}.pdf`);
        const stats = fs.statSync(cachePath);
        cacheInfo = {
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          url: PdfCacheService.getCachedPdfUrl(documentId)
        };
      } catch (error) {
        console.error('Error getting cache info:', error);
      }
    }

    res.status(200).json({
      documentId,
      document: {
        sequentialNumber: document.sequentialNumber,
        documentType: document.documentType,
        issueDate: document.issueDate,
        buyer: document.buyer
      },
      pdf: {
        cached: isCached,
        cacheInfo,
        generateUrl: `/api/documents/${documentId}/pdf`,
        viewUrl: isCached ? `/api/documents/${documentId}/view` : null
      }
    });
  } catch (error) {
    console.error('Error checking PDF status:', error);
    res.status(500).json({ error: 'Failed to check PDF status' });
  }
}