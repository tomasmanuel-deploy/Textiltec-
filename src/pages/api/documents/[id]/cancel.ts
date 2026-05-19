import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../../lib/documentStore';
import PdfCacheService from '../../../../services/PdfCacheService';

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
    const { reason } = req.body || {};

    // AGT compliance: disallow cancelling credit notes
    const existing = documentStore.getDocument(id);
    if (!existing) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (existing.documentType === 'nota_de_credito') {
      return res.status(400).json({ error: 'Não é permitido cancelar nota de crédito segundo AGT' });
    }

    // Business rule: Proformas, Orçamentos e Notas de Entrega não podem ser anulados
    if (
      existing.documentType === 'proforma' ||
      existing.documentType === 'orçamento' ||
      existing.documentType === 'nota_de_entrega'
    ) {
      return res.status(400).json({ error: 'Proformas, Orçamentos e Notas de Entrega não podem ser anulados' });
    }

    const updated = documentStore.cancelDocument(id);
    if (!updated) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Clear cached PDF to avoid serving outdated content
    try {
      await PdfCacheService.clearCache(id);
    } catch {}

    // Attach reason to cancellation metadata if provided
    if (reason && typeof reason === 'string' && reason.trim()) {
      updated.cancellation = {
        ...updated.cancellation,
        reason: reason.trim(),
      };
      // persist
      // We rely on documentStore save; update directly into store
      // (minor write-through)
      const stored = (documentStore as any);
      if (stored && stored.documents && stored.documents[id]) {
        stored.documents[id] = updated;
        if (typeof stored.saveDocuments === 'function') {
          stored.saveDocuments();
        }
      }
    }

    const related = updated.relatedDocuments || [];
    const creditNote = related
      .map((rid: string) => documentStore.getDocument(rid))
      .filter((d) => d && d.documentType === 'nota_de_credito')
      .pop() || null;

    return res.status(200).json({
      message: 'Invoice cancelled successfully',
      document: updated,
      creditNote,
    });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}