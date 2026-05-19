import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import { productStore } from '../../../lib/productStore';
import { seriesStore } from '../../../lib/seriesStore';
import fs from 'fs';
import path from 'path';
import { companyJsonPath } from '@/lib/dataPaths';
import { clientStore } from '../../../lib/clientStore';
import AgtService from '../../../services/AgtService';
import connectToDatabase from '@/lib/mongoose';
import Product from '@/models/Product';
import Company from '@/models/Company';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // List documents
    try {
      const includeAll = String((req.query as any)?.includeAll || '').toLowerCase() === 'true';
      const page = req.query.page ? parseInt(String(req.query.page)) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit)) : undefined;
      const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

      // Determine active company fields to filter documents
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
        console.error('Error fetching active company for document filtering:', err);
      }
      const hasActiveCompanyFilter = Boolean(String(activeNif || '').trim() || String(activeName || '').trim() || String(activeTradeName || '').trim());

      // If pagination is requested, use optimized path
      if (page && limit) {
        const filters: any = {};
        
        // Only apply company filters if NOT includeAll
        if (!includeAll && hasActiveCompanyFilter) {
           filters.nif = activeNif;
           filters.tradeName = activeTradeName;
           filters.name = activeName;
        }

        if (clientId) filters.clientId = clientId;
        if (req.query.type) filters.type = String(req.query.type);

        const result = documentStore.getPaginatedDocuments(page, limit, filters);
        return res.status(200).json(result);
      }

      // Fallback to legacy full list (for exports or non-paginated views)
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      const documents = documentStore
        .getAllDocuments()
        .filter(d => {
          // Filter by client ID if provided
          if (clientId && (d.buyer as any)?.id !== clientId && (d as any).selectedClientId !== clientId) {
             // If we can't reliably match client ID, we might skip or rely on NIF. 
             // But existing code didn't filter by clientId here in the main block? 
             // Wait, the existing code didn't have clientId filter in the main block shown in Read output.
             // It was filtering by active company.
          }
          
          if (includeAll || !hasActiveCompanyFilter) return true;
          const s = (d as any).seller || {};
          return (activeNif && s.nif && norm(s.nif) === norm(activeNif))
            || (activeTradeName && s.tradeName && norm(s.tradeName) === norm(activeTradeName))
            || (activeName && s.name && norm(s.name) === norm(activeName));
        });
        
      // Apply client filter if requested (legacy mode)
      const filteredDocs = clientId 
        ? documents.filter(d => (d.buyer as any)?.id === clientId || (d as any).selectedClientId === clientId)
        : documents;

      res.status(200).json({
        documents: filteredDocs,
        total: filteredDocs.length
      });
    } catch (error) {
      console.error('Error listing documents:', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  } else if (req.method === 'POST') {
    // Create new document
    try {
      const documentData = req.body;
      const isCompliance = String((req.query as any)?.compliance || '').toLowerCase() === 'true'
        || String((req.headers as any)['x-compliance-override'] || '').toLowerCase() === 'true';
      
      // Validate required fields
      if (!documentData.documentType || !documentData.buyer || !documentData.lines) {
        return res.status(400).json({ 
          error: 'Missing required fields: documentType, buyer, lines' 
        });
      }

      try {
        if (String(documentData.documentType) === 'aviso_cobranca') {
          const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
          if (lines.length === 0) {
            const rel = Array.isArray(documentData.relatedDocuments) ? documentData.relatedDocuments : [];
            if (!rel.length) {
              return res.status(400).json({ error: 'Aviso de cobrança deve referenciar uma Factura/Factura‑Recibo em dívida.' });
            }
            const originId = String(rel[0]);
            const origin = documentStore.getDocument(originId);
            if (!origin) {
              return res.status(400).json({ error: 'Documento de referência não encontrado' });
            }
            const originTotal = Number((origin.totals as any)?.total ?? (origin.totals as any)?.grandTotal ?? 0);
            const originPaid = Number((origin.payment as any)?.paidAmount ?? 0);
            const outstanding = Math.max(originTotal - originPaid, 0);
            if (outstanding <= 0) {
              return res.status(400).json({ error: 'O documento de referência não possui valor em dívida.' });
            }
            documentData.lines = [
              {
                sku: 'SERV-AC',
                description: `Aviso de Cobrança referente ao documento ${origin.series}/${origin.sequentialNumber}`,
                quantity: 1,
                unit: 'Un',
                unitPrice: outstanding,
                discount: 0,
                vatRate: 0,
                vatExemptionReason: 'Operação não sujeita a IVA - Aviso de Cobrança',
                total: outstanding
              }
            ];
          }
        }
      } catch {}

      // Validate lines presence and non-empty (except for receipt-like documents)
      const isReceiptDoc = ['recibo', 'aviso_cobranca_recibo', 'recibo_estorno', 'outros_recibos'].includes(String(documentData.documentType));
      if (!isReceiptDoc) {
        if (!Array.isArray(documentData.lines) || documentData.lines.length === 0) {
          return res.status(400).json({ error: 'O documento deve conter pelo menos um item (produto/serviço).' });
        }
      }

      // Validate total value > 0 (Calculated from lines if totals not present, or verify provided totals)
      const calculatedTotal = isReceiptDoc && (!Array.isArray(documentData.lines) || documentData.lines.length === 0)
        ? Number(documentData.payment?.paidAmount || documentData.totals?.total || 0)
        : documentData.lines.reduce((sum: number, line: any) => {
            const lineTotal = Number(line.total);
            if (!isNaN(lineTotal) && lineTotal !== 0) {
              return sum + lineTotal;
            }
            // Fallback: calculate from qty * price (and include VAT if possible)
            const qty = Number(line.quantity) || 0;
            const price = Number(line.unitPrice) || 0;
            const disc = Number(line.discount) || 0;
            const vat = Number(line.vatRate) || 0;
            
            const sub = qty * price;
            const net = sub - (sub * disc / 100);
            const tax = net * (vat / 100);
            return sum + (net + tax);
          }, 0);
      
      console.log(`[DocumentValidation] Calculated Total: ${calculatedTotal} (from lines: ${documentData.lines.length})`);

      // Allow 0 value only for specific types if necessary (e.g. Proforma might be 0? No, user said "todos documentos")
      // But let's be strict as requested.
      if (calculatedTotal <= 0 && documentData.documentType !== 'nota_de_entrega') {
         // Notas de Entrega podem ter valor 0? Usually they have value but no payment.
         // Let's stick to the user's error message which implies they expect > 0.
         return res.status(400).json({ error: isReceiptDoc ? `O valor do recibo deve ser superior a 0.00 Kz.` : `O valor total do documento deve ser superior a 0.00 Kz. (Calculado: ${calculatedTotal.toFixed(2)})` });
      }

      // Restrição: Nota de Crédito só pode referenciar FT, FR ou RC
      if (String(documentData.documentType) === 'nota_de_credito') {
        const rel = Array.isArray(documentData.relatedDocuments) ? documentData.relatedDocuments : [];
        if (!rel.length) {
          return res.status(400).json({ error: 'Nota de crédito deve referenciar um documento de origem' });
        }
        const originId = String(rel[0]);
        const origin = documentStore.getDocument(originId);
        if (!origin) {
          return res.status(400).json({ error: 'Documento de origem não encontrado' });
        }
        const allowedOrigins = ['factura_recibo', 'factura', 'recibo'];
        if (!allowedOrigins.includes(String(origin.documentType))) {
          return res.status(400).json({ error: 'Nota de crédito só pode ser emitida para Factura‑Recibo, Factura ou Recibo' });
        }
      }

      // Server-side validation: require exemption reason when VAT=0%
      try {
        const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
        const missingExemption = lines
          .filter((l: any) => Number(l?.vatRate) === 0)
          .filter((l: any) => !String(l?.vatExemptionReason || '').trim());
        if (missingExemption.length) {
          return res.status(400).json({
            error: 'Motivo de isenção é obrigatório para linhas com IVA=0%'
          });
        }

        // AGT Cabinda Special Regime validation
        const allowedRates = [0, 1, 2, 3, 5, 7, 10, 14];
        const invalidRate = lines.find((l: any) => !allowedRates.includes(Number(l?.vatRate)));
        if (invalidRate) {
          return res.status(400).json({
            error: `Taxa de IVA inválida: ${invalidRate.vatRate}%. Taxas permitidas: ${allowedRates.join(', ')}%.`
          });
        }
      } catch {}

      // Server-side validation: forbid unitPrice <= 0 for invoices (factura)
      try {
        if (String(documentData.documentType).toLowerCase() === 'factura') {
          const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
          const invalid = lines.filter((l: any) => Number(l?.unitPrice) <= 0);
          if (invalid.length) {
            return res.status(400).json({
              error: 'Nenhuma linha de factura pode ter preço unitário igual ou inferior a 0'
            });
          }
        }
      } catch {}

      // Server-side validation: Debit Note must have at least one valid line (AGT)
      try {
        if (String(documentData.documentType) === 'nota_de_debito') {
          const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
          const hasValid = lines.some((l: any) => {
            const hasDescOrCode = Boolean(String(l?.description || l?.sku || '').trim());
            const qtyValid = Number(l?.quantity) > 0;
            const priceValid = Number(l?.unitPrice) > 0;
            return hasDescOrCode && qtyValid && priceValid;
          });
          if (!hasValid) {
            return res.status(400).json({
              error: 'Nota de débito deve conter pelo menos um item com quantidade e preço válidos, segundo AGT'
            });
          }
        }
      } catch {}


      // Validate that referenced products exist (avoid using deleted products)
      try {
        await connectToDatabase();
        const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
        const invalidProductIds: string[] = [];
        for (const line of lines) {
          const pid = (line as any)?.productId;
          if (pid) {
            const product = await Product.findById(pid);
            if (!product && !productStore.getProductById(pid)) {
              invalidProductIds.push(String(pid));
            }
          }
        }
        if (invalidProductIds.length) {
          return res.status(400).json({
            error: 'Alguns itens referenciam produtos apagados. Atualize a seleção.',
            invalidProductIds,
          });
        }
      } catch (err) {
        console.error('Error validating products in document lines:', err);
      }

      try {
        const forceOneKz = String(process.env.FORCE_TEST_FACTURA_1KZ || '').toLowerCase() === 'true';
        if (forceOneKz && String(documentData.documentType).toLowerCase() === 'factura') {
          const buyer = documentData.buyer || {};
          documentData.buyer = {
            name: buyer.name && buyer.name.toLowerCase().includes('consumidor final') ? buyer.name : 'Consumidor Final',
            nif: '999999999',
            address: buyer.address || 'Luanda',
            email: buyer.email || '',
            phone: buyer.phone || ''
          };
          documentData.lines = [
            {
              sku: 'TEST',
              description: 'Teste 1 KZ',
              quantity: 1,
              unit: 'UN',
              unitPrice: 1,
              discount: 0,
              vatRate: 0,
              vatExemptionReason: 'ISE'
            }
          ];
        }
      } catch {}

      // Always enforce issueDate as today and taxableDate equals issueDate
      const todayStr = new Date().toISOString().split('T')[0];
      let issueDate = todayStr;
      let taxableDate = todayStr;
      if (isCompliance) {
        const tryIssue = String(documentData.issueDate || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(tryIssue)) {
          issueDate = tryIssue;
          taxableDate = tryIssue;
        }
      }
      const year = new Date(issueDate).getFullYear();
      // Ensure delivery note defaults use GR per AGT
      if (documentData.documentType === 'nota_de_entrega') {
        const curr = seriesStore.getDefaultSeries('nota_de_entrega', year);
        if (curr?.code === 'NE') {
          const gr = seriesStore.getSeries('GR', year);
          if (!gr) {
            seriesStore.createSeries({
              code: 'GR',
              name: 'GR · Guia de Remessa',
              documentType: 'nota_de_entrega',
              year,
              startNumber: 1,
              currentNumber: 0,
              active: true,
              isDefault: true,
            });
          } else {
            seriesStore.setDefault('GR', year);
          }
        }
      }
      // Determine series code, preferring default series for type/year
      let seriesCode: string = documentData.series;
      if (!seriesCode) {
        const def = seriesStore.getDefaultSeries(documentData.documentType, year);
        seriesCode = def?.code || (
          documentData.documentType === 'factura' ? 'FT' :
          documentData.documentType === 'orçamento' ? 'OR' :
          documentData.documentType === 'nota_de_entrega' ? 'GR' :
          documentData.documentType === 'recibo' ? 'RC' :
          documentData.documentType === 'nota_de_credito' ? 'NC' :
          documentData.documentType === 'nota_de_debito' ? 'ND' :
          documentData.documentType === 'factura_recibo' ? 'FR' :
          documentData.documentType === 'proforma' ? 'PP' :
          documentData.documentType === 'factura_generica' ? 'FG' :
          documentData.documentType === 'factura_global' ? 'FGL' :
          documentData.documentType === 'factura_adiantamento' ? 'FA' :
          documentData.documentType === 'factura_recibo_autofacturacao' ? 'AF' :
          documentData.documentType === 'recibo_estorno' ? 'RE' :
          documentData.documentType === 'aviso_cobranca' ? 'AC' :
          documentData.documentType === 'aviso_cobranca_recibo' ? 'AR' :
          documentData.documentType === 'outros_recibos' ? 'RG' : 'FT'
        );
      }

      // Assign next sequential number per active company and series/year
      let sequentialNumber: number;
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
        console.error('Error fetching active company for document numbering:', err);
      }

      // Delegate sequence assignment to DocumentStore to ensure atomicity with creation
      sequentialNumber = undefined as any;

      // use computed issueDate/taxableDate (supports compliance override)

      // Payment defaults based on document type
      let payment = {
        method: documentData.payment?.method || 'bank_transfer',
        status: documentData.payment?.status || 'pending',
        dueDate: documentData.payment?.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      } as { method: string; status: string; dueDate: string };

      // Set self-billing indicator for Autofacturação
      if (documentData.documentType === 'factura_recibo_autofacturacao') {
        documentData.selfBillingIndicator = 1;
      }

      if (documentData.documentType === 'factura_recibo' || documentData.documentType === 'factura_recibo_autofacturacao') {
        payment = {
          method: documentData.payment?.method || 'cash',
          status: documentData.payment?.status || 'paid',
          dueDate: documentData.payment?.dueDate || issueDate
        };
      } else if (documentData.documentType === 'factura_global') {
        // Factura Global não tem prazo adicional: vencimento na data de emissão
        payment = {
          method: documentData.payment?.method || 'bank_transfer',
          status: documentData.payment?.status || 'pending',
          dueDate: issueDate
        };
      } else if (documentData.documentType === 'recibo' || documentData.documentType === 'aviso_cobranca_recibo' || documentData.documentType === 'recibo_estorno' || documentData.documentType === 'outros_recibos') {
        payment = {
          method: documentData.payment?.method || 'cash',
          status: 'paid',
          dueDate: issueDate,
        };
      } else if (documentData.documentType === 'proforma') {
        payment = {
          method: documentData.payment?.method || 'other',
          status: documentData.payment?.status || 'pending',
          dueDate: documentData.payment?.dueDate || payment.dueDate
        };
      }

      try {
        const isReceiptDoc = ['recibo', 'aviso_cobranca_recibo', 'recibo_estorno', 'outros_recibos'].includes(String(documentData.documentType));
        if (isReceiptDoc) {
          const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
          if (lines.length === 0) {
            const paidAmountRaw = documentData.payment?.paidAmount ?? documentData.totals?.total ?? documentData.total ?? 0;
            const paidAmount = Number(paidAmountRaw);
            if (!paidAmount || paidAmount <= 0) {
              return res.status(400).json({ error: 'O valor do recibo deve ser superior a 0.00 Kz.' });
            }
            documentData.lines = [
              {
                sku: String(documentData.documentType) === 'recibo_estorno' ? 'ESTORNO' : 'PAGAMENTO',
                description: String(documentData.documentType) === 'recibo_estorno' ? 'Estorno' : 'Pagamento',
                quantity: 1,
                unit: 'Un',
                unitPrice: paidAmount,
                discount: 0,
                vatRate: 0,
                vatExemptionReason: 'M04',
                total: paidAmount
              }
            ];
            documentData.payment = {
              ...(documentData.payment || {}),
              status: 'paid',
              method: documentData.payment?.method || payment.method || 'cash',
              paidAmount,
              paidDate: documentData.payment?.paidDate || issueDate,
              dueDate: issueDate
            };
          }
        }
      } catch {}

      const created = documentStore.createDocument({
        ...documentData,
        // Ensure new reference fields are passed to creation
        referenceInvoiceNo: documentData.referenceInvoiceNo,
        referenceInvoiceDate: documentData.referenceInvoiceDate,
        debitNoteReason: documentData.debitNoteReason,
        expenseRepass: documentData.expenseRepass,
        referenceText: documentData.referenceText,
        
        __complianceAllowIssueDate: isCompliance,
        __complianceAllowCreatedAt: isCompliance,
        __complianceCreatedAt: isCompliance ? (documentData.__complianceCreatedAt || documentData.createdAt) : undefined,
        series: seriesCode,
        sequentialNumber,
        issueDate,
        taxableDate,
        payment
      });

      // Pós-processamento: emitir FR como "issued" e marcar como paga
      // e marcar recibos como pagos com valor/data
      let resultDoc = created;
      if (documentData.documentType === 'factura_recibo' || documentData.documentType === 'factura_recibo_autofacturacao') {
        const providedPaidAmount = (created as any)?.payment?.paidAmount;
        const providedPaidDate = (created as any)?.payment?.paidDate;
        const providedStatus = (created as any)?.payment?.status;
        const totalAmount = (created.totals?.total || 0);
        const finalPaidAmount = (typeof providedPaidAmount === 'number' && providedPaidAmount > 0) ? providedPaidAmount : totalAmount;
        const finalStatus = (providedStatus === 'partial' || providedStatus === 'paid')
          ? providedStatus
          : (finalPaidAmount >= totalAmount ? 'paid' : 'partial');

        const updated = documentStore.updateDocument(created.id, {
          status: 'issued',
          payment: {
            ...(created.payment || {}),
            method: (created.payment?.method || payment.method || 'cash'),
            status: finalStatus,
            paidAmount: finalPaidAmount,
            paidDate: (providedPaidDate || issueDate),
            dueDate: issueDate,
          },
        });
        if (updated) resultDoc = updated;
        // Liquidar a factura origem via FR, se houver referência
        const originId = Array.isArray(documentData.relatedDocuments) && documentData.relatedDocuments.length
          ? String(documentData.relatedDocuments[0])
          : (Array.isArray(created.relatedDocuments) && created.relatedDocuments.length
              ? String(created.relatedDocuments[0])
              : null);
        if (originId) {
          try {
            documentStore.settleByFacturaRecibo(originId, created.id, {
              method: (resultDoc?.payment?.method || payment.method || 'cash'),
              paidDate: (providedPaidDate || issueDate),
              amount: finalPaidAmount,
            });
          } catch (e) {
            console.warn('Falha ao liquidar factura origem via FR:', e);
          }
        }
      } else if (['recibo', 'aviso_cobranca_recibo', 'recibo_estorno', 'outros_recibos'].includes(documentData.documentType)) {
        const providedPaidAmount = Number((created as any)?.payment?.paidAmount || documentData.payment?.paidAmount || 0);
        const finalPaidAmount = providedPaidAmount > 0 ? providedPaidAmount : Number(created.totals?.total || calculatedTotal || 0);
        const updated = documentStore.updateDocument(created.id, {
          status: 'paid',
          payment: {
            ...(created.payment || {}),
            status: 'paid',
            paidAmount: finalPaidAmount,
            paidDate: issueDate,
            dueDate: issueDate,
          },
        });
        if (updated) resultDoc = updated;
      } else if (documentData.documentType === 'factura_global') {
        // Finalizar imediatamente Factura Global para evitar limpezas de drafts
        const updated = documentStore.updateDocument(created.id, {
          status: 'issued',
          payment: {
            ...(created.payment || {}),
            status: created.payment?.status || 'pending',
            dueDate: created.payment?.dueDate || issueDate
          }
        });
        if (updated) resultDoc = updated;
      } else if (documentData.documentType === 'factura_generica') {
        // Finalizar imediatamente Factura Genérica para evitar desaparecimento de drafts
        const updated = documentStore.updateDocument(created.id, {
          status: 'issued',
          payment: {
            ...(created.payment || {}),
            status: created.payment?.status || 'pending',
            dueDate: created.payment?.dueDate || created.payment?.dueDate || issueDate
          }
        });
        if (updated) resultDoc = updated;
      } else if (['factura', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega', 'factura_generica', 'factura_global', 'factura_adiantamento', 'aviso_cobranca'].includes(documentData.documentType)) {
        const requestedStatus = documentData.status;
        const requestedPaymentStatus = documentData.payment?.status;
        const targetStatus =
          requestedStatus === 'paid' || requestedPaymentStatus === 'paid'
            ? 'paid'
            : (requestedStatus === 'draft' ? null : 'issued');

        if (targetStatus) {
          const updated = documentStore.updateDocument(created.id, {
            status: targetStatus,
            payment: {
              ...(created.payment || {}),
              status: targetStatus === 'paid' ? 'paid' : (created.payment?.status || 'pending'),
              paidAmount: targetStatus === 'paid' ? (created.totals?.total || 0) : (created.payment?.paidAmount || 0)
            }
          });
          if (updated) resultDoc = updated;
        }
      }

      // Auto-link or create client in clientStore based on buyer info
      try {
        const buyer = (created as any)?.buyer || {};
        const nif = String(buyer?.nif || '').trim();
        if (nif && !clientStore.nifExists(nif)) {
          const clientType: 'individual' | 'company' = /[A-Za-z]/.test(nif) ? 'individual' : 'company';
          clientStore.createClient({
            name: buyer?.name || buyer?.tradeName || 'Cliente',
            tradeName: buyer?.tradeName,
            nif,
            address: buyer?.address || '—',
            email: buyer?.email,
            phone: buyer?.phone,
            clientType,
            status: 'active',
            notes: `Criado automaticamente do documento ${created.series}${String(created.sequentialNumber).padStart(4, '0')}`,
            companyId: undefined,
          });
        }
      } catch (e) {
        console.warn('Falha ao criar/ligar cliente a partir do documento:', e);
      }

      // AUTO-SUBMIT TO AGT (compliance requirement)
      let debugInfo = {};
      try {
        const agtService = new AgtService();
        const config = await agtService.getActiveConfig();
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
        
        debugInfo = {
            mode: config.submissionMode,
            type: resultDoc.documentType,
            status: resultDoc.status,
            isSubmittable: submittableTypes.includes(resultDoc.documentType),
            isFinal: resultDoc.status === 'issued' || resultDoc.status === 'paid'
        };

        // Auto-submit logic
        if (config.submissionMode === 'online' && submittableTypes.includes(resultDoc.documentType)) {
          const isFinal = resultDoc.status === 'issued' || resultDoc.status === 'paid';
          if (isFinal) {
            try {
              const pending = documentStore.updateDocument(resultDoc.id, {
                agtSubmission: {
                  status: 'pending',
                  submissionDate: new Date().toISOString(),
                  message: 'Queued for online submission',
                  mode: 'online'
                }
              } as any);
              if (pending) resultDoc = pending;
            } catch {}
          }
        } else if (config.submissionMode === 'offline' && submittableTypes.includes(resultDoc.documentType)) {
           // Mark as offline pending if mode is offline
           const isFinal = resultDoc.status === 'issued' || resultDoc.status === 'paid';
           if (isFinal) {
             const updated = documentStore.updateDocument(resultDoc.id, {
               agtSubmission: {
                 status: 'offline_pending',
                 mode: 'offline',
                 submissionDate: new Date().toISOString()
               }
             } as any);
             if (updated) resultDoc = updated;
           }
        } else {
           console.log(`[AutoSubmit] Skipped. Mode: ${config.submissionMode}, Type: ${resultDoc.documentType}`);
        }
      } catch (agtError: any) {
        console.error('[AutoSubmit] Exception:', agtError.message);
        // Don't fail the request, just log and mark as error if possible
        try {
           const updated = documentStore.updateDocument(resultDoc.id, {
             agtSubmission: {
               status: 'error',
               message: `Exception: ${agtError.message}`,
               submissionDate: new Date().toISOString()
             }
           } as any);
           if (updated) resultDoc = updated;
        } catch {}
      }

      res.status(201).json({
        message: 'Document created successfully',
        document: resultDoc
      });
    } catch (error: any) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: `Failed to create document: ${error.message}` });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
