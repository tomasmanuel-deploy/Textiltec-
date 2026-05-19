import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import AgtService from '../../../services/AgtService';
import agtAuditService from '../../../services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const svc = new AgtService();
    const cfg = await svc.getActiveConfig();
    const maxBatch = 5;
    const docs = documentStore.getAllDocuments()
      .filter((d: any) => String(d?.agtSubmission?.status || '').toLowerCase() === 'offline_pending')
      .slice(0, maxBatch);

    if (req.method === 'GET') {
      return res.status(200).json({ pending: docs.length, ids: docs.map((d: any) => d.id) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const results: any[] = [];
    for (const d of docs) {
      try {
        const resp = await svc.registarFactura(d as any);
        const requestID = (resp as any)?.requestID || (resp as any)?.requestId || '';
        documentStore.updateDocument(d.id, {
          agtSubmission: {
            status: requestID ? 'submitted' : 'error',
            mode: 'offline',
            requestID: requestID || undefined,
            submissionDate: new Date().toISOString(),
            responsePayload: JSON.stringify(resp)
          }
        } as any);
        agtAuditService.logDocumentSubmission(
          d.id,
          d.documentType,
          requestID ? 'success' : 'error',
          requestID ? 'Submitted pending offline document' : 'Submission returned without requestID',
          { requestID }
        );
        let estado: any = null;
        if (requestID) {
          try {
            estado = await svc.obterEstado(requestID);
            const statusList = (estado as any)?.documentStatusList || [];
            const docStatus = Array.isArray(statusList) && statusList[0] ? statusList[0].documentStatus : '';
            documentStore.updateDocument(d.id, {
              agtSubmission: {
                ...(documentStore.getDocument(d.id) as any)?.agtSubmission,
                agtStatus: docStatus || undefined,
                lastPollAt: new Date().toISOString(),
                estadoPayload: JSON.stringify(estado)
              }
            } as any);
          } catch (e: any) {
            agtAuditService.logDocumentSubmission(
              d.id,
              d.documentType,
              'error',
              e?.message || 'Erro ao obter estado',
              {}
            );
          }
        }
        results.push({ id: d.id, requestID, estado });
      } catch (e: any) {
        documentStore.updateDocument(d.id, {
          agtSubmission: {
            status: 'error',
            mode: 'offline',
            errorMessage: e?.message || 'Erro desconhecido',
            submissionDate: new Date().toISOString(),
          }
        } as any);
        agtAuditService.logDocumentSubmission(
          d.id,
          d.documentType,
          'error',
          e?.message || 'Erro na submissão offline',
          {}
        );
        results.push({ id: d.id, error: e?.message || 'Erro' });
      }
    }

    return res.status(200).json({ processed: results.length, results });
  } catch (e: any) {
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}

