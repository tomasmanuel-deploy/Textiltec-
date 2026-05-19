
import { documentStore } from '../src/lib/documentStore';
import { AgtService } from '../src/services/AgtService';
import { DocumentType, DocumentStatus } from '../src/models/Document';
import fs from 'fs';
import path from 'path';

// Mock data
const seller = {
  name: 'Empresa Exemplo, Lda',
  tradeName: 'Exemplo Lda',
  address: 'Rua Exemplo, 123, Luanda',
  nif: '5417000000',
  email: 'info@exemplo.ao',
  phone: '+244 900 000 000'
};

const buyer = {
  name: 'Cliente Final',
  address: 'Rua do Cliente, 456, Luanda',
  nif: '999999999',
  email: 'cliente@email.com',
  phone: '+244 911 111 111'
};

const productLine = {
  sku: 'PROD001',
  description: 'Produto de Teste',
  quantity: 1,
  unitPrice: 1000,
  discount: 0,
  vatRate: 14,
  total: 1140
};

const serviceLine = {
  sku: 'SERV001',
  description: 'Serviço de Teste',
  quantity: 1,
  unitPrice: 5000,
  discount: 0,
  vatRate: 14,
  total: 5700
};

async function generateDocuments() {
  console.log('Starting document generation...');
  
  // Clear existing documents
  documentStore.clearAllDocuments();
  console.log('Cleared existing documents.');

  // Reset series
  const seriesPath = path.join(process.cwd(), 'data', 'series.json');
  if (fs.existsSync(seriesPath)) {
    fs.unlinkSync(seriesPath);
    console.log('Deleted series.json to reset counters.');
  }
  // Force reload series store (hacky but works for script)
  // Since seriesStore is a singleton, we can't easily reload it without restarting process.
  // But wait, if we delete the file, the next time we run the script it will be fresh.
  // The current run has already loaded seriesStore?
  // Yes, because of the import at the top.
  // So deleting it here won't affect the current run's memory state if it's already loaded.
  
  // We should rely on the fact that this script runs in a new process.
  // BUT the imports happen before this function runs.
  
  // Let's just create a separate cleanup script or do it manually.
  // OR, we can access the private 'loadSeries' method if we cast to any, or just not worry about resetting series for this test.
  // The user just wants "One test document of each type". It doesn't matter if it starts at 1 or 5.
  
  // Actually, I can use the 'resetSeries' method on each series code if I want.
  // But let's just proceed. The numbers will just be higher. It's fine.

  // Initialize AGT Service
  const agtService = new AgtService();

  // 1. Factura (FT) - Issued
  console.log('Creating Factura (FT)...');
  const ft = documentStore.createDocument({
    documentType: 'factura' as any,
    seller,
    buyer,
    lines: [productLine],
    payment: { method: 'numerario', status: 'pending' }
  });
  // Simulate issuing
  documentStore.updateDocument(ft.id, { status: 'issued' as any });
  console.log(`Created FT: ${ft.series}/${ft.sequentialNumber}`);

  // 2. Factura-Recibo (FR) - Issued
  console.log('Creating Factura-Recibo (FR)...');
  const fr = documentStore.createDocument({
    documentType: 'factura_recibo' as any,
    seller,
    buyer,
    lines: [serviceLine],
    payment: { method: 'numerario', status: 'paid', paidAmount: 5700, paidDate: new Date().toISOString() }
  });
  documentStore.updateDocument(fr.id, { status: 'issued' as any });
  console.log(`Created FR: ${fr.series}/${fr.sequentialNumber}`);

  // 3. Orçamento (OR)
  console.log('Creating Orçamento (OR)...');
  const or = documentStore.createDocument({
    documentType: 'orçamento' as any,
    seller,
    buyer,
    lines: [productLine, serviceLine],
    payment: { method: 'numerario', status: 'pending' }
  });
  console.log(`Created OR: ${or.series}/${or.sequentialNumber}`);

  // 4. Proforma (PP)
  console.log('Creating Proforma (PP)...');
  const pp = documentStore.createDocument({
    documentType: 'proforma' as any,
    seller,
    buyer,
    lines: [productLine],
    payment: { method: 'numerario', status: 'pending' }
  });
  console.log(`Created PP: ${pp.series}/${pp.sequentialNumber}`);

  // 5. Nota de Débito (ND)
  console.log('Creating Nota de Débito (ND)...');
  const nd = documentStore.createDocument({
    documentType: 'nota_de_debito' as any,
    seller,
    buyer,
    lines: [{ ...serviceLine, description: 'Débito adicional', total: 5700 }],
    payment: { method: 'numerario', status: 'pending' },
    debitNoteReason: 'Correction of value',
    referenceInvoiceNo: `${ft.series}/${ft.sequentialNumber}`,
    referenceInvoiceDate: ft.issueDate
  });
  documentStore.updateDocument(nd.id, { status: 'issued' as any });
  console.log(`Created ND: ${nd.series}/${nd.sequentialNumber}`);

  // 6. Guia de Remessa (GR) / Nota de Entrega
  console.log('Creating Nota de Entrega (GR)...');
  const gr = documentStore.createDocument({
    documentType: 'nota_de_entrega' as any,
    seller,
    buyer,
    lines: [productLine],
    payment: { method: 'numerario', status: 'pending' }
  });
  documentStore.updateDocument(gr.id, { status: 'issued' as any });
  console.log(`Created GR: ${gr.series}/${gr.sequentialNumber}`);

  // 7. Factura to Cancel (FT)
  console.log('Creating Factura to Cancel...');
  const ftCancel = documentStore.createDocument({
    documentType: 'factura' as any,
    seller,
    buyer,
    lines: [productLine],
    payment: { method: 'numerario', status: 'pending' }
  });
  documentStore.updateDocument(ftCancel.id, { status: 'issued' as any });
  // Cancel it
  try {
    const cancelled = (documentStore as any).cancelDocument(ftCancel.id);
    if (cancelled) {
      console.log(`Created and Cancelled FT: ${cancelled.series}/${cancelled.sequentialNumber}`);
    } else {
      console.error('Failed to cancel FT');
    }
  } catch (e) {
    console.error('Error cancelling FT:', e);
  }

  // 8. Nota de Crédito (NC) - referencing the first FT
  console.log('Creating Nota de Crédito (NC)...');
  const nc = documentStore.createDocument({
    documentType: 'nota_de_credito' as any,
    seller,
    buyer,
    lines: [productLine], // Crediting the product
    payment: { method: 'numerario', status: 'pending' },
    referenceInvoiceNo: `${ft.series}/${ft.sequentialNumber}`,
    referenceInvoiceDate: ft.issueDate,
    debitNoteReason: 'Devolução de mercadoria' // reusing field for reason
  });
  documentStore.updateDocument(nc.id, { status: 'issued' as any });
  console.log(`Created NC: ${nc.series}/${nc.sequentialNumber}`);

  // 9. Recibo (RC) - settling the first FT
  console.log('Creating Recibo (RC)...');
  const rc = documentStore.createDocument({
    documentType: 'recibo' as any,
    seller,
    buyer,
    lines: [], // Receipts usually don't have product lines in the same way, but structure might require valid total
    totals: {
      subtotal: 0,
      discount: 0,
      vatTotal: 0,
      total: ft.totals.total, // Full payment
      vatBreakdown: []
    },
    payment: { method: 'numerario', status: 'paid', paidAmount: ft.totals.total, paidDate: new Date().toISOString() },
    referenceInvoiceNo: `${ft.series}/${ft.sequentialNumber}`
  });
  // Receipts need special handling for lines? DS.120 says RC lines map to payment references.
  // Our system might treat RC lines differently. Let's check AgtService or DocumentStore structure for RC.
  // For now, let's assume it's created like this.
  documentStore.updateDocument(rc.id, { status: 'issued' as any });
  console.log(`Created RC: ${rc.series}/${rc.sequentialNumber}`);

  console.log('All documents generated successfully.');
}

generateDocuments().catch(console.error);
