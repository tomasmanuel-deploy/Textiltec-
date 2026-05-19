import { NextApiRequest, NextApiResponse } from 'next';
import PdfCacheService from '../../../../services/PdfCacheService';
import { documentStore } from '../../../../lib/documentStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: documentId } = req.query;
    const { force } = req.query as any;

    // Validate document ID
    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Check if document exists
    const document = documentStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (String(force || '').toLowerCase() === 'true') {
      try {
        const PdfService = (await import('../../../../services/PdfService')).default;
        const PdfCacheService = (await import('../../../../services/PdfCacheService')).default;
        const svc = new PdfService();
        const pdfBuffer = await svc.generatePdf(document as any);
        await PdfCacheService.storePdf(documentId, pdfBuffer);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('X-PDF-Source', 'generated-view-force');
        return res.send(pdfBuffer);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
    }

    // Check if PDF is cached
    const isCached = await PdfCacheService.isCached(documentId);
    
    if (!isCached) {
      try {
        const PdfService = (await import('../../../../services/PdfService')).default;
        const svc = new PdfService();
        const pdfBuffer = await svc.generatePdf(document as any);
        await PdfCacheService.storePdf(documentId, pdfBuffer);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('X-PDF-Source', 'generated-view-miss');
        return res.send(pdfBuffer);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
      }
    }

    // Get cached PDF
    const cachedPdf = await PdfCacheService.getCachedPdf(documentId);
    
    if (!cachedPdf) {
      return res.status(500).json({ error: 'Failed to retrieve cached PDF' });
    }

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
    res.setHeader('Content-Length', cachedPdf.length);
    res.setHeader('X-PDF-Source', 'cache');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Send cached PDF buffer
    res.send(cachedPdf);
  } catch (error) {
    console.error('Error retrieving cached PDF:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF' });
  }
}
