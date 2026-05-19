import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CompanyStats {
  id: string;
  name: string;
  nif: string;
  documentCount: number;
  lastDocumentDate: string | null;
  agtStatus: {
    success: number;
    error: number;
    pending: number;
    offline: number;
  };
  license: {
    status: string;
    expiresAt: string | null;
  };
}

export const generateAdminReport = (companies: CompanyStats[], globalMetrics: any) => {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text('Relatório Administrativo - Sistema de Faturação', 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 30);

  // Global Metrics Section
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('Métricas Globais', 14, 45);
  
  const metricsData = [
    ['Total Empresas', globalMetrics.totalCompanies],
    ['Total Documentos', globalMetrics.totalDocuments],
    ['Receita Total', new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(globalMetrics.totalRevenue)],
    ['Licenças Ativas', globalMetrics.activeLicenses],
    ['Licenças a Expirar', globalMetrics.expiringLicenses],
    ['AGT Pendentes', globalMetrics.agtPendingTotal],
    ['AGT Erros', globalMetrics.agtErrorTotal],
  ];

  autoTable(doc, {
    startY: 50,
    head: [['Métrica', 'Valor']],
    body: metricsData,
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: 14, right: 14 },
    tableWidth: 'wrap'
  });

  // Companies Table
  doc.text('Detalhamento por Empresa', 14, (doc as any).lastAutoTable.finalY + 15);

  const companiesData = companies.map(c => [
    c.name,
    c.nif,
    c.documentCount,
    c.agtStatus.success + '/' + c.agtStatus.error + '/' + c.agtStatus.pending,
    c.license.status,
    c.license.expiresAt ? new Date(c.license.expiresAt).toLocaleDateString() : '-'
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Empresa', 'NIF', 'Docs', 'AGT (S/E/P)', 'Licença', 'Expira']],
    body: companiesData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 8 },
  });

  doc.save(`relatorio_admin_${new Date().toISOString().split('T')[0]}.pdf`);
};
