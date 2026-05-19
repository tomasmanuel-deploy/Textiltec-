
import fs from 'fs';
import path from 'path';

const documentsPath = path.join(process.cwd(), 'data', 'documents.json');

if (fs.existsSync(documentsPath)) {
  const raw = fs.readFileSync(documentsPath, 'utf-8');
  const data = JSON.parse(raw);
  
  if (data.documents) {
    Object.keys(data.documents).forEach(key => {
      const doc = data.documents[key];
      // Skip if already has agtSubmission (the first one might have it)
      // But actually, ensure all have it and it's consistent.
      
      // Only for submittable documents (Proforma PP is usually not submitted to AGT for fiscal purposes in the same way, but let's check. 
      // Actually Proformas ARE submitted in some regimes, or just stored. 
      // The dashboard logic checks: ['factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega', 'ft', 'fr', 'rc', 'nc', 'nd', 'gr']
      // Proforma (PP) is NOT in the submittableTypes list in dashboard.ts (lines 105).
      // So PP should NOT have agtSubmission or it won't be counted anyway, or maybe it shouldn't be submitted.
      // Let's check dashboard.ts again:
      // const submittableTypes = ['factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega', 'ft', 'fr', 'rc', 'nc', 'nd', 'gr'];
      // PP is not there. So dashboard won't count it as pending/error/success usually, unless logic changes.
      // But let's add it to FT, FR, RC, NC, ND.
      
      const type = (doc.documentType || '').toLowerCase();
      const isSubmittable = ['factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega'].includes(type);
      
      if (isSubmittable) {
        doc.agtSubmission = {
          status: 'success',
          message: 'Documento submetido com sucesso (Simulado)',
          date: new Date().toISOString(),
          agtResponseId: `AGT-SIM-${doc.series}-${doc.sequentialNumber}`
        };
      }
    });
    
    fs.writeFileSync(documentsPath, JSON.stringify(data, null, 2));
    console.log('Updated all submittable documents with AGT success status.');
  }
} else {
  console.error('documents.json not found');
}
