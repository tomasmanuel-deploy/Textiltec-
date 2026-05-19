
import fs from 'fs';
import path from 'path';

// Helper function to replicate dashboard logic
function verifyDashboard() {
  const documentsPath = path.join(process.cwd(), 'data', 'documents.json');
  const companiesPath = path.join(process.cwd(), 'data', 'companies.json');

  if (!fs.existsSync(documentsPath) || !fs.existsSync(companiesPath)) {
    console.error('Missing data files');
    return;
  }

  const docsData = JSON.parse(fs.readFileSync(documentsPath, 'utf-8'));
  const companies = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
  const allDocs = Object.values(docsData.documents || {});

  console.log('\n--- DASHBOARD DATA VERIFICATION ---\n');

  companies.forEach((company: any) => {
    console.log(`Company: ${company.name} (NIF: ${company.nif})`);
    
    // Filter docs for this company
    const companyDocs = allDocs.filter((d: any) => 
      (d.seller?.nif && company.nif && d.seller.nif.trim() === company.nif.trim())
    );
    
    console.log(`Total Documents Found: ${companyDocs.length}`);

    // AGT Status Logic
    const agtStatus = {
      success: 0,
      error: 0,
      pending: 0,
      offline: 0
    };

    const submittableTypes = ['factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega', 'ft', 'fr', 'rc', 'nc', 'nd', 'gr'];

    companyDocs.forEach((d: any) => {
      const status = d.agtSubmission?.status;
      const isFinal = d.status === 'issued' || d.status === 'paid' || d.status === 'finalized';
      const type = String(d.documentType || '').toLowerCase();
      // Normalized type check (dashboard uses raw string or code?)
      // The dashboard code checks: submittableTypes.includes(type)
      // My script used 'factura', 'factura_recibo' etc.
      
      const isSubmittable = submittableTypes.includes(type) || submittableTypes.includes(d.series?.toLowerCase()); // simple check

      if (status === 'success') agtStatus.success++;
      else if (status === 'error') agtStatus.error++;
      else if (status === 'offline_pending') agtStatus.offline++;
      else if (status === 'pending') agtStatus.pending++;
      else if (!status && isFinal && isSubmittable) {
          agtStatus.pending++;
      }
    });

    console.log('AGT Status:');
    console.log(`  Success: ${agtStatus.success}`);
    console.log(`  Error:   ${agtStatus.error}`);
    console.log(`  Pending: ${agtStatus.pending}`);
    console.log(`  Offline: ${agtStatus.offline}`);

    // Financials
    // Dashboard usually sums totals.
    // Let's sum totals for issued/paid docs.
    let totalRevenue = 0;
    let totalTax = 0;
    
    companyDocs.forEach((d: any) => {
        // Exclude credit notes from revenue? Or subtract?
        // Usually dashboard sums positive revenue.
        // Let's just sum all totals for now as "Gross Volume".
        if (d.status !== 'cancelled') {
             if (d.documentType === 'nota_de_credito') {
                 totalRevenue -= (d.totals?.total || 0);
                 totalTax -= (d.totals?.vatTotal || 0);
             } else {
                 totalRevenue += (d.totals?.total || 0);
                 totalTax += (d.totals?.vatTotal || 0);
             }
        }
    });
    
    console.log('Financials (Approx):');
    console.log(`  Net Revenue Impact: ${totalRevenue.toFixed(2)} Kz`);
    console.log(`  Total Tax Impact:   ${totalTax.toFixed(2)} Kz`);
    
    console.log('\n-----------------------------------\n');
  });
}

verifyDashboard();
