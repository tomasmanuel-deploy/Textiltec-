import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '@/lib/documentStore';
import AgtService from '@/services/AgtService';
import documentValidationService from '@/services/DocumentValidationService';
import agtAuditService from '@/services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : (typeof req.body?.id === 'string' ? req.body.id : '');
  if (!id) return res.status(400).json({ error: 'Document ID is required' });
  const doc = documentStore.getDocument(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const validation = documentValidationService.validateForAgtSubmission(doc as any);
  if (!validation.isValid) {
    agtAuditService.logDocumentSubmission(id, doc.documentType, 'error', 'Validation failed', { errors: validation.errors, warnings: validation.warnings });
    return res.status(400).json({ error: 'Validation failed', validation });
  }
  try {
    const svc = new AgtService();
    const resp = await svc.registarFactura(doc as any);
    agtAuditService.logDocumentSubmission(id, doc.documentType, 'success', 'registarFactura called', { resp });
    return res.status(200).json(resp);
  } catch (e: any) {
    agtAuditService.logDocumentSubmission(id, doc.documentType, 'error', e?.message || 'Error calling registarFactura', { error: e?.message });
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
