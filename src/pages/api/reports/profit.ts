import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { companyJsonPath } from '@/lib/dataPaths';

const HEADER_TOP = 36;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { startDate, endDate } = req.query;
    const start = typeof startDate === 'string' && startDate ? new Date(startDate) : null;
    const end = typeof endDate === 'string' && endDate ? new Date(endDate) : null;

    const docs = documentStore.getAllDocuments().filter(d => {
      const issue = new Date(d.issueDate);
      return (!start || issue >= start) && (!end || issue <= end) && d.documentType === 'factura';
    });

    // Metadata
    let businessName = 'Empresa'; let companyNif = ''; let logoDataUrl: string | null = null;
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const cfg = JSON.parse(fs.readFileSync(companyPath, 'utf-8')); businessName = cfg.tradeName || cfg.name || businessName; companyNif = cfg.nif || companyNif;
      }
      const logoPath = path.join(process.cwd(), 'public', 'logo.png');
      if (fs.existsSync(logoPath)) { const base = fs.readFileSync(logoPath).toString('base64'); logoDataUrl = `data:image/png;base64,${base}`; }
    } catch {}

    // AGT Compliance: Rounding helper (Round Half Up)
    const round = (value: number, decimals: number = 2): number => {
      return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    };

    // Aggregates
    const totalRevenue = round(docs.reduce((sum, d) => sum + (d.totals?.total || 0), 0));
    const totalVat = round(docs.reduce((sum, d) => sum + (d.totals?.vatTotal || 0), 0));
    const totalDiscount = round(docs.reduce((sum, d) => sum + (d.totals?.discount || 0), 0));
    const taxableBase = round(docs.reduce((sum, d) => sum + ((d.totals?.subtotal || 0) - (d.totals?.discount || 0)), 0));

    const bySeries = new Map<string, { docs: number; revenue: number }>();
    docs.forEach(d => {
      const entry = bySeries.get(d.series) || { docs: 0, revenue: 0 };
      entry.docs += 1; 
      entry.revenue = round(entry.revenue + (d.totals?.total || 0)); 
      bySeries.set(d.series, entry);
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = (pdf.internal as any).pageSize.getWidth ? (pdf.internal as any).pageSize.getWidth() : 210;
    const pageHeight = (pdf.internal as any).pageSize.getHeight ? (pdf.internal as any).pageSize.getHeight() : 297;

    const drawHeader = (doc: jsPDF) => {
      if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 12, 12, 14, 14); } catch {} }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(businessName, 28, 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`NIF: ${companyNif}`, 28, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Relatório — Lucro de Venda (Ganhos)', pageWidth - 12, 16, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: pt });
      doc.text(`Gerado em: ${nowStr}`, pageWidth - 12, 20, { align: 'right' });
      const rangeText = `Período: ${start ? format(start, 'dd/MM/yyyy', { locale: pt }) : '—'} a ${end ? format(end, 'dd/MM/yyyy', { locale: pt }) : '—'}`;
      doc.text(rangeText, pageWidth - 12, 24, { align: 'right' });
    };

    drawHeader(pdf);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Resumo', 12, 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const lines = [
      `Receita (Total): ${formatCurrency(totalRevenue)} AOA`,
      `Descontos: ${formatCurrency(totalDiscount)} AOA`,
      `IVA: ${formatCurrency(totalVat)} AOA`,
      `Receita líquida (Base tributável): ${formatCurrency(taxableBase)} AOA`,
      `Documentos (facturas): ${docs.length}`,
    ];
    let y = 41; for (const l of lines) { pdf.text(l, 12, y); y += 5; }

    const seriesRows = Array.from(bySeries.entries()).map(([s, v]) => [ s, String(v.docs), formatCurrency(v.revenue) ]);
    autoTable(pdf, {
      startY: y + 6,
      head: [["Série", "Docs", "Receita (AOA)"]],
      body: seriesRows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240,240,240], textColor: 20, fontStyle: 'bold' },
      theme: 'grid', margin: { top: HEADER_TOP, left: 12, right: 12, bottom: 24 },
      didDrawPage: () => { drawHeader(pdf); agtFooter(pdf, pageWidth, pageHeight); }
    });

    paginate(pdf, pageWidth);

    const buffer = Buffer.from(pdf.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-lucro-venda.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error('profit report error', e);
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