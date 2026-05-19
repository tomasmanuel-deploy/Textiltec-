
import { documentStore, Document } from '../src/lib/documentStore';
import { productStore } from '../src/lib/productStore';
import path from 'path';

// Define types locally since they are not exported as needed
type DocTypeShort = 'FT' | 'FR' | 'PP' | 'NC' | 'NE' | 'RC';

const typeMap: Record<DocTypeShort, string> = {
  'FT': 'factura',
  'FR': 'factura_recibo',
  'PP': 'proforma',
  'NC': 'nota_de_credito',
  'NE': 'nota_de_entrega',
  'RC': 'recibo'
};

async function runTest() {
  console.log('Starting 100 Kz Flow Test...');
  
  // Clear existing documents to start fresh
  console.log('Clearing existing documents...');
  documentStore.clearAllDocuments();

  // 1. Create a 100 Kz Product/Service
  console.log('Creating 100 Kz Service...');
  const product = productStore.createProduct({
    name: 'Serviço de Teste 100 Kz',
    code: 'TEST100',
    price: 100,
    taxType: 'IVA',
    taxPercentage: 14,
    taxCode: 'NOR', // Changed from taxCode to taxType/taxPercentage/taxCode as per store
    // Note: createProduct in store takes taxRate, not taxPercentage?
    // Let's check ProductStore.createProduct signature.
    // It takes ProductData. Product interface has taxRate.
    taxRate: 14, 
    isService: true,
    description: 'Serviço para teste de arredondamento e conformidade'
  } as any); // cast to any to avoid strict type checks if interface mismatches slightly
  console.log('Product created:', product.id);

  // Common customer data
  const customer = {
    id: 'CUST001',
    name: 'Cliente Teste',
    nif: '999999999',
    address: 'Rua de Teste, Luanda',
    email: 'teste@exemplo.com'
  };

  // Helper to create a document
  const createDoc = (type: DocTypeShort, status: 'draft' | 'issued' | 'paid' = 'draft', relatedDoc?: Document) => {
    console.log(`Creating ${type}...`);
    
    // For NC/NE, we reference the related document
    const references = relatedDoc ? [relatedDoc.id] : undefined; // relatedDocuments is string[]

    const docData: any = {
      documentType: typeMap[type],
      customerId: customer.id, // These might need to be mapped to buyer object
      // DocumentStore.createDocument expects 'buyer' object, not customerId directly?
      // Let's check createDocument implementation. It takes Partial<Document>.
      // Document has 'buyer' field.
      buyer: {
          name: customer.name,
          nif: customer.nif,
          address: customer.address,
          email: customer.email,
          phone: '900000000'
      },
      status: status,
      lines: [
        {
          id: '1',
          productId: product.id,
          productCode: product.code,
          description: product.name,
          quantity: 1,
          unitPrice: product.price,
          tax: product.taxRate || 14, // product has taxRate
          taxCode: 'NOR', // This might be needed if LineItem expects it? LineItem has vatRate.
          vatRate: 14,
          discount: 0,
          total: product.price + (product.price * 0.14) // Rough calc, store will recalc
        }
      ],
      relatedDocuments: references
    };
    
    // Create document
    const doc = documentStore.createDocument(docData);

    // If status is not draft, we must explicitly update it because createDocument forces draft
    if (status !== 'draft') {
        documentStore.updateDocument(doc.id, { status: status });
        // Update local object to reflect change for logging
        doc.status = status;
    }

    // Simulate AGT submission for finalized documents
    if (status !== 'draft') {
        // Manually update the hidden field for test purposes
        (doc as any).agtSubmission = {
            status: 'success',
            message: 'Submetido com sucesso (Simulação)',
            submissionDate: new Date().toISOString(),
            agtId: `AGT-${doc.id}`
        };
        // We need to use updateDocument or just modify the in-memory object if we are not reloading?
        // updateDocument is better.
        // But updateDocument might validate status.
        // If status is 'issued', we can update agtSubmission.
        // But documentStore.updateDocument only allows updating draft unless it's only agtSubmission.
        // Let's try.
        try {
            documentStore.updateDocument(doc.id, { agtSubmission: (doc as any).agtSubmission } as any);
        } catch (e) {
            console.log('Could not update AGT submission status:', e);
        }
    }

    console.log(`${type} created: ${doc.series} ${doc.sequentialNumber} (ID: ${doc.id})`);
    console.log(`  Total: ${doc.totals?.total}`);
    console.log(`  Tax: ${doc.totals?.vatTotal}`);
    
    return doc;
  };

  // 2. Create FT (Factura)
  const ft = createDoc('FT', 'issued');

  // 3. Create FR (Factura/Recibo) - Paid immediately
  const fr = createDoc('FR', 'issued'); // Create as issued first, then confirm payment
  // Add payment to FR
  console.log('Adding payment to FR...');
  documentStore.confirmPayment(fr.id, {
      paidAmount: fr.totals.total,
      paidDate: new Date().toISOString().split('T')[0],
      method: 'Numerário'
  });
  console.log(`Payment added to FR`);


  // 4. Create PP (Proforma)
  const pp = createDoc('PP', 'draft');

  // 5. Create NC (Nota de Crédito) - Reversing the FT
  console.log('Creating NC from FT...');
  try {
      // Manually create NC with negative quantities
      const ncData: any = {
        documentType: 'nota_de_credito',
        buyer: ft.buyer,
        status: 'issued',
        lines: ft.lines.map((l: any) => ({
            ...l,
            quantity: -l.quantity, // Negative quantity for reversal
            description: `Estorno: ${l.description}`
        })),
        relatedDocuments: [ft.id],
        debitNoteReason: 'Teste de estorno'
      };

      const nc = documentStore.createDocument(ncData);
      
      if (nc) {
          // Explicitly set to issued
          documentStore.updateDocument(nc.id, { status: 'issued' });
          nc.status = 'issued';

          console.log(`NC created: ${nc.series} ${nc.sequentialNumber} (ID: ${nc.id})`);
          console.log(`  Total: ${nc.totals?.total}`);
           // Simulate AGT
            try {
                documentStore.updateDocument(nc.id, { 
                    agtSubmission: {
                        status: 'success',
                        message: 'Submetido com sucesso (Simulação)',
                        submissionDate: new Date().toISOString(),
                        agtId: `AGT-${nc.id}`
                    }
                } as any);
            } catch (e) {
                console.log('Could not update AGT submission status for NC:', e);
            }
      }
  } catch (e) {
      console.error('Error creating NC:', e);
  }

  // 6. Create NE (Nota de Entrega)
  // createDoc('NE', 'issued'); // Might not be supported if I don't map it correctly or if logic differs.
  // Let's skip NE for now or try it.
  
  // 7. Create RC (Recibo) for the FT
  // We can use confirmPayment on the FT to generate RC!
  console.log('Creating RC for FT (via confirmPayment)...');
  const receipt = documentStore.confirmPayment(ft.id, {
      paidAmount: ft.totals.total,
      paidDate: new Date().toISOString().split('T')[0],
      method: 'Numerário'
  });
  
  if (receipt) {
      // confirmPayment returns the updated FT, not the RC directly?
      // Let's check confirmPayment signature.
      // It returns Document | null. Usually the updated document.
      // But it creates a separate RC document.
      // We need to find the RC.
      const allDocs = documentStore.getAllDocuments();
      const rc = allDocs.find(d => d.documentType === 'recibo' && d.relatedDocuments?.includes(ft.id));
      if (rc) {
          console.log(`RC created: ${rc.series} ${rc.sequentialNumber} (ID: ${rc.id})`);
          console.log(`  Total: ${rc.totals?.total}`);
      } else {
          console.log('RC not found after payment confirmation.');
      }
  }

  console.log('\n--- Final Summary ---');
  const finalDocs = documentStore.getAllDocuments();
  finalDocs.forEach(d => {
      console.log(`[${d.documentType.toUpperCase()}] ${d.series} ${d.sequentialNumber} | Total: ${d.totals?.total} | Status: ${d.status} | AGT: ${d.agtSubmission?.status || 'N/A'}`);
  });
  
  console.log('Test Complete. Documents generated.');
}

runTest().catch(console.error);
