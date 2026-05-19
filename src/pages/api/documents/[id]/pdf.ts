import { NextApiRequest, NextApiResponse } from 'next';
import PdfService from '../../../../services/PdfService';
import PdfCacheService from '../../../../services/PdfCacheService';
import AgtService from '../../../../services/AgtService';
import { documentStore } from '../../../../lib/documentStore';
import fs from 'fs';
import crypto from 'crypto';
import { companyJsonPath } from '@/lib/dataPaths';

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
            d.sequentialNumber < (document as any).sequentialNumber
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

    // Check if PDF is cached and force regeneration is not requested
    if (!force && await PdfCacheService.isCached(documentId)) {
      // Check if cache is stale compared to document update time
      const stats = await PdfCacheService.getPdfStats(documentId);
      const cacheTime = stats ? stats.mtime.getTime() : 0;
      const docTime = new Date(document.updatedAt).getTime();

      // Only use cache if it's newer than the document update
      // Add a small buffer (1s) to avoid race conditions where generation happens same second
      if (cacheTime >= docTime - 1000) {
        const cachedPdf = await PdfCacheService.getCachedPdf(documentId);
        if (cachedPdf) {
          // Set response headers for PDF
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
          res.setHeader('Content-Length', cachedPdf.length);
          res.setHeader('X-PDF-Source', 'cache'); // Indicate this is from cache
          
          // Send cached PDF buffer
          return res.send(cachedPdf);
        }
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
      lines: document.lines.map(line => ({
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit || 'un', // Use unit if present, default to 'un'
        unitPrice: line.unitPrice,
        discount: line.discount,
        vatRate: line.vatRate,
        vatExemptionReason: (line as any).vatExemptionReason,
        lineTotal: line.total
      })),
      totals: {
        taxableBase: document.totals.subtotal,
        vatBreakdown: document.totals.vatBreakdown,
        subtotal: document.totals.subtotal,
        discountTotal: document.totals.discount,
        rounding: 0,
        grandTotal: document.totals.total,
        currency: 'AOA'
      },
      payment: {
        method: document.payment.method as 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other',
        status: document.payment.status as 'pending' | 'partial' | 'paid',
        dueDate: document.payment.dueDate ? new Date(document.payment.dueDate) : undefined,
        paidAmount: document.payment.paidAmount,
        paidDate: document.payment.paidDate ? new Date(document.payment.paidDate) : undefined,
        reference: undefined
      },
      status: document.status,
      agtSubmission: {
        status: 'draft' as const,
        agtToken: undefined,
        requestPayload: undefined,
        responsePayload: undefined,
        submissionDate: undefined,
        errorMessage: undefined
      },
      createdAt: new Date(document.createdAt),
      // Real chained hash fields from the store
      hash: document.hash,
      prevHash: document.prevHash,
      hashAlgorithm: document.hashAlgorithm || 'SHA256',
      // Pass reference fields to PDF service
      relatedDocuments: document.relatedDocuments,
      referenceInvoiceNo: document.referenceInvoiceNo,
      referenceInvoiceDate: document.referenceInvoiceDate,
      debitNoteReason: document.debitNoteReason,
      expenseRepass: document.expenseRepass,
      referenceText: document.referenceText,
    };

    // Generate PDF using PdfService
    const pdfService = new PdfService();
    const pdfBuffer = await pdfService.generatePdf(documentData as any);

    // Cache the generated PDF
    await PdfCacheService.storePdf(documentId, pdfBuffer);

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="document-${documentId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-PDF-Source', 'generated'); // Indicate this is newly generated

    // Send PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
