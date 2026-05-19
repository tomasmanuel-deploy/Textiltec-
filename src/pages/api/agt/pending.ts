import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import AgtService from '../../../services/AgtService';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get active company info for filtering
    let activeNif = '';
    let activeName = '';
    let activeTradeName = '';
    try {
      await connectToDatabase();
      const activeCompany = await Company.findOne({ isDefault: true }).lean();
      if (activeCompany) {
        activeNif = activeCompany.nif || '';
        activeName = activeCompany.name || '';
        activeTradeName = activeCompany.tradeName || '';
      }
    } catch (err) {
      console.error('Error fetching active company for AGT pending filtering:', err);
    }
    const hasActiveCompanyFilter = Boolean(String(activeNif || '').trim() || String(activeName || '').trim() || String(activeTradeName || '').trim());
    const norm = (s: any) => String(s || '').trim().toLowerCase();

    const shouldPoll = String(req.query.poll || '').toLowerCase() === 'true';
    if (shouldPoll) {
      try {
        const svc = new AgtService();
        const now = Date.now();
        const candidates = documentStore.getAllDocuments()
          .filter(doc => String(doc.agtSubmission?.status || '').toLowerCase() === 'pending' && typeof doc.agtSubmission?.agtToken === 'string' && doc.agtSubmission.agtToken)
          .filter(doc => {
            const submittedAt = doc.agtSubmission?.submissionDate ? new Date(doc.agtSubmission.submissionDate).getTime() : 0;
            if (!(submittedAt > 0 && (now - submittedAt) > 15_000)) return false;
            const lastPollAt = doc.agtSubmission?.lastPollAt ? new Date(String(doc.agtSubmission.lastPollAt)).getTime() : 0;
            return !(lastPollAt > 0 && (now - lastPollAt) < 30_000); // Reduced poll cooldown from 60s to 30s
          })
          .slice(0, 3); // Process 3 candidates instead of 1

        for (const doc of candidates) {
          const token = String(doc.agtSubmission?.agtToken || '');
          if (!token) continue;
          try {
            const estado = await Promise.race([
              svc.obterEstado(token),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 45000))
            ]);
            const reqErrors = Array.isArray((estado as any)?.requestErrorList) ? (estado as any).requestErrorList : [];
            const notFound = reqErrors.some((e: any) => {
              const code = String(e?.idError || e?.code || '').trim().toUpperCase();
              const desc = String(e?.descriptionError || e?.message || '').toLowerCase();
              return code === 'E94' || desc.includes('solicita') && desc.includes('não encontrada');
            });
            if (notFound) {
              const msg = reqErrors
                .map((e: any) => String(e?.descriptionError || e?.message || e?.idError || e?.code || ''))
                .filter(Boolean)
                .join('; ') || 'Solicitação não encontrada.';
              documentStore.updateDocument(doc.id, {
                agtSubmission: {
                  status: 'error',
                  message: `AGT pending token invalid/expired: ${msg}. Will retry submission.`,
                  submissionDate: new Date().toISOString(),
                  mode: 'online'
                }
              } as any);
              continue;
            }
            const list = Array.isArray(estado?.documentStatusList) ? estado.documentStatusList : [];
            const errors: string[] = [];
            for (const entry of list) {
              const entryErrors = Array.isArray(entry?.errorList) ? entry.errorList : [];
              for (const e of entryErrors) {
                if (!e) continue;
                const msg = String(e.descriptionError || e.message || e.description || e.idError || e.code || '').trim();
                if (msg) errors.push(msg);
              }
            }

            if (errors.length > 0) {
              documentStore.updateDocument(doc.id, {
                agtSubmission: {
                  status: 'error',
                  message: errors.join('; '),
                  submissionDate: new Date().toISOString(),
                  mode: 'online'
                }
              } as any);
              continue;
            }

            const numeric = typeof estado?.resultCode === 'string' ? parseInt(estado.resultCode, 10) : Number(estado?.resultCode);
            const processed =
              numeric === 1 ||
              String(estado?.status || '').toUpperCase() === 'PROCESSADO' ||
              list.some((entry: any) => {
                const s = String(entry?.status || entry?.documentStatus || entry?.documentState || '').toUpperCase();
                return s.includes('PROCESSADO');
              });
            if (processed) {
              documentStore.updateDocument(doc.id, {
                agtSubmission: {
                  status: 'success',
                  agtToken: token,
                  submissionDate: new Date().toISOString(),
                  message: 'Synced successfully',
                  mode: 'online'
                }
              } as any);
              continue;
            }

            documentStore.updateDocument(doc.id, {
              agtSubmission: {
                ...(documentStore.getDocument(doc.id) as any)?.agtSubmission,
                status: 'pending',
                agtToken: token,
                mode: 'online',
                lastPollAt: new Date().toISOString()
              }
            } as any);
          } catch {
            documentStore.updateDocument(doc.id, {
              agtSubmission: {
                ...(documentStore.getDocument(doc.id) as any)?.agtSubmission,
                status: 'pending',
                agtToken: token,
                mode: 'online',
                lastPollAt: new Date().toISOString()
              }
            } as any);
          }
        }
      } catch {}
    }

    const allDocs = documentStore.getAllDocuments();
    
    // Submittable types per AGT (FT, FR, NC, ND, RC, GR)
    // Using normalized types
    const submittableTypes = [
      'factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito',
      'ft', 'fr', 'rc', 'nc', 'nd',
      'factura_generica', 'factura_global', 'factura_adiantamento',
      'factura_recibo_autofacturacao', 'recibo_estorno', 'aviso_cobranca_recibo', 'outros_recibos', 'aviso_cobranca',
      'nota_de_entrega', 'gr'
    ];

    try {
      const now = Date.now();
      const autoIssueTypes = new Set([
        'factura', 'factura_generica', 'factura_global', 'factura_adiantamento',
        'factura_recibo', 'factura_recibo_autofacturacao',
        'nota_de_credito', 'nota_de_debito', 'nota_de_entrega', 'aviso_cobranca',
        'ft', 'fr', 'nc', 'nd', 'gr'
      ]);

      const candidates = allDocs
        .filter(d => d.status === 'draft')
        .filter(d => autoIssueTypes.has(String(d.documentType || '').toLowerCase()))
        .filter(d => d.series && d.sequentialNumber && d.issueDate)
        .filter(d => {
          const createdAt = (d as any).createdAt ? new Date((d as any).createdAt).getTime() : 0;
          return createdAt > 0 ? (now - createdAt) < 7 * 24 * 60 * 60 * 1000 : true;
        })
        .slice(0, 20);

      for (const d of candidates) {
        documentStore.updateDocument(d.id, {
          status: 'issued',
          payment: {
            ...(d.payment || {}),
            status: d.payment?.status || 'pending'
          }
        } as any);
      }
    } catch {}

    const refreshedDocs = documentStore.getAllDocuments();
    try {
      for (const d of refreshedDocs) {
        if (String(d.agtSubmission?.status || '').toLowerCase() !== 'error') continue;
        const msg = String(d.agtSubmission?.message || '').toLowerCase();
        const alreadyExists =
          msg.includes('já consta no repositório') ||
          msg.includes('já consta no repositório') ||
          msg.includes('duplicada');
        if (!alreadyExists) continue;
        documentStore.updateDocument(d.id, {
          agtSubmission: {
            ...(documentStore.getDocument(d.id) as any)?.agtSubmission,
            status: 'success',
            message: 'Synced successfully (Already exists)',
            submissionDate: new Date().toISOString(),
            mode: 'online'
          }
        } as any);
      }
    } catch {}

    const pendingDocs = refreshedDocs.filter(doc => {
      const type = String(doc.documentType || '').toLowerCase();
      
      // Must be a submittable type
      if (!submittableTypes.includes(type)) return false;

      // Must be a final document (issued or paid, not draft or cancelled without being issued first)
      // Actually, cancelled docs also need to be communicated if they were signed/issued.
      // But usually we sync the cancellation event separately or just the document status.
      // For now, focus on documents that are finalized.
      const isFinal = doc.status === 'issued' || doc.status === 'paid' || doc.status === 'cancelled';
      if (!isFinal) return false;

      // Check AGT submission status
      const agtStatus = doc.agtSubmission?.status;

      // Return true if:
      // 1. Explicitly marked as offline_pending
      // 2. Marked as error (retry)
      // 3. No submission status at all (and it's a final doc) - this might be a legacy doc or missed submission
      // 4. Pending (stuck)
      // 5. Blocked (waiting for origin)
      
      if (agtStatus === 'offline_pending') return true;
      if (agtStatus === 'error') return true;
      if (agtStatus === 'pending') return true;
      if (agtStatus === 'blocked') return true;
      
      // If no status, and it's final, it needs sync
      if (!agtStatus) return true;

      return false;
    }).filter(doc => {
      // Filter by active company
      if (!hasActiveCompanyFilter) return true;
      const s = (doc as any).seller || {};
      return (activeNif && s.nif && norm(s.nif) === norm(activeNif))
        || (activeTradeName && s.tradeName && norm(s.tradeName) === norm(activeTradeName))
        || (activeName && s.name && norm(s.name) === norm(activeName));
    }).map(doc => ({
      id: doc.id,
      documentType: doc.documentType,
      series: doc.series,
      sequentialNumber: doc.sequentialNumber,
      date: doc.issueDate,
      total: doc.totals?.total || 0,
      status: doc.agtSubmission?.status || 'pending',
      error: doc.agtSubmission?.message
    }));

    return res.status(200).json({ pending: pendingDocs, count: pendingDocs.length });
  } catch (error: any) {
    console.error('Error fetching pending AGT documents:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
