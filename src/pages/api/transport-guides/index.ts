import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import fs from 'fs';
import path from 'path';
import { companyJsonPath } from '@/lib/dataPaths';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  switch (method) {
    case 'GET': {
      try {
        // Filter transport guides by active company
        let activeNif = '';
        let activeName = '';
        let activeTradeName = '';
        try {
          const companyPath = companyJsonPath();
          if (fs.existsSync(companyPath)) {
            const raw = fs.readFileSync(companyPath, 'utf-8');
            const cfg = raw ? JSON.parse(raw) : {};
            activeNif = cfg.nif || '';
            activeName = cfg.name || '';
            activeTradeName = cfg.tradeName || '';
          }
        } catch {}

        const norm = (s: any) => String(s || '').trim().toLowerCase();
        const docs = documentStore
          .getAllDocuments()
          .filter((d: any) => d.documentType === 'nota_de_entrega')
          .filter((d: any) => {
            const s = d.seller || {};
            return (activeNif && s.nif && norm(s.nif) === norm(activeNif))
              || (activeTradeName && s.tradeName && norm(s.tradeName) === norm(activeTradeName))
              || (activeName && s.name && norm(s.name) === norm(activeName));
          });
        return res.status(200).json({ transportGuides: docs, total: docs.length });
      } catch (e) {
        console.error('Error listing transport guides:', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    case 'POST': {
      try {
        const body = req.body || {};
        const { buyer, lines, payment, sourceDocumentIds } = body;
        if (!buyer || !lines || !Array.isArray(lines) || lines.length === 0) {
          return res.status(400).json({ error: 'Campos obrigatórios: buyer, lines' });
        }
        const created = documentStore.createDocument({
          documentType: 'nota_de_entrega',
          buyer,
          lines,
          payment: payment || { method: 'other', status: 'pending' },
          // Persist references to source documents for audit/history
          relatedDocuments: Array.isArray(sourceDocumentIds) ? sourceDocumentIds : []
        });
        return res.status(201).json({ message: 'Guia criada', guide: created });
      } catch (e) {
        console.error('Error creating transport guide:', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method not allowed' });
  }
}