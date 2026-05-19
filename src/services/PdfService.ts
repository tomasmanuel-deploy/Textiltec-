import { jsPDF } from 'jspdf';
import * as QR from 'qrcode';
import { IDocument, DocumentType, IParty, ILineItem, ITotals, IPayment, IAgtSubmission } from '../models/Document';
import { documentStore } from '@/lib/documentStore';
import AgtService from './AgtService';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import fs from 'fs';
import path from 'path';
import { companyJsonPath, systemJsonPath } from '@/lib/dataPaths';
import { printsJsonPath } from '@/lib/dataPaths';

// Import autoTable for table generation
import autoTable from 'jspdf-autotable';
import { readInstalledLicense, verifyLicenseKey } from './LicenseService';

// Constants for layout
const HEADER_TOP = 20;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

export interface IPdfDocument {
  id: string;
  uuid: string;
  series: string;
  sequentialNumber: number;
  documentType: string;
  issueDate: Date;
  taxableDate: Date;
  seller: IParty;
  buyer: IParty;
  lines: ILineItem[];
  totals: ITotals;
  payment: IPayment;
  status: string;
  agtSubmission: IAgtSubmission;
  createdAt: Date;
  // Additional fields for AGT compliance
  hash?: string;
  prevHash?: string;
  hashAlgorithm?: string;
  // Related document references (IDs or objects)
  relatedDocuments?: string[] | Array<{
    type: string;
    series: string;
    number: number;
    date: Date;
  }>;
  // Debit note specific metadata
  debitNoteReason?: string;
  referenceInvoiceNo?: string;
  referenceInvoiceDate?: string; // YYYY-MM-DD
  referenceText?: string;
  expenseRepass?: boolean;
}

class PdfService {
  private contentStartY: number = 100;

  /**
   * Generate PDF for a document
   */
  async generatePdf(document: IPdfDocument): Promise<Buffer> {
    try {
      // Create new PDF document
      // Track print count (via) for this document
      const key = String(document.uuid || `${document.documentType}-${document.series}-${document.sequentialNumber}`);
      let printCount = 0;
      let printsData: any = { records: {} };
      
      // Only track prints for finalized documents (not drafts)
      const isDraft = (document.status || '').toLowerCase() === 'draft';
      
      if (!isDraft) {
        try {
          const pPath = printsJsonPath();
          if (!fs.existsSync(pPath)) {
            fs.writeFileSync(pPath, JSON.stringify({ records: {}, lastUpdated: new Date().toISOString() }, null, 2), 'utf-8');
          }
          const raw = fs.readFileSync(pPath, 'utf-8');
          printsData = raw ? JSON.parse(raw) : { records: {} };
          printCount = Number((printsData.records?.[key]?.count) || 0);
        } catch (err) {
          console.warn('Prints registry unavailable:', err);
          printCount = 0;
        }
      }
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Set font
      pdf.setFont('helvetica');

      // Add document header with company info and QR code
      await this.addDocumentHeader(pdf, document, printCount);
      this.addCancellationStampIfNeeded(pdf, document);
      
      // Add document details section
      this.addDocumentDetailsSection(pdf, document);
      
      // Add line items table
      await this.addLineItemsTable(pdf, document);
      
      // Add tax summary (Quadro Resumo de Imposto)
      this.addTaxSummary(pdf, document);
      
      // Removed bottom bank coordinates rendering per solicitação do cliente
      // if (document.documentType === DocumentType.INVOICE_RECEIPT || document.payment) {
      //   this.addPaymentSection(pdf, document);
      // }
      
      // Add footer with AGT validation info
      this.addDocumentFooter(pdf, document);
      
      // Increment and save registry ONLY after successful generation AND if not draft
      if (!isDraft) {
        try {
          const pPath = printsJsonPath();
          let currentData: any = { records: {} };
        if (fs.existsSync(pPath)) {
          const raw = fs.readFileSync(pPath, 'utf-8');
          currentData = raw ? JSON.parse(raw) : { records: {} };
        }
        
        const next = printCount + 1;
        const history = (currentData.records?.[key]?.history || []);
        const entry = { at: new Date().toISOString(), series: document.series, number: document.sequentialNumber };
        const records = { ...(currentData.records || {}) };
        records[key] = { count: next, history: [...history, entry] };
        fs.writeFileSync(pPath, JSON.stringify({ records, lastUpdated: new Date().toISOString() }, null, 2), 'utf-8');
      } catch (err) {
        console.warn('Failed to update prints registry:', err);
      }
      }

      // Return PDF as buffer
      return Buffer.from(pdf.output('arraybuffer'));
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new Error('Failed to generate PDF');
    }
  }

  /**
   * Add document header with company info, logo, QR code, and document type
   */
  private async addDocumentHeader(pdf: jsPDF, document: IPdfDocument, printCount: number): Promise<void> {
    // Load company configuration
    let companyName = 'Prakash';
    let companyTrade = 'Prakash';
    let companyNif = document.seller?.nif || '';
    let companyPhone = '';
    let companyEmail = '';
    let companyAddress = '';
    let companySeriesBase = '';
    try {
      const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
      const company = JSON.parse(raw);
      companyName = company.tradeName || company.name || companyName;
      companyTrade = company.tradeName || companyName;
      companyNif = company.nif || companyNif;
      companyPhone = company.phone || companyPhone;
      companyEmail = company.email || companyEmail;
      companyAddress = company.address || companyAddress;
      companySeriesBase = company.seriesBase || '';
    } catch {}

    // Logotipo do software no topo esquerdo (imagem)
    try {
      const tryPaths = [
      // Preferir o novo logo
      path.join(process.cwd(), 'assets', 'logo.png'),
      path.join(process.cwd(), 'public', 'logo.png'),
      // Fallbacks antigos
      path.join(process.cwd(), 'assets', 'icon.png'),
      path.join(process.cwd(), 'public', 'icon.png'),
       path.join(process.cwd(), 'build', 'icons', 'icon.png'),
       // JPEG fallbacks
       path.join(process.cwd(), 'assets', 'logo.jpg'),
       path.join(process.cwd(), 'public', 'logo.jpg'),
       path.join(process.cwd(), 'assets', 'icon.jpg'),
       path.join(process.cwd(), 'public', 'icon.jpg')
      ];
      let iconPath = tryPaths.find(p => fs.existsSync(p));
      if (iconPath) {
        const buf = fs.readFileSync(iconPath);
        const base64 = buf.toString('base64');
        const ext = path.extname(iconPath).toLowerCase();
        const isJpeg = ext === '.jpg' || ext === '.jpeg';
        const format = isJpeg ? 'JPEG' : 'PNG';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const dataUri = `data:${mime};base64,${base64}`;
        // Parse intrinsic image dimensions to preserve aspect ratio
        const parsePng = (b: Buffer): { width: number; height: number } | null => {
          if (b.length >= 24) {
            const width = b.readUInt32BE(16);
            const height = b.readUInt32BE(20);
            if (width > 0 && height > 0) return { width, height };
          }
          return null;
        };
        const parseJpeg = (b: Buffer): { width: number; height: number } | null => {
          let i = 2; // skip SOI 0xFFD8
          while (i + 9 < b.length) {
            if (b[i] !== 0xFF) { i++; continue; }
            const marker = b[i + 1];
            const len = b.readUInt16BE(i + 2);
            if (marker === 0xC0 || marker === 0xC2) { // SOF0 or SOF2
              const height = b.readUInt16BE(i + 5);
              const width = b.readUInt16BE(i + 7);
              if (width > 0 && height > 0) return { width, height };
              return null;
            }
            // End of image or start of scan: stop
            if (marker === 0xD9 || marker === 0xDA) break;
            i += 2 + len;
          }
          return null;
        };
        const dims = isJpeg ? parseJpeg(buf) : parsePng(buf);
        const targetW = 30; // slightly larger width in mm
        const maxH = 22;    // slightly larger max height in mm
        let drawW = targetW;
        let drawH = maxH;
        if (dims && dims.width && dims.height) {
          const ratio = dims.height / dims.width;
          drawH = targetW * ratio;
          if (drawH > maxH) {
            drawH = maxH;
            drawW = maxH / ratio;
          } else {
            drawW = targetW;
          }
        } else {
          // Fallback: keep previous height limit
          drawW = targetW;
          drawH = maxH;
        }
        console.log('[PdfService] Logo encontrado:', iconPath, 'formato:', format, 'bytes:', base64.length, 'dims:', dims, 'draw:', drawW, 'x', drawH);
        const LOGO_X = MARGIN_LEFT - 2;
         pdf.addImage(dataUri, format, LOGO_X, HEADER_TOP - 12, drawW, drawH);
        } else {
          // Fallback: texto casa a imagem não exista
          console.warn('[PdfService] Logo não encontrado em', tryPaths);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.text('Prakash', MARGIN_LEFT, HEADER_TOP);
        }
    } catch (e) {
      // Fallback em caso de erro ao carregar imagem
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('Prakash', MARGIN_LEFT, HEADER_TOP);
    }

    // Bloco da empresa alinhado à esquerda, com fonte igual ao cliente (8)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8); // igual ao lado direito
    const infoX = MARGIN_LEFT + 2;
    const shiftUp = 4;
    const displayName = companyTrade || companyName;
    if (displayName) pdf.text(displayName, infoX, HEADER_TOP + (14 - shiftUp));
    if (companyNif) pdf.text(`Contribuinte Nr: ${companyNif}`, infoX, HEADER_TOP + (18 - shiftUp));
    if (companyPhone) pdf.text(`Telefone: ${companyPhone}`, infoX, HEADER_TOP + (22 - shiftUp));
    if (companyEmail) pdf.text(`Email: ${companyEmail}`, infoX, HEADER_TOP + (26 - shiftUp));
    if (companyAddress) pdf.text(companyAddress, infoX, HEADER_TOP + (30 - shiftUp), { maxWidth: CONTENT_WIDTH / 2 - 18 });


    // Document type (top right)
    const normalizedType = this.normalizeDocumentType(document.documentType);
    const docTypeTitle = this.getDocumentTypeTitle(normalizedType || DocumentType.INVOICE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(docTypeTitle, PAGE_WIDTH - MARGIN_RIGHT, HEADER_TOP, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const viaLabel = printCount === 0 ? 'Original' : `${printCount + 0}ª Via, Em conformidade com o documento original`;
    pdf.text(viaLabel, PAGE_WIDTH - MARGIN_RIGHT, HEADER_TOP + 7, { align: 'right' });

    // Client block aligned to the right, smaller text and tight alignment
    const clientX = PAGE_WIDTH - MARGIN_RIGHT - 38;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    let lineY = HEADER_TOP + 12;
    const lineStep = 4; // tighter spacing between lines
    pdf.text('Exmo.(s) Sr.(s)', clientX, lineY, { align: 'right' });
    const buyerName = (document.buyer?.name && document.buyer.name.trim()) ? document.buyer.name : 'Consumidor final';
    lineY += lineStep;
    pdf.text(`Cliente: ${buyerName}`, clientX, lineY, { align: 'right' });
    const loc = (document.buyer?.address && document.buyer.address.trim()) ? document.buyer.address : 'ANGOLA - Luanda, Luanda, Luanda';
    pdf.setFontSize(8);
    lineY += lineStep;
    pdf.text(loc, clientX, lineY, { align: 'right', maxWidth: 70 });
    // Novo: NIF do cliente destacado e alinhado à direita
    if ((document.buyer?.nif || '').trim()) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      lineY += lineStep;
      pdf.text(`Contribuinte Nº: ${document.buyer.nif}`, clientX, lineY, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
    }

    try {
      const agtService = new AgtService();
      const qrData = await agtService.generateQrCodeData(document as any);
      const QR_SIZE = 30;
      const qrX = PAGE_WIDTH - MARGIN_RIGHT - QR_SIZE;
      const qrY = HEADER_TOP + 12;
      let drawn = false;
      try {
        const symbol = QR.create(qrData, { errorCorrectionLevel: 'M' });
        const modules = symbol.modules;
        const mSize: number = modules.size;
        const cell = QR_SIZE / mSize;
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
          const qrCodeImage = await agtService.generateQrCodeImage(document);
          pdf.addImage(qrCodeImage as any, 'PNG', qrX, qrY, QR_SIZE, QR_SIZE);
          drawn = true;
        } catch {}
      }
      if (!drawn) {
        try {
          pdf.setDrawColor(0);
          pdf.rect(qrX, qrY, QR_SIZE, QR_SIZE);
          pdf.setFontSize(6);
          pdf.text('Consultar FE:', qrX, qrY + QR_SIZE + 4);
          pdf.setFontSize(5);
          pdf.text(qrData, qrX, qrY + QR_SIZE + 7, { maxWidth: 60 });
        } catch {}
      }
    } catch (error) {
      const QR_SIZE = 30;
      const qrX = PAGE_WIDTH - MARGIN_RIGHT - QR_SIZE;
      const qrY = HEADER_TOP + 12;
      try {
        pdf.setDrawColor(0);
        pdf.rect(qrX, qrY, QR_SIZE, QR_SIZE);
        pdf.setFontSize(6);
        const agtService = new AgtService();
        let qrData = '';
        try { qrData = await agtService.generateQrCodeData(document as any); } catch {}
        pdf.text('Consultar FE:', qrX, qrY + QR_SIZE + 4);
        if (qrData) {
          pdf.setFontSize(5);
          pdf.text(qrData, qrX, qrY + QR_SIZE + 7, { maxWidth: 60 });
        } else {
          pdf.setFontSize(8);
          pdf.text('QR', qrX + QR_SIZE / 2, qrY + QR_SIZE / 2, { align: 'center' });
        }
      } catch {}
    }

    // Document number and series (usar o mesmo cálculo do QR/AGT)
    const docNumber = await (new AgtService()).computeAgtDocumentNo(document as any);
    
    // Definir início do conteúdo (abaixo do cabeçalho)
    this.contentStartY = HEADER_TOP + 52;

    // Referência do documento imediatamente acima da tabela de Data Emissão (mais baixa)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(docNumber, MARGIN_LEFT, this.contentStartY - 1);

    // Quando for Nota de Entrega/Guia, mostrar referência ao documento de origem (AGT)
    try {
      if (normalizedType === DocumentType.DELIVERY_NOTE) {
        const relatedIds = Array.isArray((document as any).relatedDocuments) ? (document as any).relatedDocuments : [];
        if (relatedIds.length > 0) {
          const src = documentStore.getDocument(String(relatedIds[0]));
          if (src) {
            const srcType = this.normalizeDocumentType(src.documentType) || DocumentType.INVOICE;
            const srcDocNo = await (new AgtService()).computeAgtDocumentNo(src as any);
            const refText = `Referente à ${this.getDocumentTypeTitle(srcType)} ${srcDocNo}`;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.text(refText, MARGIN_LEFT, this.contentStartY + 3);
            // Restaurar fonte padrão
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            // Empurrar início do conteúdo para baixo para evitar sobreposição
            this.contentStartY += 6;
          }
        }
      } else if (normalizedType === DocumentType.RECEIPT) {
        // Para Recibo, adicionar a referência ao documento de origem numa linha pequena abaixo do RC
        const relatedIds = Array.isArray((document as any).relatedDocuments) ? (document as any).relatedDocuments : [];
        if (relatedIds.length > 0) {
          const src = documentStore.getDocument(String(relatedIds[0]));
          if (src) {
            const srcType = this.normalizeDocumentType(src.documentType) || DocumentType.INVOICE;
            const srcDocNo = await (new AgtService()).computeAgtDocumentNo(src as any);
            const refText = `Referente à ${this.getDocumentTypeTitle(srcType)} ${srcDocNo}`;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.text(refText, MARGIN_LEFT, this.contentStartY + 3);
            // Restaurar fonte padrão
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            // Empurrar início do conteúdo para baixo para evitar sobreposição
            this.contentStartY += 6;
          }
        }
      } else if (normalizedType === DocumentType.INVOICE || normalizedType === DocumentType.INVOICE_RECEIPT) {
        // Factura/Factura-Recibo: mostrar Order Reference quando houver Proforma/Orçamento relacionado
        const relatedIds = Array.isArray((document as any).relatedDocuments) ? (document as any).relatedDocuments : [];
        if (relatedIds.length > 0) {
          const src = documentStore.getDocument(String(relatedIds[0]));
          if (src && (String(src.documentType).toLowerCase() === 'proforma' || String(src.documentType).toLowerCase() === 'orçamento')) {
            const srcDocNo = await (new AgtService()).computeAgtDocumentNo(src as any);
            const refText = `Referência de Encomenda: ${srcDocNo}`;
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(8);
            pdf.text(refText, MARGIN_LEFT, this.contentStartY + 3);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            this.contentStartY += 6;
          }
        }
      } else if (normalizedType === DocumentType.DEBIT_NOTE) {
        // Nota de Débito: sem menções "Referente"; apenas motivo/repasse se existirem
        const motivo = String((document as any).debitNoteReason || '').trim();
        const isRepasse = Boolean((document as any).expenseRepass);
        const lines: string[] = [];
        if (motivo) lines.push(`Motivo: ${motivo}`);
        if (isRepasse) lines.push('Menção: Repasse de Despesas');
        if (lines.length) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8);
          pdf.text(lines.join(' · '), MARGIN_LEFT, this.contentStartY + 3, { maxWidth: CONTENT_WIDTH });
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          this.contentStartY += 6;
        }
      }
    } catch {}
  }

  /**
   * Add document details section (dates, parties, etc.)
   */
  private addDocumentDetailsSection(pdf: jsPDF, document: IPdfDocument): void {
    let currentY = this.contentStartY;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);

    const headers = ['Data Emissão', 'Data Vencimento', 'Contribuinte', 'Período'];
    const colWidths = [42.5, 42.5, 42.5, 42.5];

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.1);
    pdf.line(MARGIN_LEFT, currentY, MARGIN_LEFT + CONTENT_WIDTH, currentY);

    let x = MARGIN_LEFT;
    headers.forEach((header, idx) => {
      pdf.text(header, x + 2, currentY + 4);
      pdf.setLineWidth(0.1);
      pdf.line(x, currentY + 5, x + colWidths[idx], currentY + 5);
      x += colWidths[idx];
    });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const issueDate = format(new Date(document.issueDate), 'yyyy-MM-dd', { locale: pt });
    const taxableDate = format(new Date(document.taxableDate), 'yyyy-MM-dd', { locale: pt });
    const nifValue = (document.buyer?.nif || '').trim();
    const contribuinte = nifValue ? nifValue : '';
    const period = format(new Date(document.issueDate), 'MM/yyyy', { locale: pt });
    const values = [issueDate, taxableDate, contribuinte, period];

    currentY += 6;
    x = MARGIN_LEFT;
    values.forEach((val, idx) => {
      pdf.text(val, x + 2, currentY + 2);
      pdf.setLineWidth(0.1);
      pdf.line(x, currentY + 3, x + colWidths[idx], currentY + 3);
      x += colWidths[idx];
    });

    pdf.setLineWidth(0.1);
    pdf.line(MARGIN_LEFT, currentY + 5, MARGIN_LEFT + CONTENT_WIDTH, currentY + 5);

    this.contentStartY = currentY + 6;
  }

  /**
   * Add line items table
   */
  private async addLineItemsTable(pdf: jsPDF, document: IPdfDocument): Promise<void> {
    // Para recibos e notas de entrega: alinhar "Cod.Produto" com a(s) factura(s) relacionada(s)
    let refInvoice: any = null;
    try {
      const isReceipt = document.documentType === DocumentType.RECEIPT;
      const isDelivery = document.documentType === DocumentType.DELIVERY_NOTE;
      if ((isReceipt || isDelivery) && Array.isArray((document as any).relatedDocuments)) {
        for (const rid of (document as any).relatedDocuments) {
          const d = documentStore.getDocument(String(rid));
          if (d && (String(d.documentType) === 'factura' || String(d.documentType) === 'factura_recibo')) { refInvoice = d; break; }
        }
      }
    } catch {}

    const invLines: Array<{ sku?: string; description?: string; quantity?: number; unitPrice?: number; vatRate?: number; vatExemptionReason?: string }> = Array.isArray(refInvoice?.lines) ? refInvoice.lines : [];
    const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const headerDisc = Number((document as any).headerDiscountAmount || 0);
    const basePerLine = document.lines.map(l => {
      let ls = this.round((l.quantity || 0) * (l.unitPrice || 0));
      if (ls === 0 && ((l as any).total || (l as any).lineTotal)) {
        ls = this.round(Number((l as any).total || (l as any).lineTotal));
      }
      const ld = this.round(ls * ((l.discount || 0) / 100));
      // Allow negative values for Credit Notes (remove Math.max(..., 0))
      return this.round(ls - ld);
    });
    const totalBase = this.round(basePerLine.reduce((s, v) => s + v, 0));
    const tableData = document.lines.map((line, idx) => {
      let code = line.sku || '';
      let desc = line.description || '';
      if (document.documentType === DocumentType.RECEIPT && invLines.length) {
        const hasExactSku = code && invLines.some(il => String(il.sku || '').trim() === String(code).trim());
        if (hasExactSku) {
          // Prefer exact SKU from recibo; reforçar descrição a partir da factura
          const match = invLines.find(il => String(il.sku || '').trim() === String(code).trim());
          if (match && match.description) desc = String(match.description);
        } else if ((code || '').startsWith('RC-')) {
          // Apenas quando recibo usa linhas agregadas, tentar mapear por taxa/descrição/posição
          const sameRate = invLines.filter(il => Number(il.vatRate || 0) === Number(line.vatRate || 0));
          const skuList = Array.from(new Set(sameRate.map(il => String(il.sku || '').trim()).filter(Boolean)));
          if (skuList.length === 1) {
            code = skuList[0];
            const match = sameRate.find(il => String(il.sku || '').trim() === code);
            if (match && match.description) desc = String(match.description);
          } else if (skuList.length > 1) {
            const joined = skuList.slice(0, 3).join(',');
            code = joined.length <= 20 ? joined : (joined.slice(0, 18) + '…');
            // para múltiplos, manter a descrição original do recibo
          } else {
            const receiptDesc = norm(line.description);
            const byDesc = invLines.find(il => norm(il.description) === receiptDesc);
            if (byDesc && byDesc.sku) {
              code = String(byDesc.sku);
              if (byDesc.description) desc = String(byDesc.description);
            } else if (invLines[idx] && invLines[idx].sku) {
              code = String(invLines[idx].sku);
              if (invLines[idx].description) desc = String(invLines[idx].description);
            }
          }
        }
      } else if (document.documentType === DocumentType.DELIVERY_NOTE && invLines.length) {
        // Nota de Entrega: se faltar SKU/descrição, herdar da factura relacionada
        const hasSku = (code || '').trim().length > 0;
        if (!hasSku) {
          const dnDesc = norm(line.description);
          const byDesc = invLines.find(il => norm(il.description) === dnDesc);
          if (byDesc && byDesc.sku) {
            code = String(byDesc.sku);
          } else if (invLines[idx] && invLines[idx].sku) {
            code = String(invLines[idx].sku);
          }
        }
        const matchBySku = invLines.find(il => String(il.sku || '').trim() === String(code).trim());
        if (matchBySku && matchBySku.description) {
          desc = String(matchBySku.description);
        }
      }

      let subtotal = this.round((line.quantity || 0) * (line.unitPrice || 0));
      if (subtotal === 0 && ((line as any).total || (line as any).lineTotal)) {
        subtotal = this.round(Number((line as any).total || (line as any).lineTotal));
      }
      const lineDisc = this.round(subtotal * ((line.discount || 0) / 100));
      // Remove Math.max to support Credit Notes (negative values)
      const baseNoTax = this.round(subtotal - lineDisc);
      const share = totalBase !== 0 ? this.round(headerDisc * (baseNoTax / totalBase)) : 0;
      const baseAfterHeader = this.round(baseNoTax - share);
      // Support negative quantities for effective unit price
      const effUnit = (line.quantity || 0) !== 0 ? baseAfterHeader / (line.quantity || 1) : 0;
      return [
        code,
        desc,
        this.formatCurrencyDec(effUnit, 4),
        line.unit || 'UN',
        (line.quantity || 0).toString(),
        `${line.discount || 0}%`,
        '0',
        `${line.vatRate || 0}%`,
        this.formatCurrency(baseAfterHeader)
      ];
    });

    // Observation neatly placed between dates section and product table
    // Observações: para Nota de Débito e Nota de Crédito, incluir referência, motivo e menção de Repasse
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    const normalizedType = this.normalizeDocumentType(document.documentType);
    let obsText = 'Os bens/Serviços foram colocados à disposição do adquirente na data do documento.';
    if (normalizedType === DocumentType.DEBIT_NOTE || normalizedType === DocumentType.CREDIT_NOTE) {
      const parts: string[] = [];
      const motivo = String((document as any).debitNoteReason || '').trim();
      const isRepasse = Boolean((document as any).expenseRepass);

      // 1. Prioritize computing reference from relatedDocuments to ensure accuracy (User Request)
      let computed = false;
      if (Array.isArray((document as any).relatedDocuments) && (document as any).relatedDocuments.length > 0) {
        try {
          const src = documentStore.getDocument(String((document as any).relatedDocuments[0]));
          if (src) {
            const srcType = this.normalizeDocumentType(src.documentType) || DocumentType.INVOICE;
            const agtService = new AgtService();
            let refNo = '';
            try {
              refNo = await agtService.computeAgtDocumentNo(src as any);
            } catch (e) {
              const srcCode = this.getDocumentTypeCode(srcType);
              const srcSeries = src.series || new Date(src.issueDate).getFullYear().toString();
              const srcSeq = String(src.sequentialNumber).padStart(4, '0');
              refNo = `${srcCode} ${srcSeries}/${srcSeq}`;
            }
            parts.push(`Referente à ${this.getDocumentTypeTitle(srcType)} ${refNo}`);
            computed = true;
          }
        } catch {}
      }

      // 2. Fallback to stored text fields if computation failed
      if (!computed) {
        const rn = String((document as any).referenceInvoiceNo || '').trim();
        const rd = String((document as any).referenceInvoiceDate || '').trim();
        if (rn && rd) parts.push(`Referente à factura nº ${rn} de ${rd}`);
        else if (rn) parts.push(`Referente à factura nº ${rn}`);
        else if (rd) parts.push(`Referente ao documento de ${rd}`);
      }

      if (motivo) parts.push(`Motivo: ${motivo}`);
      if (isRepasse) parts.push('Menção: Repasse de Despesas');
      const fallbackText = String((document as any).referenceText || '').trim();
      if (!parts.length && fallbackText) parts.push(fallbackText);
      obsText = parts.join(' · ');
      if (!obsText) {
        obsText = 'Documento emitido em conformidade com o regime aplicável.';
      }
    }
    pdf.text(obsText, MARGIN_LEFT, this.contentStartY + 4, { maxWidth: CONTENT_WIDTH });

    // Start product table with a small gap below observation
    const tableStartY = this.contentStartY + 7;

    autoTable(pdf, {
      startY: tableStartY,
       head: [['Cod.Produto', 'Descrição', 'Preço Uni.', 'Unid', 'Qtd', 'Desc %', 'IEC %', 'Taxa %', 'Total S/Imp']],
       body: tableData,
       theme: 'grid',
       styles: { fontSize: 7, cellPadding: 0.8, lineWidth: 0.1, valign: 'middle' },
       headStyles: { fontStyle: 'bold', fontSize: 7, fillColor: [255,255,255], textColor: [0,0,0], lineWidth: 0.1 },
       columnStyles: {
         0: { cellWidth: 18, halign: 'center', valign: 'middle' },
         1: { cellWidth: 42 },
         2: { cellWidth: 21, halign: 'right' },
         3: { cellWidth: 12, halign: 'center' },
         4: { cellWidth: 12, halign: 'center' },
         5: { cellWidth: 12, halign: 'center' },
         6: { cellWidth: 12, halign: 'center' },
         7: { cellWidth: 12, halign: 'center' },
         8: { cellWidth: 29, halign: 'right' }
       },
       margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT }
     });

     // Isenções: garantir motivo e referência (SKU) também quando a Nota de Entrega herda da factura
     const exemptions = document.lines.map((l, idx) => {
       const isZero = Number(l.vatRate || 0) === 0;
       let reason = l.vatExemptionReason || '';
       let skuRef = l.sku || '';
       if (document.documentType === DocumentType.DELIVERY_NOTE && invLines.length) {
         const dnDesc = norm(l.description);
         let match = invLines.find(il => norm(il.description) === dnDesc);
         if (!match && invLines[idx]) match = invLines[idx];
         if (match) {
           if (!reason) reason = String((match as any).vatExemptionReason || '');
           if (!skuRef) skuRef = String(match.sku || '');
         }
       }
       if (isZero && reason) {
         return `${skuRef || ''}: ${reason}`.trim();
       }
       return '';
     }).filter(Boolean);
     if (exemptions.length) {
       const y = (pdf as any).lastAutoTable.finalY + 6;
       pdf.setFont('helvetica', 'italic');
       pdf.setFontSize(7);
       pdf.text(`Isenções (0%): ${exemptions.join(', ')}`, MARGIN_LEFT, y, { maxWidth: CONTENT_WIDTH });
       this.contentStartY = y + 6;
     } else {
       this.contentStartY = (pdf as any).lastAutoTable.finalY + 10;
     }

// Removed duplicate observation after table per latest request
//
  }

  /**
   * Helper to round numbers (Round Half Up) for AGT compliance
   */
  private round(value: number, decimals: number = 2): number {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  }

  /**
   * Add tax summary section (Quadro Resumo de Imposto)
   */
  private addTaxSummary(pdf: jsPDF, document: IPdfDocument): void {
    let currentY = this.contentStartY;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    pdf.text('Quadro Resumo de Imposto', MARGIN_LEFT, currentY);
    currentY += 5;

    // Calculate VAT total with rounding to avoid floating point errors
    const vatTotalRaw = (document.totals.vatBreakdown || []).reduce((s, v) => s + (v.amount || 0), 0);
    const vatTotal = this.round(vatTotalRaw);

    // Quadro Resumo de Imposto
    const vatBreakdown = Array.isArray(document.totals.vatBreakdown) ? document.totals.vatBreakdown : [];
    const vatRows = vatBreakdown.map(v => [
      `IVA ${v.rate}%`,
      this.formatCurrency(v.base || 0),
      this.formatCurrency(this.round(v.amount || 0))
    ]);

    // Se estiver vazio, mostrar IVA 14% a zero para manter estrutura (ou regime de isenção)
    if (vatRows.length === 0) {
      vatRows.push(['IVA 14%', '0,00', '0,00']);
    }

    // Add mention of Cabinda Special Regime if applicable
    let isCabinda = false;
    try {
      const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
      const company = JSON.parse(raw);
      isCabinda = !!company.isCabinda;
    } catch {}

    autoTable(pdf, {
      startY: currentY,
      head: [['DESCRIÇÃO', 'INCIDÊNCIA', 'IMPOSTO']],
      body: vatRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.2, lineWidth: 0.1 },
      headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 55, halign: 'right' }, 2: { cellWidth: 55, halign: 'right' } },
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT }
    });

    if (isCabinda) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.text('Regime Especial de Tributação da Província de Cabinda (Lei n.º 12/21)', MARGIN_LEFT, (pdf as any).lastAutoTable.finalY + 4);
    }

    currentY = (pdf as any).lastAutoTable.finalY + 6;

    const boxW = 85; let boxH = 52; const totalsX = PAGE_WIDTH - MARGIN_RIGHT - boxW; const totalsY = currentY;
    pdf.setDrawColor(0,0,0); pdf.setLineWidth(0.1);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);

    const rowsText: Array<[string,string]> = [
      ['Total Ilíquido:', this.formatCurrency(document.totals.subtotal || 0)],
      ['Total Desconto:', this.formatCurrency((document.totals as any).discount || 0)],
      ['Total Imposto:', this.formatCurrency(vatTotal)],
      ['Total IEC:', '0,00'],
      ['Total Imposto Cativo:', '0,00'],
      ['Total Retenção na Fonte:', '0,00']
    ];
    let y = totalsY + 7;
    rowsText.forEach(([l,v]) => { pdf.text(l, totalsX + 2, y); pdf.text(v, totalsX + boxW - 2, y, { align: 'right' }); y += 5; });

    // underline 'Total Sem Retenção'
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    pdf.text('Total Sem Retenção:', totalsX + 2, y);
    pdf.text(this.formatCurrency(this.getGrossTotal(document.totals)), totalsX + boxW - 2, y, { align: 'right' });
    // Restaurar sublinhado original
    pdf.setLineWidth(0.15); pdf.line(totalsX + 2, y + 1.2, totalsX + boxW - 2, y + 1.2);
    y += 6;

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    const currencyRaw = ((document as any)?.totals?.currency || (document as any)?.currency || 'AOA');
    const currencyLabel = String(currencyRaw).toUpperCase() === 'AOA' ? 'Kz' : String(currencyRaw).toUpperCase();
    pdf.text(`Total (${currencyLabel}):`, totalsX + 2, y);
    pdf.text(this.formatCurrency(this.getGrossTotal(document.totals)), totalsX + boxW - 2, y, { align: 'right' });

    // Add partial payment information if receipts exist
    // Calcular o valor total pago somando todos os recibos relacionados
    let totalPaidAmount = 0;
    try {
      if (Array.isArray((document as any).relatedDocuments)) {
        for (const rid of (document as any).relatedDocuments) {
          const d = documentStore.getDocument(String(rid));
          if (d && (this.normalizeDocumentType(d.documentType) === DocumentType.RECEIPT)) {
            totalPaidAmount += (d.totals?.total ?? d.payment?.paidAmount ?? 0);
          }
        }
      }
    } catch { /* ignore lookup errors */ }

    // Se não houver recibos, usar o paidAmount do próprio documento (fallback)
    if (totalPaidAmount === 0) {
      totalPaidAmount = document.payment?.paidAmount || 0;
    }
    
    // Ensure totalPaidAmount is rounded
    totalPaidAmount = this.round(totalPaidAmount);

    const totalAmount = this.getGrossTotal(document.totals);
    const remainingAmount = this.round(totalAmount - totalPaidAmount);

    // Exibir para faturas e notas de débito quando houver pagamento parcial real
    const isInvoiceOrDebit = (
      document.documentType === DocumentType.INVOICE ||
      document.documentType === DocumentType.INVOICE_RECEIPT ||
      document.documentType === DocumentType.DEBIT_NOTE
    );
    if (isInvoiceOrDebit && totalPaidAmount > 0 && remainingAmount > 0) {
      // Add extra spacing before paid amount for readability
      y += 8;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
      pdf.text('Valor já pago:', totalsX + 2, y);
      pdf.text(this.formatCurrency(totalPaidAmount), totalsX + boxW - 2, y, { align: 'right' });
      
      // Slightly increase spacing before amount due
      y += 7;
      pdf.text('Valor por pagar:', totalsX + 2, y);
      pdf.text(this.formatCurrency(remainingAmount), totalsX + boxW - 2, y, { align: 'right' });
      pdf.setLineWidth(0.15); pdf.line(totalsX + 2, y + 1.2, totalsX + boxW - 2, y + 1.2);
      // Ensure the totals box extends to cover the payment lines
      boxH = Math.max(boxH, (y - totalsY) + 6);
    } else if (document.documentType === DocumentType.RECEIPT) {
      // Recibos: calcular o valor em dívida com base no documento de origem (factura ou nota de débito)
      let originTotal = 0;
      let paidSoFar = 0;
      try {
        const relatedIds = Array.isArray((document as any).relatedDocuments) ? (document as any).relatedDocuments : [];
        if (relatedIds.length > 0) {
          const src = documentStore.getDocument(String(relatedIds[0]));
          const srcType = src ? this.normalizeDocumentType(src.documentType) : null;
          if (src && (srcType === DocumentType.INVOICE || srcType === DocumentType.INVOICE_RECEIPT || srcType === DocumentType.DEBIT_NOTE)) {
            originTotal = Number(((src as any)?.totals?.total) || 0);
            if (Array.isArray(src.relatedDocuments)) {
              for (const rr of src.relatedDocuments) {
                const rd = documentStore.getDocument(String(rr));
                if (rd && this.normalizeDocumentType(rd.documentType) === DocumentType.RECEIPT) {
                  paidSoFar += Number(((rd as any)?.totals?.total) || rd.payment?.paidAmount || 0);
                }
              }
            }
          }
        }
      } catch { /* ignore */ }
      
      // Ensure values are rounded
      originTotal = this.round(originTotal);
      paidSoFar = this.round(paidSoFar);
      
      const remainingAfterThis = Math.max(this.round(originTotal - paidSoFar), 0);
      if (remainingAfterThis > 0 && paidSoFar > 0) {
        y += 8;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
        pdf.text('Valor já pago:', totalsX + 2, y);
        pdf.text(this.formatCurrency(paidSoFar), totalsX + boxW - 2, y, { align: 'right' });
        y += 7;
        pdf.text('Valor por pagar:', totalsX + 2, y);
        pdf.text(this.formatCurrency(remainingAfterThis), totalsX + boxW - 2, y, { align: 'right' });
        pdf.setLineWidth(0.15); pdf.line(totalsX + 2, y + 1.2, totalsX + boxW - 2, y + 1.2);
        boxH = Math.max(boxH, (y - totalsY) + 6);
      }
    }

    // Draw totals box after computing dynamic height so it closes neatly
    pdf.setLineWidth(0.1);
    pdf.rect(totalsX, totalsY, boxW, boxH);

    const wordsBoxW = boxW; const wordsY = y + 6;
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7);
    const words = PdfService.amountInWordsPtAOA(this.getGrossTotal(document.totals));
    // Altura dinâmica para evitar a borda cortar o texto quando houver múltiplas linhas
    const wordsLines = pdf.splitTextToSize(words, wordsBoxW - 4);
    const lineH = 4; // altura aproximada por linha
    const wordsBoxH = Math.max(14, (wordsLines.length * lineH) + 6);
    // Reverter para retângulo completo em volta do "valor por extenso"
    pdf.setLineWidth(0.1);
    pdf.rect(totalsX, wordsY, wordsBoxW, wordsBoxH);
    pdf.text(wordsLines, totalsX + 2, wordsY + 5);

    // Coordenadas Bancárias pequenas à esquerda do quadro de totais (omit for Proforma)
    let bankBlockBottomY = 0;
    if (document.documentType !== DocumentType.PROFORMA) {
      let accounts: Array<{ bankName?: string; accountNumber?: string; iban?: string }> = [];
      try {
        const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
        const company = JSON.parse(raw);
        accounts = Array.isArray(company.bankAccounts) ? company.bankAccounts : [];
      } catch {}

      const banksX = MARGIN_LEFT; const banksY = totalsY; const leftW = totalsX - MARGIN_LEFT - 4;
      // Adjust column widths: further reduce Banco, expand Conta, keep IBAN
      const colW = [leftW * 0.22, leftW * 0.28, leftW * 0.50];
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
      pdf.text('Coordenadas Bancárias', banksX, banksY);
      // Header labels with thin underline (invisible grid)
      const headers = ['Banco', 'Conta', 'Iban'];
      let hx = banksX; const headerY = banksY + 4;
      pdf.setLineWidth(0.1);
      headers.forEach((h, i) => { pdf.text(h, hx + 2, headerY); pdf.line(hx, headerY + 1, hx + colW[i], headerY + 1); hx += colW[i]; });
      // Values rows with thin underline (all accounts)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
      let bankBlockBottomY = headerY + 4;
      const rowHeight = 4; // text row height
      const underlineOffset = 1;
      (accounts.length ? accounts : [{}]).forEach((acc) => {
        let vx = banksX; const valuesY = bankBlockBottomY;
        [acc.bankName || '', acc.accountNumber || '', acc.iban || ''].forEach((val, i) => { pdf.text(val, vx + 2, valuesY); pdf.line(vx, valuesY + underlineOffset, vx + colW[i], valuesY + underlineOffset); vx += colW[i]; });
        bankBlockBottomY = valuesY + rowHeight;
      });
     }
 
const bankFinalY = Math.max(bankBlockBottomY || 0, ((pdf as any).lastAutoTable?.finalY) || (totalsY + boxH));

    // Avançar o conteúdo até o máximo entre a parte direita e esquerda
    this.contentStartY = Math.max(totalsY + boxH, bankFinalY) + 16;
  }

  /**
   * Amount in words helper (Portuguese, Angola)
   */
  public static amountInWordsPtAOA(value: number): string {
    const u = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
    const e10 = ['dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
    const d = ['','dez','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
    const c = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
    const chunk = (n: number): string => {
      const hundreds = Math.floor(n/100), tens = Math.floor((n%100)/10), ones = n%10;
      let out = '';
      if (hundreds) out += hundreds === 1 && (tens||ones) ? 'cento' : c[hundreds];
      if (tens === 1) { out += (out?' e ':'') + e10[ones]; return out; }
      if (tens) out += (out?' e ':'') + d[tens];
      if (ones) out += (out?' e ':'') + u[ones];
      return out || 'zero';
    };
    const parts: string[] = [];
    const abs = Math.floor(Math.abs(value));
    const billions = Math.floor(abs/1_000_000_000);
    const millions = Math.floor((abs%1_000_000_000)/1_000_000);
    const thousands = Math.floor((abs%1_000_000)/1000);
    const rest = abs%1000;
    if (billions) parts.push(`${chunk(billions)} ${billions===1?'mil milhão':'mil milhões'}`);
    if (millions) parts.push(`${chunk(millions)} ${millions===1?'milhão':'milhões'}`);
    if (thousands) parts.push(`${chunk(thousands)} ${thousands===1?'mil':'mil'}`);
    if (rest) parts.push(chunk(rest));
    const words = parts.join(' ');
    const sign = value<0?'menos ':'';
    const cents = Math.round((Math.abs(value) - abs)*100);
    if (cents) {
      const centsChunk = chunk(cents).replace(/ /g, '\u00A0');
      // Usar espaços não separáveis para manter "Kwanzas e <cêntimos>" numa única linha
      const out = `${sign}${words} Kwanzas\u00A0e\u00A0${centsChunk}\u00A0cêntimos`;
      return out.replace(/ {2,}/g,' ').trim();
    }
    const out = `${sign}${words} Kwanzas`;
    return out.replace(/ {2,}/g,' ').trim();
  }

  /**
   * Add payment section for Factura-Recibo documents
   */
  private addPaymentSection(pdf: jsPDF, document: IPdfDocument): void {
    // Show bank coordinates whenever payment info exists (not only FR)
    if (!document.payment) return;

    let currentY = this.contentStartY;

    // Payment details header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Coordenadas Bancárias', MARGIN_LEFT, currentY);
    currentY += 8;

    // Bank details from company.json (all accounts)
    let rows: Array<[string, string, string]> = [];
    try {
      const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
      const company = JSON.parse(raw);
      const accounts: Array<{ bankName?: string; accountNumber?: string; iban?: string }> = Array.isArray(company.bankAccounts) ? company.bankAccounts : [];
      rows = accounts.map(acc => [acc.bankName || '', acc.accountNumber || '', acc.iban || '']);
    } catch {}
    if (rows.length === 0) rows = [['', '', '']];

    // Mini table Banco · Conta · Iban with adjusted column widths
    autoTable(pdf, {
      startY: currentY,
      head: [['Banco', 'Conta', 'Iban']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [240,240,240], textColor: [0,0,0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 55 }, 2: { cellWidth: CONTENT_WIDTH - 100 } },
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT }
    });

    this.contentStartY = (pdf as any).lastAutoTable.finalY + 8;
  }

  /**
   * Add document footer with AGT validation info
   */
  private addDocumentFooter(pdf: jsPDF, document: IPdfDocument): void {
    const pageHeight = pdf.internal.pageSize.getHeight();
    let footerY = pageHeight - 40;

    if (this.contentStartY > footerY - 20) {
      pdf.addPage();
      footerY = pageHeight - 40;
    }

    let showWatermark = true;
    try {
      const installed = readInstalledLicense();
      const result = installed.key ? verifyLicenseKey(installed.key, { allowExtension: true }) : { valid: false };
      showWatermark = !result.valid;
    } catch {}
    if (showWatermark) {
      try {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(200);
        pdf.setFontSize(28);
        pdf.text('DOCUMENTO EMITIDO PARA FINS DE FORMAÇÃO', PAGE_WIDTH / 2, pageHeight / 2, { align: 'center', angle: 45 });
        pdf.setTextColor(0);
      } catch {}
    }

    if (document.documentType !== DocumentType.INVOICE && 
        document.documentType !== DocumentType.INVOICE_RECEIPT && 
        document.documentType !== DocumentType.RECEIPT &&
        document.documentType !== DocumentType.SELF_BILLING_INVOICE_RECEIPT &&
        document.documentType !== DocumentType.GLOBAL_INVOICE &&
        document.documentType !== DocumentType.GENERIC_INVOICE) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text('Este Documento não serve de Factura', PAGE_WIDTH / 2, footerY, { align: 'center' });
    }

    let certNo = '';
    let productCompanyTaxId = '';
    let regime = '';
    let isCabinda = false;
    let productVersion = '1.0.3';
    try {
      const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
      const company = JSON.parse(raw);
      certNo = company.saftSoftwareCertificateNumber || '';
      productCompanyTaxId = company.saftProductCompanyTaxId || '';
      regime = company.regime || '';
      isCabinda = !!company.isCabinda;
      productVersion = company.saftProductVersion || productVersion;
    } catch {}

    try {
      const rawSys = fs.readFileSync(systemJsonPath(), 'utf-8');
      const sys = JSON.parse(rawSys);
      certNo = sys.saftSoftwareCertificateNumber || certNo;
      productVersion = sys.saftProductVersion || productVersion;
      productCompanyTaxId = sys.saftProductCompanyTaxId || productCompanyTaxId;
    } catch {}

    footerY += 15;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    let hashRaw = '';
    try {
      hashRaw = String(document.hash || '');
      if (!hashRaw) {
        const agt = new AgtService();
        hashRaw = agt.generateDocumentHash(document as any);
      }
    } catch {}
    let hash4 = (hashRaw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (hash4.length < 4) hash4 = (hash4 + 'XXXX').slice(0, 4);
    else hash4 = hash4.slice(-4);
    const certLine = `${hash4} - Processado por programa válido FE/162/AGT/2026`;
    pdf.text(certLine, MARGIN_LEFT, footerY);
    
    footerY += 4;
    pdf.setFont('helvetica', 'normal');
    const emitDate = document.createdAt ? new Date(document.createdAt) : new Date(document.issueDate);
    const issueStr = format(emitDate, 'dd-MM-yyyy HH:mm:ss', { locale: pt });
    pdf.text(`Ingresso em ${issueStr} Utilizador: admin`, MARGIN_LEFT, footerY);

    // Page numbering
    footerY += 10;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.text(`página ${i} de ${totalPages}`, PAGE_WIDTH / 2, pageHeight - 15, { align: 'center' });
      pdf.text('Utilizador: admin', PAGE_WIDTH - MARGIN_RIGHT, pageHeight - 15, { align: 'right' });
    }

    // Software signature (dynamic)
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(7);
    const versionDisplay = `V.${String(productVersion || '').replace(/^\s*[vV]\.?/,'')}`;
    pdf.text(
      `Software: Prakash ${versionDisplay} · Empresa Registada NIF: ${productCompanyTaxId}`,
      MARGIN_LEFT,
      pageHeight - 10
    );
    pdf.setFont('helvetica', 'normal');
    const regimeText = regime ? `Regime: ${regime}` : 'Regime: Geral';
    const cabindaSuffix = isCabinda ? ' · Província de Cabinda' : '';
    pdf.text(regimeText + cabindaSuffix, MARGIN_LEFT, pageHeight - 5);
  }

  private addCancellationStampIfNeeded(pdf: jsPDF, document: IPdfDocument): void {
    const status = String(document.status || '').toLowerCase();
    const cancelled = /cancel|anul/.test(status);
    if (!cancelled) return;
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    try {
      pdf.setTextColor(200, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(32);
      pdf.text('DOCUMENTO ANULADO', w / 2, h / 2, { align: 'center', angle: 45 });
      pdf.setTextColor(0, 0, 0);
    } catch {}
  }

  /**
   * Get document type title in Portuguese
   */
  private getDocumentTypeTitle(documentType: DocumentType): string {
    const titleMap: Record<DocumentType, string> = {
      [DocumentType.INVOICE]: 'FACTURA',
      [DocumentType.QUOTE]: 'ORÇAMENTO',
      [DocumentType.CREDIT_NOTE]: 'NOTA DE CRÉDITO',
      [DocumentType.RECEIPT]: 'RECIBO',
      [DocumentType.DELIVERY_NOTE]: 'GUIA DE REMESSA',
      [DocumentType.DEBIT_NOTE]: 'NOTA DE DÉBITO',
      [DocumentType.INVOICE_RECEIPT]: 'FACTURA-RECIBO',
      [DocumentType.PROFORMA]: 'PROFORMA',
      [DocumentType.OTHER_RECEIPT]: 'OUTROS RECIBOS',
      [DocumentType.AVISO_COBRANCA]: 'AVISO DE COBRANÇA',
      [DocumentType.GENERIC_INVOICE]: 'FACTURA GENÉRICA',
      [DocumentType.GLOBAL_INVOICE]: 'FACTURA GLOBAL',
      [DocumentType.SELF_BILLING_INVOICE_RECEIPT]: 'FACTURA-RECIBO (AUTOFACTURAÇÃO)',
      [DocumentType.REVERSAL_RECEIPT]: 'RECIBO DE ESTORNO',
      [DocumentType.ADVANCE_INVOICE]: 'FACTURA DE ADIANTAMENTO',
      [DocumentType.PAYMENT_NOTICE_RECEIPT]: 'AVISO DE COBRANÇA/RECIBO'
    };
    return titleMap[documentType] || 'DOCUMENTO';
  }

  /**
   * Get document type code for numbering
   */
  private getDocumentTypeCode(documentType: DocumentType): string {
    const codeMap: Record<DocumentType, string> = {
      [DocumentType.INVOICE]: 'FT',
      [DocumentType.QUOTE]: 'OR',
      [DocumentType.CREDIT_NOTE]: 'NC',
      [DocumentType.RECEIPT]: 'RC',
      [DocumentType.DELIVERY_NOTE]: 'GR',
      [DocumentType.DEBIT_NOTE]: 'ND',
      [DocumentType.INVOICE_RECEIPT]: 'FR',
      [DocumentType.PROFORMA]: 'PP',
      [DocumentType.OTHER_RECEIPT]: 'RG',
      [DocumentType.AVISO_COBRANCA]: 'AC',
      [DocumentType.GENERIC_INVOICE]: 'GF',
      [DocumentType.GLOBAL_INVOICE]: 'FG',
      [DocumentType.SELF_BILLING_INVOICE_RECEIPT]: 'FR',
      [DocumentType.REVERSAL_RECEIPT]: 'RE',
      [DocumentType.ADVANCE_INVOICE]: 'FA',
      [DocumentType.PAYMENT_NOTICE_RECEIPT]: 'AR'
    };
    return codeMap[documentType] || 'DOC';
  }


  /**
   * Format currency according to Angola standards
   */
  private formatCurrency(value: number): string {
    try {
      if (typeof value !== 'number' || isNaN(value)) return '0,00';
      const sign = value < 0 ? '-' : '';
      const abs = Math.abs(value);
      const [intPart, decPart] = abs.toFixed(2).split('.');
      const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return `${sign}${intWithDots},${decPart}`;
    } catch {
      return '0,00';
    }
  }
  private formatCurrencyDec(value: number, decimals: number): string {
    try {
      if (typeof value !== 'number' || isNaN(value)) return '0,00';
      const d = Math.max(0, Math.min(8, Math.floor(decimals)));
      const sign = value < 0 ? '-' : '';
      const abs = Math.abs(value);
      const [intPart, decPart] = abs.toFixed(d).split('.');
      const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return d > 0 ? `${sign}${intWithDots},${decPart}` : `${sign}${intWithDots}`;
    } catch {
      return '0,00';
    }
  }

  /**
   * Translate payment method to Portuguese
   */
  private translatePaymentMethod(method?: string): string {
    const methodMap: Record<string, string> = {
      'bank_transfer': 'Transferência bancária',
      'cash': 'Dinheiro',
      'card': 'Cartão',
      'mobile_money': 'Dinheiro móvel',
      'other': 'Outro'
    };
    return methodMap[method || ''] || method || 'N/A';
  }

  /**
   * Translate payment status to Portuguese
   */
  private translatePaymentStatus(status?: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'Pendente',
      'partial': 'Parcial',
      'paid': 'Pago',
      'received': 'Recebido'
    };
    return statusMap[status || ''] || status || 'N/A';
  }

  /**
   * Translate document status to Portuguese
   */
  private translateDocumentStatus(status?: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'Rascunho',
      'issued': 'Emitido',
      'paid': 'Pago',
      'cancelled': 'Cancelado'
    };
    return statusMap[status || ''] || status || 'N/A';
  }
  private normalizeDocumentType(type?: string): DocumentType | null {
    const s = String(type || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    switch (s) {
      case 'factura':
      case 'invoice':
      case 'ft':
        return DocumentType.INVOICE;
      case 'orcamento':
      case 'quote':
      case 'budget':
        return DocumentType.QUOTE;
      case 'nota_de_credito':
      case 'credit_note':
      case 'nc':
        return DocumentType.CREDIT_NOTE;
      case 'recibo':
      case 'receipt':
      case 'rc':
        return DocumentType.RECEIPT;
      case 'nota_de_entrega':
      case 'guia_de_remessa':
      case 'transport_guide':
      case 'gr':
        return DocumentType.DELIVERY_NOTE;
      case 'nota_de_debito':
      case 'debit_note':
      case 'nd':
        return DocumentType.DEBIT_NOTE;
      case 'factura_recibo':
      case 'invoice_receipt':
      case 'fr':
        return DocumentType.INVOICE_RECEIPT;
      case 'proforma':
      case 'pp':
        return DocumentType.PROFORMA;
      case 'aviso_cobranca':
      case 'ac':
        return DocumentType.AVISO_COBRANCA;
      case 'outros_recibos':
      case 'rg':
        return DocumentType.OTHER_RECEIPT;
      case 'factura_generica':
      case 'gf':
        return DocumentType.GENERIC_INVOICE;
      case 'factura_global':
      case 'fg':
        return DocumentType.GLOBAL_INVOICE;
      case 'factura_recibo_autofacturacao':
      case 'fr_auto':
      case 'self_billing':
        return DocumentType.SELF_BILLING_INVOICE_RECEIPT;
      case 'recibo_estorno':
      case 're':
        return DocumentType.REVERSAL_RECEIPT;
      case 'factura_adiantamento':
      case 'fa':
        return DocumentType.ADVANCE_INVOICE;
      case 'aviso_cobranca_recibo':
      case 'ar':
        return DocumentType.PAYMENT_NOTICE_RECEIPT;
      default:
        return null;
    }
  }
  // Helper seguro para obter o total bruto (compatível com estruturas atuais e legadas)
  private getGrossTotal(totals: ITotals): number {
    try {
      const t = (totals as any) || {};
      return Number(t.total ?? t.grandTotal ?? 0);
    } catch {
      return 0;
    }
  }
}
export default PdfService
