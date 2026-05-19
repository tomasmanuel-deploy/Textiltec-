import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { companyJsonPath } from '../../../lib/dataPaths';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { startDate, endDate } = req.query;
    const start = typeof startDate === 'string' && startDate ? new Date(startDate) : null;
    const end = typeof endDate === 'string' && endDate ? new Date(endDate) : null;
    // Restrict to active company (seller.nif) if available
    let activeNif: string | null = null;
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const raw = fs.readFileSync(companyPath, 'utf-8');
        const cfg = raw ? JSON.parse(raw) : {};
        activeNif = cfg.nif || null;
      }
      if (!activeNif && process.env.NEXT_PUBLIC_COMPANY_NIF) {
        activeNif = process.env.NEXT_PUBLIC_COMPANY_NIF!;
      }
    } catch {}

    const allDocs = documentStore.getAllDocuments();
    const scopedDocs = activeNif ? allDocs.filter(d => (d.seller?.nif || '') === activeNif) : allDocs;

    const docs = scopedDocs.filter(d => {
      const issue = new Date(d.issueDate);
      return (!start || issue >= start) && (!end || issue <= end);
    });

    // Excluir Recibos e Factura-Recibo vinculada a Factura (evitar dupla contagem)
    const reportingDocs = docs.filter((d) => {
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

    const totals = reportingDocs.reduce(
      (acc, d) => {
        acc.subtotal = round(acc.subtotal + (d.totals?.subtotal || 0));
        acc.discount = round(acc.discount + (d.totals?.discount || 0));
        acc.vatTotal = round(acc.vatTotal + (d.totals?.vatTotal || 0));
        acc.total = round(acc.total + (d.totals?.total || 0));
        (d.totals?.vatBreakdown || []).forEach(br => {
          const rate = Number(br.rate) || 0;
          const entry = acc.vatSummary.get(rate) || { base: 0, amount: 0 };
          entry.base = round(entry.base + (br.base || 0));
          entry.amount = round(entry.amount + (br.amount || 0));
          acc.vatSummary.set(rate, entry);
        });
        const buyerName = d.buyer?.name || '—';
        acc.byClient.set(buyerName, round((acc.byClient.get(buyerName) || 0) + (d.totals?.total || 0)));
        return acc;
      },
      { subtotal: 0, discount: 0, vatTotal: 0, total: 0, vatSummary: new Map<number, { base: number; amount: number }>(), byClient: new Map<string, number>() }
    );

    // Company metadata
    let companyName = 'Empresa';
    let businessName = 'Empresa';
    let companyNif = '';
    let companyAddress = '';
    let companyEmail = '';
    let logoDataUrl: string | null = null;
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
      }
      const logoEnv = process.env.NEXT_PUBLIC_COMPANY_LOGO;
      const logoPath = logoEnv ? path.join(process.cwd(), 'public', logoEnv.replace(/^\//, '')) : path.join(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) {
        const ext = path.extname(logoPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : '';
        if (mime) {
          const base = fs.readFileSync(logoPath).toString('base64');
          logoDataUrl = `data:${mime};base64,${base}`;
        }
      }
    } catch {}

    // (bloco duplicado removido — totals já calculados acima)

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = (pdf.internal as any).pageSize.getWidth ? (pdf.internal as any).pageSize.getWidth() : 210;
    const pageHeight = (pdf.internal as any).pageSize.getHeight ? (pdf.internal as any).pageSize.getHeight() : 297;

    const drawHeader = (doc: jsPDF) => {
      if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 12, 12, 14, 14); } catch {} }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(businessName, 28, 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(`NIF: ${companyNif}`, 28, 20);
      if (companyAddress) doc.text(companyAddress, 28, 24);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('Relatório — Somatória Geral', pageWidth - 12, 16, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: pt });
      doc.text(`Gerado em: ${nowStr}`, pageWidth - 12, 20, { align: 'right' });
      const rangeText = `Período: ${start ? format(start, 'dd/MM/yyyy', { locale: pt }) : '—'} a ${end ? format(end, 'dd/MM/yyyy', { locale: pt }) : '—'}`;
      doc.text(rangeText, pageWidth - 12, 24, { align: 'right' });
    };

    drawHeader(pdf);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Resumo de Totais', 12, 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const lines = [
      `Subtotal: ${formatCurrency(totals.subtotal)} AOA`,
      `Desconto: ${formatCurrency(totals.discount)} AOA`,
      `IVA: ${formatCurrency(totals.vatTotal)} AOA`,
      `Total: ${formatCurrency(totals.total)} AOA`,
      `Documentos: ${reportingDocs.length}`,
    ];
    let y = 41; for (const l of lines) { pdf.text(l, 12, y); y += 5; }

    // VAT table
    const vatRows = Array.from(totals.vatSummary.entries()).sort((a,b)=>a[0]-b[0]).map(([rate,val]) => [ `${rate}%`, formatCurrency(val.base), formatCurrency(val.amount) ]);
    autoTable(pdf, {
      startY: y + 6,
      head: [["Taxa", "Base (AOA)", "IVA (AOA)"]],
      body: vatRows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240,240,240], textColor: 20, fontStyle: 'bold' },
      theme: 'grid', margin: { left: 12, right: 12 },
      didDrawPage: () => { drawHeader(pdf); agtFooter(pdf, pageWidth, pageHeight); }
    });

    // Totais por Cliente
    const clientRows = Array.from(totals.byClient.entries()).sort((a,b)=>b[1]-a[1]).map(([name,amount]) => [ name, formatCurrency(amount) ]);
    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable?.finalY ? (pdf as any).lastAutoTable.finalY + 8 : y + 12,
      head: [["Cliente", "Total (AOA)"]],
      body: clientRows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240,240,240], textColor: 20, fontStyle: 'bold' },
      theme: 'grid', margin: { left: 12, right: 12 },
      didDrawPage: () => { drawHeader(pdf); agtFooter(pdf, pageWidth, pageHeight); }
    });

    paginate(pdf, pageWidth);

    const buffer = Buffer.from(pdf.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-somatoria-geral.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error('summary report error', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function agtFooter(pdf: jsPDF, pageWidth: number, pageHeight: number) {
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
  pdf.text('Documento processado por programa certificado pela AGT', pageWidth / 2, pageHeight - 15, { align: 'center' });
}

function paginate(pdf: jsPDF, pageWidth: number) {
  const totalPages = (pdf as any).getNumberOfPages ? (pdf as any).getNumberOfPages() : (pdf.internal as any).getNumberOfPages?.() || 1;
  for (let i = 1; i <= totalPages; i++) { pdf.setPage(i); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text(`Página ${i}/${totalPages}`, pageWidth - 12, 10, { align: 'right' }); }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value).replace('AOA', '').trim();
}