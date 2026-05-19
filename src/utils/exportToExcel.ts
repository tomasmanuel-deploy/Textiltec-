
/**
 * Export data to CSV/Excel format
 */
export const exportToExcel = (companies: any[], globalMetrics: any) => {
  // 1. Prepare CSV content
  const headers = ['Empresa', 'NIF', 'Total Documentos', 'AGT Sucesso', 'AGT Erro', 'AGT Pendente', 'Licença Status', 'Expira Em'];
  
  const rows = companies.map(c => [
    `"${c.name}"`, // Quote to handle commas in names
    `"${c.nif}"`,
    c.documentCount,
    c.agtStatus.success,
    c.agtStatus.error,
    c.agtStatus.pending,
    c.license.status,
    c.license.expiresAt ? new Date(c.license.expiresAt).toLocaleDateString() : '-'
  ]);

  // Add Global Metrics at the top
  const metricRows = [
    ['Métrica', 'Valor'],
    ['Total Empresas', globalMetrics.totalCompanies],
    ['Total Documentos', globalMetrics.totalDocuments],
    ['Receita Total', globalMetrics.totalRevenue],
    ['Licenças Ativas', globalMetrics.activeLicenses],
    ['---', '---']
  ];

  const csvContent = [
    metricRows.map(r => r.join(',')).join('\n'),
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  // 2. Create Blob and Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio_admin_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
