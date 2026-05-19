import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../../lib/documentStore';
import { companyJsonPath, systemJsonPath } from '@/lib/dataPaths';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import PdfService from '@/services/PdfService';
import AgtService from '@/services/AgtService';
import * as QR from 'qrcode';
import PdfCacheService from '@/services/PdfCacheService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const document = documentStore.getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Cache POS support
    const { force } = req.query as any;
    const cacheKey = `pos-${id}`;
    if (!force && await PdfCacheService.isCached(cacheKey)) {
      const cached = await PdfCacheService.getCachedPdf(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="document-${id}-pos.pdf"`);
        res.setHeader('Content-Length', cached.length);
        res.setHeader('X-PDF-Source', 'cache-pos');
        return res.send(cached);
      }
    }

    let companyCfg: any = {};
    let systemCfg: any = {};
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const raw = fs.readFileSync(companyPath, 'utf-8');
        companyCfg = raw ? JSON.parse(raw) : {};
      }
    } catch {}

    try {
      const sysPath = systemJsonPath();
      if (fs.existsSync(sysPath)) {
        const raw = fs.readFileSync(sysPath, 'utf-8');
        systemCfg = raw ? JSON.parse(raw) : {};
      }
    } catch {}

    const companyName = companyCfg.tradeName || companyCfg.name || document.seller?.tradeName || document.seller?.name || 'Empresa';
    const companyNif = companyCfg.nif || document.seller?.nif || '';
    const companyAddress = companyCfg.address || document.seller?.address || '';
    const companyPhone = companyCfg.phone || document.seller?.phone || '';
    const softwareCert = String(systemCfg.saftSoftwareCertificateNumber || companyCfg.saftSoftwareCertificateNumber || '0').trim();
    const rawVersion = String(systemCfg.saftProductVersion || companyCfg.saftProductVersion || '1.0.3').trim();
    const versionDisplay = `V.${rawVersion.replace(/^\s*[vV]\.?/,'')}`;

    const num = (v: number) => new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    // Helper to round numbers (Round Half Up)
    const round = (value: number, decimals: number = 2): number => {
      return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    };

    const lines = Array.isArray(document.lines) ? document.lines : [];
    const totalValue = (document.totals?.total ?? (document.totals as any)?.grandTotal ?? 0);
    const subtotalValue = (document.totals?.subtotal ?? (document.totals as any)?.taxableBase ?? 0);
    const discountValue = (document.totals?.discount ?? (document.totals as any)?.discountTotal ?? 0);
    const vatValue = round((document.totals as any)?.vatTotal ?? ((Array.isArray(document.totals?.vatBreakdown) ? document.totals.vatBreakdown.reduce((s: number, v: any)=> s + Number(v.amount||0), 0) : 0)));
    const paidAmount = (document.payment?.paidAmount ?? totalValue);

    const issueDateStr = format(new Date(document.issueDate), 'yyyy-MM-dd', { locale: pt });
    
    const height = 260 + lines.length * 12;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, height] });
    const pageWidth = 80;
    pdf.setFont('helvetica', 'normal');

    // Helper to align text exactly to the right edge by measuring width
    const textRight = (pdf: jsPDF, text: string, x: number, y: number) => {
      const w = (pdf.getTextWidth(text) || 0);
      pdf.text(text, x - w, y);
    };
    const FS = { head: 9, body: 8, small: 7, tiny: 6 } as const;

    // Para Nota de Entrega: preparar referência à factura relacionada para herdar isenções/descrições
    let refInvoice: any = null;
    try {
      if (String(document.documentType || '').toLowerCase() === 'nota_de_entrega' && Array.isArray(document.relatedDocuments)) {
        for (const rid of document.relatedDocuments) {
          const d = documentStore.getDocument(String(rid));
          if (d && (String(d.documentType) === 'factura' || String(d.documentType) === 'factura_recibo')) { refInvoice = d; break; }
        }
      }
    } catch {}
    const invLines: Array<{ sku?: string; description?: string; vatExemptionReason?: string; vatRate?: number }> = Array.isArray(refInvoice?.lines) ? refInvoice.lines : [];
    const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    let y = 6;
    let logoDrawH = 0;

    // Documento: ligeiramente menor e centralizado
    // TIPO DE DOCUMENTO NO TOPO CENTRALIZADO
    const typeMap: Record<string, string> = {
      'factura': 'FACTURA',
      'factura_recibo': 'FACTURA RECIBO',
      'recibo': 'RECIBO',
      'nota_de_credito': 'NOTA DE CRÉDITO',
      'nota_de_debito': 'NOTA DE DÉBITO',
      'nota_de_entrega': 'NOTA DE ENTREGA',
      'orçamento': 'ORÇAMENTO',
      'proforma': 'PROFORMA'
    };
    const rawType = String(document.documentType || '').toLowerCase();
    const docTypeTitle = typeMap[rawType] || (rawType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'DOCUMENTO');
    
    // Título do documento no topo (inclui RECIBO novamente)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.head); // usar tamanho maior para destaque
    const docTypeWidth = pdf.getTextWidth(docTypeTitle);
    const docTypeCenterX = (pageWidth - docTypeWidth) / 2;
    pdf.text(docTypeTitle, docTypeCenterX, y);
    y += 6; // espaço após o tipo de documento

    // Logo/Company name
    try {
      const tryPaths = [
        path.join(process.cwd(), 'assets', 'logo.png'),
        path.join(process.cwd(), 'public', 'logo.png'),
        path.join(process.cwd(), 'assets', 'icon.png'),
        path.join(process.cwd(), 'public', 'icon.png'),
        path.join(process.cwd(), 'build', 'icons', 'icon.png'),
        path.join(process.cwd(), 'assets', 'logo.jpg'),
        path.join(process.cwd(), 'public', 'logo.jpg'),
        path.join(process.cwd(), 'assets', 'icon.jpg'),
        path.join(process.cwd(), 'public', 'icon.jpg')
      ];
      const iconPath = tryPaths.find(p => fs.existsSync(p));
       if (iconPath) {
        const buf = fs.readFileSync(iconPath);
        const base64 = buf.toString('base64');
        const ext = path.extname(iconPath).toLowerCase();
        const isJpeg = ext === '.jpg' || ext === '.jpeg';
        const formatImg = isJpeg ? 'JPEG' : 'PNG';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const dataUri = `data:${mime};base64,${base64}`;
        const parsePng = (b: Buffer): { width: number; height: number } | null => {
          if (b.length >= 24) {
            const w = b.readUInt32BE(16); const h = b.readUInt32BE(20);
            if (w > 0 && h > 0) return { width: w, height: h };
          }
          return null;
        };
        const parseJpeg = (b: Buffer): { width: number; height: number } | null => {
          let i = 2; while (i + 9 < b.length) {
            if (b[i] !== 0xFF) { i++; continue; }
            const marker = b[i + 1]; const len = b.readUInt16BE(i + 2);
            if (marker === 0xC0 || marker === 0xC2) {
              const h = b.readUInt16BE(i + 5); const w = b.readUInt16BE(i + 7);
              if (w > 0 && h > 0) return { width: w, height: h };
              return null;
            }
            if (marker === 0xD9 || marker === 0xDA) break; i += 2 + len;
          }
          return null;
        };
        const dims = isJpeg ? parseJpeg(buf) : parsePng(buf);
        const targetW = 18; const maxH = 18;
        let drawW = targetW; let drawH = maxH;
        if (dims && dims.width && dims.height) {
          const ratio = dims.height / dims.width; drawH = targetW * ratio;
          if (drawH > maxH) { drawH = maxH; drawW = maxH / ratio; } else { drawW = targetW; }
        }
        logoDrawH = drawH;
        pdf.addImage(dataUri, formatImg as any, 6, y, drawW, drawH);
      } else {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(FS.body); pdf.text('NEGOMIL', 6, y + 4);
        logoDrawH = 6;
      }
    } catch {}

    // QR no topo-direito com mínima margem (após o tipo de documento)
    let qrBottom = y;
    try {
      const agt = new AgtService();
      let qrData = '';
      try {
        qrData = await agt.generateQrCodeData(document as any);
      } catch (err) {
        console.error('Failed to generate QR data:', err);
        res.setHeader('X-QR-Error', String(err));
        return res.status(500).json({ error: 'QR generation failed: ' + String(err) });
      }

      try {
        const dbg = String(((req as any).query?.debug || '')).toLowerCase();
        if (dbg === 'true') {
          res.setHeader('X-QR-Data', qrData);
        }
      } catch {}
      const qrSize = 20; const qrMargin = 2; const qrX = pageWidth - qrMargin - qrSize; const qrY = 8;
      let drawn = false;
      try {
        const symbol = QR.create(qrData, { errorCorrectionLevel: 'M' });
        const modules = symbol.modules;
        const mSize: number = modules.size;
        const cell = qrSize / mSize;
        pdf.setFillColor(0, 0, 0);
        for (let r = 0; r < mSize; r++) {
          for (let c = 0; c < mSize; c++) {
            if (modules.get(r, c)) {
              pdf.rect(qrX + c * cell, qrY + r * cell, cell, cell, 'F');
            }
          }
        }
        drawn = true;
      } catch {}
      if (!drawn) {
        try {
          const qrDataUrl = await agt.generateQrCodeImage(document as any);
          pdf.addImage(qrDataUrl as any, 'PNG', qrX, qrY, qrSize, qrSize);
          drawn = true;
        } catch {}
      }
      if (!drawn) {
        pdf.setDrawColor(0);
        pdf.rect(qrX, qrY, qrSize, qrSize);
        pdf.setFontSize(5);
        pdf.text('Consultar FE', qrX, qrY + qrSize + 3);
        pdf.setFontSize(4);
        pdf.text(qrData, qrX, qrY + qrSize + 5, { maxWidth: 38 });
      }
      qrBottom = qrY + qrSize;
    } catch {}
    
    // Avançar Y para logo/QR + margem reduzida para subir o nome
    y = Math.max(y + (logoDrawH || 0), qrBottom) + 0.3;

    // Company details (espaçamento revertido)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.body);
    pdf.text(companyName, 6, y);
    y += 3;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS.small);
    pdf.text(`Contribuinte Nº ${companyNif}`, 6, y);
    y += 2.5;
    pdf.text(`Telefone: ${companyPhone}`, 6, y);
    y += 2.5;
    const addressLines = pdf.splitTextToSize(companyAddress, 45);
    pdf.text(addressLines, 6, y);
    y += (addressLines.length * 2.5) + 3;

    // Número do documento (usar o mesmo cálculo do QR/AGT, com série autorizada/contingência)
    const docNumber = await (new AgtService()).computeAgtDocumentNo(document as any);
    pdf.text(docNumber, 6, y);

    // Para Nota de Débito/Crédito: inserir referência à factura original
    if (rawType === 'nota_de_debito' || rawType === 'nota_de_credito') {
      try {
        const parts: string[] = [];
        let computed = false;

        // 1. Try to get official reference from related document first (priority)
        if (Array.isArray((document as any).relatedDocuments) && (document as any).relatedDocuments.length > 0) {
          try {
            const src = documentStore.getDocument(String((document as any).relatedDocuments[0]));
            if (src) {
              const srcTypeRaw = String(src.documentType || '').toLowerCase();
              const srcDisplay = typeMap[srcTypeRaw] || 'Documento';
              // Force standard AGT format using computeAgtDocumentNo
              const agtService = new AgtService();
              const refNo = await agtService.computeAgtDocumentNo(src as any);
              parts.push(`Referente à ${srcDisplay} ${refNo}`);
              computed = true;
            }
          } catch {}
        }

        // 2. Fallback to stored text fields only if computation failed
        if (!computed) {
          const rn = String((document as any).referenceInvoiceNo || '').trim();
          const rd = String((document as any).referenceInvoiceDate || '').trim();
          
          if (rn && rd) {
            parts.push(`Referente à factura nº ${rn} de ${format(new Date(rd), 'yyyy-MM-dd')}`);
          } else if (rn) {
            parts.push(`Referente à factura nº ${rn}`);
          }
        }

        if (parts.length > 0) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(FS.tiny);
          const refLines = pdf.splitTextToSize(parts.join('; '), pageWidth - 12);
          y += 3;
          pdf.text(refLines, 6, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(FS.small);
        }
      } catch {}
    }

    // Para recibo POS, inserir nota "Recibo total referente..." logo abaixo da referência RC
    if (rawType === 'recibo') {
      try {
        let refDoc: any = null;
        if (Array.isArray(document.relatedDocuments) && document.relatedDocuments.length > 0) {
          for (const rid of document.relatedDocuments) {
            const d = documentStore.getDocument(String(rid));
            const t = String(d?.documentType || '').toLowerCase();
            if (d && (t === 'factura' || t === 'factura_recibo' || t === 'nota_de_debito')) { refDoc = d; break; }
          }
        }
        if (refDoc) {
          // Determinar se este recibo é parcial ou total com base no valor já pago
          const invoiceTotal = Number((refDoc as any)?.totals?.total || 0);
          let paidSoFar = 0;
          try {
            if (Array.isArray(refDoc.relatedDocuments)) {
              for (const rr of refDoc.relatedDocuments) {
                const rd = documentStore.getDocument(String(rr));
                if (rd && String(rd.documentType).toLowerCase() === 'recibo') {
                  paidSoFar += Number(((rd as any)?.totals?.total) ?? rd.payment?.paidAmount ?? 0);
                }
              }
            }
          } catch {}
          const remainingAfterThis = Math.max(invoiceTotal - paidSoFar, 0);
          const refType = String(refDoc.documentType || '').toLowerCase();
          const refDisplay = refType === 'factura_recibo' ? 'Factura Recibo' : (refType === 'nota_de_debito' ? 'Nota de Débito' : 'Factura');
          const qualifier = remainingAfterThis > 0 ? 'parcial' : 'total';
          const srcDocNo = await (new AgtService()).computeAgtDocumentNo(refDoc as any);
          const refText = `Recibo ${qualifier} referente à ${refDisplay} ${srcDocNo}`;
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(FS.tiny);
          const refLines = pdf.splitTextToSize(refText, pageWidth - 12);
          y += 3;
          pdf.text(refLines, 6, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(FS.small);
        }
      } catch {}
    }
    y += 2; pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y); y += 2;
    pdf.text('Original', 6, y);
    y += 0.6; pdf.setLineWidth(0.3).line(6, y, pageWidth - 6, y); y += 3.4;

    // Client Details
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.small);
    pdf.text(`Cliente: ${document.buyer?.name || 'CONSUMIDOR FINAL'}`, 6, y);
    y += 4;
    pdf.text(`NIF: ${document.buyer?.nif || 'CONSUMIDOR FINAL'}`, 6, y);
    y += 4;
    const baseDateObj = (document as any).createdAt ? new Date((document as any).createdAt) : new Date(document.issueDate);
    const issueDateTime = format(baseDateObj, 'yyyy-MM-dd HH:mm:ss');
    pdf.text(`Data e Hora: ${issueDateTime}`, 6, y);
    y += 2; pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y); y += 4;

    pdf.setFontSize(FS.tiny);
    const noteText = 'Os bens/Serviços foram colocados à disposição do adquirente na data do documento. Luanda-Rua Luanda, Edificio:Luanda';
    const noteLines = pdf.splitTextToSize(noteText, pageWidth - 12);
    pdf.text(noteLines, 6, y);
    // Reverter espaçamento para valores fixos anteriores
    y += (noteLines.length * 3) + 1;
    pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y);
    y += 2;

    // Items Table (mais visível): cabeçalho + cada produto em 2 linhas
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.small);
    const headerY = y;
    pdf.text('Qtd', 16, headerY, { align: 'right' });
    pdf.text('Txª IMP', 30, headerY, { align: 'right' });
    pdf.text('Preço Uni', 50, headerY, { align: 'right' });
    pdf.text('Total', pageWidth - 6, headerY, { align: 'right' });
    y += 1; pdf.setLineWidth(0.35).line(6, y, pageWidth - 6, y);
    // Mantém gap adaptativo entre traço do cabeçalho e a primeira linha de produto
    const headerGap = lines.length > 10 ? 1.6 : 2.2;
    y += headerGap;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS.small);
    const exemptionsSummary: string[] = [];
    for (const ln of lines) {
      // Linha 1: nome/descrição do produto
      let desc = String(ln.description || '');
      // Nota de Entrega: reforçar descrição a partir da factura quando existir correspondência
      if (String(document.documentType || '').toLowerCase() === 'nota_de_entrega' && invLines.length) {
        const matchBySku = invLines.find(il => String(il.sku || '').trim() === String((ln as any).sku || '').trim());
        if (matchBySku && matchBySku.description) {
          desc = String(matchBySku.description);
        } else {
          const dnDesc = norm(ln.description);
          const matchByDesc = invLines.find(il => norm(il.description) === dnDesc);
          if (matchByDesc && matchByDesc.description) {
            desc = String(matchByDesc.description);
          } else if (invLines.length) {
            // fallback por posição
            const idx = lines.indexOf(ln);
            if (invLines[idx] && invLines[idx].description) desc = String(invLines[idx].description);
          }
        }
      }
      // Em recibos, limpar frases extras e manter apenas os nomes dos produtos
      if (rawType === 'recibo') {
        const match = desc.match(/Produtos:\s*(.+?)(?:\s*[—\-]\s*Parcela|$)/i);
        if (match && match[1]) {
          desc = match[1].trim();
        } else {
          // Remover prefixo "Recibo total referente à ..." se existir
          const parts = desc.split(/\s*[—\-]\s*/);
          if (parts.length > 1) {
            desc = parts[parts.length - 1];
          }
        }
      }
      const nameLines = pdf.splitTextToSize(desc, pageWidth - 12);
      pdf.text(nameLines, 6, y);
      y += (nameLines.length * 4);

      // Remover código do produto (SKU) de todos documentos POS

      // Linha 2: Qtd | Taxa | Preço | Total
      const qty = Number(ln.quantity || 0);
      const vat = Number(ln.vatRate || 0);
      let unitPrice = Number(ln.unitPrice || 0);
      const lineTotal = round(Number(ln.total || (qty * unitPrice)));

      // Fallback: se preço unitário for 0 mas tivermos total e quantidade, recalcular
      if (unitPrice === 0 && qty !== 0 && lineTotal !== 0) {
        unitPrice = lineTotal / qty;
      }

      pdf.text(num(qty), 16, y, { align: 'right' });
      pdf.text(`${num(unitPrice)}`, 50, y, { align: 'right' });
      pdf.text(`${vat}%`, 30, y, { align: 'right' });
      pdf.text(num(lineTotal), pageWidth - 6, y, { align: 'right' });
      y += 4;

      // Nota de isenção por linha (quando aplicável) — debaixo de cada produto específico
      const rateNum = Number(ln.vatRate || 0);
      const isZeroVat = (vat === 0); // usar o mesmo valor exibido para consistência
      let exReason = String((ln as any).vatExemptionReason || '').trim();
      // Nota de Entrega: herdar motivo de isenção da factura relacionada quando faltar
      if (isZeroVat && !exReason && invLines.length && String(document.documentType || '').toLowerCase() === 'nota_de_entrega') {
        const dnDesc = norm(ln.description);
        let match = invLines.find(il => norm(il.description) === dnDesc);
        if (!match) {
          const idx = lines.indexOf(ln);
          match = invLines[idx];
        }
        // Só herdar motivo da factura quando a linha da factura for de IVA=0%
        if (match && Number(match.vatRate || 0) === 0 && match.vatExemptionReason) {
          exReason = String(match.vatExemptionReason);
        }
      }
      // Mostrar isenção debaixo do produto específico se for 0% IVA e tiver motivo
      if (isZeroVat && exReason) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(FS.tiny);
        const exemptionText = `Isento IVA: ${exReason}`;
        pdf.text(exemptionText, 6, y);
        y += 3;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(FS.small);
        // Adicionar ao resumo para manter compatibilidade (se necessário)
        if (!exemptionsSummary.includes(exReason)) exemptionsSummary.push(exReason);
      }

      // Removido: divisor fino entre itens para evitar risco sobre o próximo produto
      // pdf.setLineWidth(0.1);
      // pdf.line(6, y - 1, pageWidth - 6, y - 1);
    }

    // Isenções agora são mostradas debaixo de cada produto específico
    // Removido o resumo final para evitar duplicação

    // Totals summary
    y += 2;
    // Forma de Pagamento
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.small);
    pdf.text('Forma de Pagamento', 6, y);
    y += 1; pdf.setLineWidth(0.3).line(6, y, pageWidth - 6, y); y += 3;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS.tiny); // fonte um pouco menor
    pdf.text('Pagamento', 6, y);
    pdf.text('Nº do Borderô', 35, y);
    pdf.text('Valor', pageWidth - 6, y, { align: 'right' });
    y += 1; pdf.setLineWidth(0.2).line(6, y, pageWidth - 6, y); y += 3;

    const paymentMethod = document.payment?.method === 'cash' ? 'NUMERÁRIO' : (document.payment?.method || 'N/A');
    pdf.text(paymentMethod, 6, y);
    pdf.text('', 35, y);
    pdf.text(num(paidAmount), pageWidth - 6, y, { align: 'right' });
    y += 3; pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y); y += 4;

    // Espaço antes de Quadro Resumo Gerais
    y += 2;
    // Quadro Resumo Gerais
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS.small);
    pdf.text('Quadro Resumo Gerais', 6, y);
    y += 1; pdf.setLineWidth(0.3).line(6, y, pageWidth - 6, y); y += 4;

    const summaryLabelX = 8;
    const summaryValueX = pageWidth - 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS.small);
    pdf.text('Total Ilíquido:', summaryLabelX, y);
  textRight(pdf, num(subtotalValue), summaryValueX, y);
    y += 4;
    pdf.text('Total Desconto:', summaryLabelX, y);
  textRight(pdf, num(discountValue || 0), summaryValueX, y);
    y += 4;
    pdf.text('Total Imposto:', summaryLabelX, y);
  textRight(pdf, num(vatValue), summaryValueX, y);
    y += 4;
    pdf.text('Pagamento:', summaryLabelX, y);
  textRight(pdf, num(paidAmount), summaryValueX, y);
    y += 4;
    // Mostrar valores de pagamento parcial de forma inteligente
    // Para RECIBO: calcular com base na factura relacionada
    let showPartialBlock = false;
    let amountDue = 0;
    let amountPaidTotal = 0;
    if (rawType === 'recibo') {
      try {
        let refDoc: any = null;
        if (Array.isArray(document.relatedDocuments)) {
          for (const rid of document.relatedDocuments) {
            const d = documentStore.getDocument(String(rid));
            const t = String(d?.documentType || '').toLowerCase();
            if (d && (t === 'factura' || t === 'factura_recibo' || t === 'nota_de_debito')) { refDoc = d; break; }
          }
        }
        if (refDoc) {
          const invoiceTotal = Number((refDoc as any)?.totals?.total || 0);
          amountPaidTotal = 0;
          if (Array.isArray(refDoc.relatedDocuments)) {
            for (const rr of refDoc.relatedDocuments) {
              const rd = documentStore.getDocument(String(rr));
              if (rd && String(rd.documentType).toLowerCase() === 'recibo') {
                amountPaidTotal += Number(((rd as any)?.totals?.total) ?? rd.payment?.paidAmount ?? 0);
              }
            }
          }
          amountDue = round(Math.max(invoiceTotal - amountPaidTotal, 0));
          showPartialBlock = amountPaidTotal > 0 && amountDue > 0;
        }
      } catch {}
    } else {
      // Para outros tipos de documento: usar a comparação local
      const isPartialPayment = (document.payment?.status === 'partial') || ((paidAmount || 0) > 0 && (paidAmount || 0) < (totalValue || 0));
      showPartialBlock = isPartialPayment;
      amountPaidTotal = paidAmount || 0;
      amountDue = round(Math.max((totalValue || 0) - (paidAmount || 0), 0));
    }

    const change = round((paidAmount || 0) - totalValue);
    pdf.text('Troco:', summaryLabelX, y);
  textRight(pdf, num(change > 0 ? change : 0), summaryValueX, y);
    y += 2; pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y); y += 4;

    pdf.setFont('helvetica', 'bold');
    const currencyRaw = ((document as any)?.totals?.currency || (document as any)?.currency || 'AOA');
    const currencyLabel = String(currencyRaw).toUpperCase() === 'AOA' ? 'Kz' : String(currencyRaw).toUpperCase();
    pdf.text(`Total (${currencyLabel})`, summaryLabelX, y);
  textRight(pdf, num(totalValue), summaryValueX, y);
    // Linha após o Total
    y += 2; pdf.setLineWidth(0.3).line(6, y, pageWidth - 6, y); y += 3;

    // Bloco de pagamento parcial abaixo do Total, para não confundir o cliente
    if (showPartialBlock) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(FS.small);
      pdf.text('Pagamento parcial', 6, y);
      y += 1; pdf.setLineWidth(0.25).line(6, y, pageWidth - 6, y); y += 3;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(FS.small);
      pdf.text('Valor já pago:', summaryLabelX, y);
      textRight(pdf, num(amountPaidTotal), summaryValueX, y);
      y += 4;
      pdf.text('Valor por pagar:', summaryLabelX, y);
      textRight(pdf, num(amountDue), summaryValueX, y);
      y += 4;
    }

    // Caixa com valor por extenso
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS.small);
    const amountWords = PdfService.amountInWordsPtAOA(totalValue);
    const boxW = pageWidth - 12; const boxX = 6; const boxMaxTextW = boxW - 6;
    const wordsLines = pdf.splitTextToSize(amountWords, boxMaxTextW);
    const boxH = (wordsLines.length * 4) + 6;
    pdf.rect(boxX, y, boxW, boxH);
    pdf.text(wordsLines, pageWidth / 2, y + 4, { align: 'center' });
    y += boxH + 4; // espaço extra antes do processado por

    // Rodapé
    pdf.setFontSize(FS.tiny);
    let hashRaw = '';
    try {
      hashRaw = String((document as any).hash || '');
      if (!hashRaw) {
        const agt = new AgtService();
        hashRaw = agt.generateDocumentHash(document as any);
      }
    } catch {}
    let hash4 = (hashRaw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (hash4.length < 4) hash4 = (hash4 + 'XXXX').slice(0, 4);
    else hash4 = hash4.slice(-4);
    const hashLine = `${hash4} - Processado por programa válido FE/162/AGT/2026`;
    const hashLines = pdf.splitTextToSize(hashLine, pageWidth - 12);
    pdf.text(hashLines, pageWidth / 2, y, { align: 'center' });
    y += (hashLines.length * 3) + 2;

    pdf.text(`Utilizador: ${companyCfg.operatorName || 'admin'}`, 6, y);
    pdf.text(`Regime: ${companyCfg.regime || companyCfg.taxRegime || 'Geral'}`, pageWidth - 6, y, { align: 'right' });
    y += 4;

    const buffer = Buffer.from(pdf.output('arraybuffer'));

    // Cache POS store
    try {
      await PdfCacheService.storePdf(cacheKey, buffer);
    } catch {}

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="document-${id}-pos.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-PDF-Source', 'generated-pos');
    return res.send(buffer);

  } catch (error) {
    console.error('Error generating POS thermal PDF:', error);
    return res.status(500).json({ error: 'Failed to generate POS thermal PDF: ' + (error as any).message });
  }
}
