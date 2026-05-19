import { NextApiRequest, NextApiResponse } from 'next';
import PythonPdfService from '../../../../services/PythonPdfService';
import PdfService from '../../../../services/PdfService';
import PdfCacheService from '../../../../services/PdfCacheService';
import { documentStore } from '../../../../lib/documentStore';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { companyJsonPath } from '@/lib/dataPaths';
import AgtService from '@/services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: documentId } = req.query;
    const { force } = req.query; // Optional parameter to force regeneration

    // Validate document ID
    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Check if document exists
    let document = documentStore.getDocument(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If draft, finalize to 'issued' to ensure hash/QR integrity
    if (document && document.status === 'draft') {
      const updated = documentStore.updateDocument(documentId, { status: 'issued' });
      if (updated) {
        document = updated;
      }
    }

    // Backfill hash for legacy issued documents that lack chained hash
    if (document && !document.hash && (document.status === 'issued' || document.status === 'paid')) {
      try {
        const sellerNif = document.seller?.nif || '';
        const year = new Date(document.issueDate).getFullYear();
        const series = document.series;
        const previousIssued = documentStore.getAllDocuments()
          .filter(d => (
            d.seller?.nif === sellerNif &&
            d.series === series &&
            new Date(d.issueDate).getFullYear() === year &&
            (d.status === 'issued' || d.status === 'paid') &&
            d.sequentialNumber < document!.sequentialNumber
          ))
          .sort((a, b) => b.sequentialNumber - a.sequentialNumber)[0];
        const prevHash = previousIssued?.hash || crypto.createHash('sha256')
          .update(`GENESIS|${sellerNif}|${series}|${year}`)
          .digest('hex');
        const payload = [
          document.uuid,
          series,
          String(document.sequentialNumber),
          document.issueDate,
          (document.totals?.total || 0).toFixed(2),
          prevHash,
        ].join('|');
        const hashHex = crypto.createHash('sha256').update(payload).digest('hex');
        document = { ...document, hash: hashHex, prevHash, hashAlgorithm: 'SHA256' };
      } catch {}
    }

    // Check Python and ReportLab availability
    const pythonPdfService = new PythonPdfService();
    const pythonAvailable = await pythonPdfService.checkPythonAvailability();
    const reportLabAvailable = await pythonPdfService.checkReportLabAvailability();

    if (!pythonAvailable || !reportLabAvailable) {
      return res.status(500).json({ 
        error: 'Python PDF generation not available',
        details: {
          python: pythonAvailable,
          reportlab: reportLabAvailable
        }
      });
    }

    // Check if PDF is cached and force regeneration is not requested
    const cacheKey = `python-${documentId}`;
    if (!force && await PdfCacheService.isCached(cacheKey)) {
      const cachedPdf = await PdfCacheService.getCachedPdf(cacheKey);
      if (cachedPdf) {
        // Set response headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
        res.setHeader('Content-Length', cachedPdf.length);
        res.setHeader('X-PDF-Source', 'cache-python'); // Indicate this is from cache
        
        // Send cached PDF buffer
        return res.send(cachedPdf);
      }
    }

    // Build seller from active company configuration (company.json)
    let activeSeller = document.seller;
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const cfg = JSON.parse(fs.readFileSync(companyPath, 'utf-8') || '{}');
        activeSeller = {
          name: cfg.name || cfg.tradeName || activeSeller.name,
          tradeName: cfg.tradeName || cfg.name || activeSeller.tradeName,
          address: cfg.address || activeSeller.address,
          nif: cfg.nif || activeSeller.nif,
          email: cfg.email || activeSeller.email,
          phone: cfg.phone || activeSeller.phone
        };
      }
    } catch {}

    // Transform document data for Python PDF generation
    const numberStr = await (new AgtService()).computeAgtDocumentNo(document as any);

    const documentData = {
      id: document.id,
      uuid: document.uuid,
      series: document.series,
      sequentialNumber: document.sequentialNumber,
      documentType: document.documentType,
      issueDate: new Date(document.issueDate),
      taxableDate: new Date(document.taxableDate),
      seller: activeSeller,
      buyer: document.buyer,
      items: document.lines.map(line => ({
        product: {
          code: line.sku || 'Service',
          name: line.description
        },
        description: line.description,
        unitPrice: line.unitPrice,
        unit: line.unit || 'UNI',
        quantity: line.quantity,
        discount: line.discount || 0,
        vatRate: line.vatRate || 14,
        total: line.total
      })),
      totals: {
        subtotal: document.totals.subtotal,
        discount: document.totals.discount || 0,
        tax: Number(Math.round(Number((document.totals.vatBreakdown?.reduce((sum, vat) => sum + vat.amount, 0) || 0) + 'e2')) + 'e-2'),
        total: document.totals.total
      },
      payment: document.payment,
      status: document.status,
      number: numberStr,
      hash: document.hash,
      prevHash: document.prevHash
    };

    // Generate PDF using Python service
    const outputPath = path.join(process.cwd(), 'public', 'pdfs', `document-${documentId}-python.pdf`);
    await pythonPdfService.generateDocumentPdf(parseInt(documentId), documentData, outputPath);

    // Read the generated PDF file
    const pdfBuffer = fs.readFileSync(outputPath);

    // Cache the generated PDF
    await PdfCacheService.storePdf(cacheKey, pdfBuffer);

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-PDF-Source', 'generated-python'); // Indicate this is newly generated with Python

    // Send PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF with Python:', error);
    res.status(500).json({ error: 'Failed to generate PDF with Python service' });
  }
}
