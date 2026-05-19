import type { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { companyJsonPath } from '../../../lib/dataPaths';

const HEADER_TOP = 36;

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
        const cfg = JSON.parse(fs.readFileSync(companyPath, 'utf-8'));
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
      const pending = d.payment?.status === 'pending' || d.payment?.status === 'partial';
      return (!start || issue >= start) && (!end || issue <= end) && pending;
    });

    // AGT Compliance: Rounding helper (Round Half Up)
    const round = (value: number, decimals: number = 2): number => {
      return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    };

    type ClientKey = string; // buyer.nif or name
    const byClient = new Map<ClientKey, { name: string; nif: string; count: number; total: number; paid: number; outstanding: number; nextDue?: string }>();
    for (const d of docs) {
      const k = d.buyer?.nif || d.buyer?.name || '—';
      const rec = byClient.get(k) || { name: d.buyer?.name || '—', nif: d.buyer?.nif || '—', count: 0, total: 0, paid: 0, outstanding: 0, nextDue: undefined };
      const paid = round(typeof d.payment?.paidAmount === 'number' ? d.payment!.paidAmount! : 0);
      const total = round(d.totals?.total || 0);
      const outstanding = round(Math.max(total - paid, 0));
      
      rec.count += 1; 
      rec.total = round(rec.total + total); 
      rec.paid = round(rec.paid + paid); 
      rec.outstanding = round(rec.outstanding + outstanding);
      
      const due = d.payment?.dueDate ? new Date(d.payment.dueDate) : null;
      if (due) {
        const dueStr = format(due, 'dd/MM/yyyy', { locale: pt });
        if (!rec.nextDue || new Date(parseDate(rec.nextDue)) > due) rec.nextDue = dueStr;
      }
      byClient.set(k, rec);
    }

    const rows = Array.from(byClient.values()).sort((a,b) => b.outstanding - a.outstanding);
    const totals = rows.reduce((acc, r) => { 
      acc.total = round(acc.total + r.total); 
      acc.paid = round(acc.paid + r.paid); 
      acc.outstanding = round(acc.outstanding + r.outstanding); 
      acc.count += r.count; 
      return acc; 
    }, { total: 0, paid: 0, outstanding: 0, count: 0 });

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

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = (pdf.internal as any).pageSize.getWidth ? (pdf.internal as any).pageSize.getWidth() : 210;
    const pageHeight = (pdf.internal as any).pageSize.getHeight ? (pdf.internal as any).pageSize.getHeight() : 297;

    const drawHeader = (doc: jsPDF) => {
      if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 12, 12, 14, 14); } catch {} }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(businessName, 28, 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`NIF: ${companyNif}`, 28, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Relatório — Contas a Receber (Entradas)', pageWidth - 12, 16, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const nowStr = format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: pt });
      doc.text(`Gerado em: ${nowStr}`, pageWidth - 12, 20, { align: 'right' });
      const rangeText = `Período: ${start ? format(start, 'dd/MM/yyyy', { locale: pt }) : '—'} a ${end ? format(end, 'dd/MM/yyyy', { locale: pt }) : '—'}`;
      doc.text(rangeText, pageWidth - 12, 24, { align: 'right' });
    };

    drawHeader(pdf);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Resumo', 12, 36);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const info = [
      `Total faturado: ${formatCurrency(totals.total)} AOA`,
      `Pago: ${formatCurrency(totals.paid)} AOA`,
      `A receber: ${formatCurrency(totals.outstanding)} AOA`,
      `Clientes com dívida: ${rows.length}`,
    ];
    let y = 41; for (const t of info) { pdf.text(t, 12, y); y += 5; }

    autoTable(pdf, {
      startY: y + 6,
      head: [["Cliente", "NIF", "Docs", "Total", "Pago", "A receber", "Próx. Vencimento"]],
      body: rows.map(r => [ r.name, r.nif, String(r.count), formatCurrency(r.total), formatCurrency(r.paid), formatCurrency(r.outstanding), r.nextDue || '—' ]),
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [240,240,240], textColor: 20, fontStyle: 'bold' },
      theme: 'grid', margin: { top: HEADER_TOP, left: 12, right: 12, bottom: 24 },
      didDrawPage: () => { drawHeader(pdf); agtFooter(pdf, pageWidth, pageHeight); }
    });

    paginate(pdf, pageWidth);

    const buffer = Buffer.from(pdf.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relatorio-contas-a-receber.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (e) {
    console.error('receivables report error', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function parseDate(s: string): string { // dd/MM/yyyy → ISO
  const [dd, mm, yyyy] = s.split('/');
  return `${yyyy}-${mm}-${dd}`;
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