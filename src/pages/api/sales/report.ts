import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { companyJsonPath } from '../../../lib/dataPaths';

const HEADER_TOP = 36;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { startDate, endDate, type, series, warehouseId } = req.query;

    const start = typeof startDate === 'string' && startDate ? new Date(startDate) : null;
    const end = typeof endDate === 'string' && endDate ? new Date(endDate) : null;
    const typeFilter = typeof type === 'string' && type ? type : 'all';
    const seriesRaw = Array.isArray(series) ? series.join(',') : (typeof series === 'string' ? series : '');
    const seriesList = seriesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const warehouseFilter = typeof warehouseId === 'string' && warehouseId ? warehouseId : '';

    const allDocs = documentStore.getAllDocuments();
    // Restrict to active company (seller fields) if available
    let activeNif: string = '';
    let activeName: string = '';
    let activeTradeName: string = '';
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
    const scopedDocs = allDocs.filter(d => {
      const s = (d as any).seller || {};
      return (activeNif && s.nif && norm(s.nif) === norm(activeNif))
        || (activeTradeName && s.tradeName && norm(s.tradeName) === norm(activeTradeName))
        || (activeName && s.name && norm(s.name) === norm(activeName));
    });
    const docs = scopedDocs.filter((d) => {
      const issue = new Date(d.issueDate);
      const inRange = (!start || issue >= start) && (!end || issue <= end);
      const typeOk = typeFilter === 'all' ? true : d.documentType === typeFilter;
      const seriesOk = seriesList.length > 0 ? seriesList.includes(d.series) : true;
      const warehouseOk = warehouseFilter ? (d as any).warehouseId === warehouseFilter : true; // documents may not have warehouseId
      return inRange && typeOk && seriesOk && warehouseOk;
    });

    // Excluir recibos e Factura-Recibo vinculados a uma factura (para evitar dupla contagem)
    const saleDocs = docs.filter((d) => {
      if (d.documentType === 'recibo') return false;
      if (d.documentType === 'factura_recibo') {
        const hasOrigin = Array.isArray(d.relatedDocuments) && d.relatedDocuments.length > 0;
        return !hasOrigin;
      }
      return true;
    });

    // AGT Compliance: Rounding helper (Round Half Up)
    const round = (value: number, decimals: number = 2): number => {
      return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    };

    // Calculate totals and VAT breakdown aggregates com deduplicação
    const totals = saleDocs.reduce(
      (acc, d) => {
        acc.subtotal = round(acc.subtotal + (d.totals?.subtotal || 0));
        acc.discount = round(acc.discount + (d.totals?.discount || 0));
        acc.vatTotal = round(acc.vatTotal + (d.totals?.vatTotal || 0));
        acc.total = round(acc.total + (d.totals?.total || 0));
        // VAT breakdown
        (d.totals?.vatBreakdown || []).forEach((br: any) => {
          const rate = Number(br.rate) || 0;
          const entry = acc.vatSummary.get(rate) || { base: 0, amount: 0 };
          entry.base = round(entry.base + (br.base || 0));
          entry.amount = round(entry.amount + (br.amount || 0));
          acc.vatSummary.set(rate, entry);
        });
        return acc;
      },
      { subtotal: 0, discount: 0, vatTotal: 0, total: 0, vatSummary: new Map<number, { base: number; amount: number }>() }
    );

    const byType: Record<string, number> = {};
    saleDocs.forEach((d) => {
      const key = d.documentType || 'desconhecido';
      byType[key] = round((byType[key] || 0) + (d.totals?.total || 0));
    });

    // Company & software metadata (env overrides + fallbacks from documents)
    let companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || docs[0]?.seller?.name || 'Empresa';
    let businessName = process.env.NEXT_PUBLIC_COMPANY_TRADENAME || docs[0]?.seller?.tradeName || companyName;
    let companyNif = process.env.NEXT_PUBLIC_COMPANY_NIF || docs[0]?.seller?.nif || '';
    let companyAddress = process.env.NEXT_PUBLIC_COMPANY_ADDRESS || docs[0]?.seller?.address || '';
    let companyEmail = process.env.NEXT_PUBLIC_COMPANY_EMAIL || docs[0]?.seller?.email || '';
    let companyPhone = process.env.NEXT_PUBLIC_COMPANY_PHONE || docs[0]?.seller?.phone || '';

    // Override from persistent company settings if available
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const raw = fs.readFileSync(companyPath, 'utf-8');
        const cfg = raw ? JSON.parse(raw) : {};
        companyName = cfg.name || cfg.tradeName || companyName;
        businessName = cfg.tradeName || cfg.name || businessName;
        companyNif = cfg.nif || companyNif;
        companyAddress = cfg.address || companyAddress;
        companyEmail = cfg.email || companyEmail;
        companyPhone = cfg.phone || companyPhone;
      }
    } catch {}

    const productId = process.env.NEXT_PUBLIC_SAFT_PRODUCT_ID || 'Prakash';
    const productVersion = process.env.NEXT_PUBLIC_SAFT_PRODUCT_VERSION || '1.0';
    const productCompanyTaxId = process.env.NEXT_PUBLIC_SAFT_PRODUCT_COMPANY_TAX_ID || companyNif || '';
    const softwareCertificateNumber = process.env.NEXT_PUBLIC_SAFT_SOFTWARE_CERTIFICATE_NUMBER || '0';

    // Attempt to load logo (optional)
    let logoDataUrl: string | null = null;
    try {
      const logoEnv = process.env.NEXT_PUBLIC_COMPANY_LOGO; // e.g. "/logo.png"
      const logoPath = logoEnv
        ? path.join(process.cwd(), 'public', logoEnv.replace(/^\//, ''))
        : path.join(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const ext = path.extname(logoPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : '';
        if (mime) {
          const base = fs.readFileSync(logoPath).toString('base64');
          logoDataUrl = `data:${mime};base64,${base}`;
        }
      }
    } catch {}

    // Build PDF
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = (pdf.internal as any).pageSize.getWidth ? (pdf.internal as any).pageSize.getWidth() : 210;
    const pageHeight = (pdf.internal as any).pageSize.getHeight ? (pdf.internal as any).pageSize.getHeight() : 297;

    // Header renderer for each page
    const drawHeader = (doc: jsPDF) => {
      // Cabeçalho básico (ainda mais antigo)
      // Logo
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', 12, 12, 14, 14); } catch {}
      }

      // Company block
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(businessName, 28, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`NIF: ${companyNif}`, 28, 20);
      if (companyAddress) doc.text(companyAddress, 28, 24);

      // Report title and meta
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Relatório de Vendas', pageWidth - 12, 16, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: pt });
      doc.text(`Gerado em: ${nowStr}`, pageWidth - 12, 20, { align: 'right' });
      const rangeText = `Período: ${start ? format(start, 'dd/MM/yyyy', { locale: pt }) : '—'} a ${end ? format(end, 'dd/MM/yyyy', { locale: pt }) : '—'}`;
      doc.text(rangeText, pageWidth - 12, 24, { align: 'right' });

      // Software identification line
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.text(
        `Software: ${productId} v${productVersion} · Empresa Registada NIF: ${productCompanyTaxId} · Email: ${companyEmail || '-'}`,
        12,
        28
      );
    };

    // First header
    drawHeader(pdf);

    // Totals block
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Resumo de Totais', 12, 36);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const lines = [
      `Subtotal: ${formatCurrency(totals.subtotal)} AOA`,
      `Desconto: ${formatCurrency(totals.discount)} AOA`,
      `IVA: ${formatCurrency(totals.vatTotal)} AOA`,
      `Total: ${formatCurrency(totals.total)} AOA`,
      `Documentos: ${saleDocs.length}`,
    ];
    let y = 41;
    for (const l of lines) { pdf.text(l, 12, y); y += 5; }

    // Totais por Tipo
    pdf.setFont('helvetica', 'bold');
    pdf.text('Totais por Tipo de Documento', 80, 36);
    pdf.setFont('helvetica', 'normal');
    let yTypes = 41;
    Object.entries(byType).forEach(([k, v]) => { pdf.text(`${labelForType(k)}: ${formatCurrency(v)} AOA`, 80, yTypes); yTypes += 5; });

    // VAT breakdown table
    const vatRows = Array.from(totals.vatSummary.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, val]) => [ `${rate}%`, formatCurrency(val.base), formatCurrency(val.amount) ]);
    if (vatRows.length > 0) {
      autoTable(pdf, {
        startY: Math.max(y, yTypes) + 6,
        head: [["Taxa", "Base (AOA)", "IVA (AOA)"]],
        body: vatRows,
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
        theme: 'grid',
        margin: { top: HEADER_TOP, left: 12, right: 12, bottom: 24 },
        didDrawPage: () => {
          drawHeader(pdf);
          // Rodapé AGT ajustado para baixo, mantendo área livre
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.text('Documento processado por programa certificado pela AGT', pageWidth / 2, pageHeight - 15, { align: 'center' });
        },
      });
    }

    // Table of documents
    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 6 : Math.max(y, yTypes) + 12,
      head: [["Série/Nº", "Tipo", "Data", "Cliente", "NIF", "Total (AOA)"]],
      body: saleDocs.map((d) => [
        `${d.series}-${String(d.sequentialNumber).padStart(4, '0')}`,
        labelForType(d.documentType),
        format(new Date(d.issueDate), 'dd/MM/yyyy', { locale: pt }),
        d.buyer?.name || '',
        (d.buyer as any)?.nif || '',
        formatCurrency(d.totals?.total || 0)
      ]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      theme: 'grid',
      margin: { top: HEADER_TOP, left: 12, right: 12, bottom: 24 },
      didDrawPage: () => {
        drawHeader(pdf);
        // Rodapé AGT ajustado para baixo, conforme requisitos
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.text('Documento processado por programa certificado pela AGT', pageWidth / 2, pageHeight - 15, { align: 'center' });
      },
    });

    // Signature / responsibility block
    const finalY = (pdf as any).lastAutoTable?.finalY || 260;
    const sigTop = Math.min(finalY + 8, pageHeight - 45);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Responsável:', 12, sigTop);
    pdf.line(35, sigTop, 95, sigTop);
    pdf.text('Carimbo & Assinatura', 35, sigTop + 5);

    // Contacts
    if (companyEmail) {
      pdf.setFontSize(8);
      pdf.text(`Contacto: ${companyEmail}`, pageWidth - 12, sigTop, { align: 'right' });
    }

    // Authenticity hash and QR code (for report)
    try {
      const startFmt = start ? format(start, 'yyyy-MM-dd', { locale: pt }) : '';
      const endFmt = end ? format(end, 'yyyy-MM-dd', { locale: pt }) : '';
      const reportMeta = {
        report: 'sales_summary',
        companyNif,
        period: { start: startFmt, end: endFmt },
        type: typeFilter,
        series: seriesList.length > 0 ? seriesList : ['all'],
        warehouseId: warehouseFilter || null,
        count: saleDocs.length,
        total: totals.total,
        generatedAt: new Date().toISOString()
      };
      const hash = crypto.createHash('sha256').update(JSON.stringify(reportMeta)).digest('hex').slice(0, 16);
      const qrData = JSON.stringify({ ...reportMeta, hash });
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 1,
        scale: 4,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      // Place QR at right side of signature block (lowered to avoid contact overlap)
      pdf.addImage(qrCodeDataUrl, 'PNG', pageWidth - 42, sigTop + 6, 30, 30);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('Hash do Relatório:', pageWidth - 12, sigTop + 40, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.text(hash, pageWidth - 12, sigTop + 45, { align: 'right' });
    } catch {}

    // Add page numbers and pagination summary
    const totalPages = (pdf as any).getNumberOfPages ? (pdf as any).getNumberOfPages() : (pdf.internal as any).getNumberOfPages?.() || 1;
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(`Página ${i}/${totalPages}`, pageWidth - 12, 10, { align: 'right' });
    }
    // Pagination summary near totals block (first page only)
    pdf.setPage(1);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Páginas: ${totalPages}`, 12, y);

    const buffer = Buffer.from(pdf.output('arraybuffer'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-vendas.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating sales report PDF:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function labelForType(t: string): string {
  if (t === 'factura') return 'Factura';
  if (t === 'factura_recibo') return 'Factura-Recibo';
  if (t === 'recibo') return 'Recibo';
  if (t === 'nota_de_credito') return 'Nota de Crédito';
  if (t === 'nota_de_debito') return 'Nota de Débito';
  if (t === 'orçamento') return 'Orçamento';
  if (t === 'nota_de_entrega') return 'Guia';
  return t;
}

function formatCurrency(value: number): string {
  // Formatar apenas o valor numérico, sem símbolo/código de moeda,
  // para evitar mistura de "Kz" com "AOA" no texto.
  return new Intl.NumberFormat('pt-AO', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}