const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api/documents';
const COMPANY_NIF = '5002821079'; // Assuming this from previous context or company.json

// Helper to delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function createDocument(doc) {
  try {
    const res = await axios.post(BASE_URL, doc, {
      params: { compliance: 'true' },
      headers: { 'Content-Type': 'application/json' }
    });
    const createdDoc = res.data.document;
    console.log(`[SUCCESS] Created ${doc.documentType}: ${createdDoc.id} (${createdDoc.series}/${createdDoc.sequentialNumber})`);
    if (createdDoc.agtSubmission) {
        console.log(`   AGT Status: ${createdDoc.agtSubmission.status} - ${createdDoc.agtSubmission.message || ''}`);
    } else {
        console.log(`   AGT Status: Not present`);
    }
    return createdDoc;
  } catch (err) {
    console.error(`[ERROR] Creating ${doc.documentType}:`, err.response?.data || err.message);
    return null;
  }
}

async function main() {
  console.log('Starting App Flow Test...');

  // 1. Create Factura (FT)
  const ft = await createDocument({
    documentType: 'factura',
    buyer: {
      name: 'Consumidor Final',
      nif: '999999999',
      address: 'Luanda'
    },
    lines: [
      {
        description: 'Serviço Teste FT',
        quantity: 1,
        unitPrice: 1000,
        vatRate: 14,
        exemptionReason: ''
      }
    ],
    payment: {
      method: 'cash',
      status: 'paid' // Should trigger auto-submit
    }
  });

  if (!ft) return;

  // 2. Create Factura-Recibo (FR)
  const fr = await createDocument({
    documentType: 'factura_recibo',
    buyer: {
      name: 'Consumidor Final',
      nif: '999999999',
      address: 'Luanda'
    },
    lines: [
      {
        description: 'Serviço Teste FR',
        quantity: 1,
        unitPrice: 2000,
        vatRate: 14
      }
    ],
    payment: {
      method: 'cash',
      status: 'paid' // Implicit for FR but explicit is good
    }
  });

  // 3. Create Nota de Crédito (NC) referencing FT
  // NC requires referencing a valid invoice.
  if (ft) {
    const nc = await createDocument({
      documentType: 'nota_de_credito',
      buyer: {
        name: 'Consumidor Final',
        nif: '999999999',
        address: 'Luanda'
      },
      lines: [
        {
          description: 'Devolução Serviço Teste FT',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 14
        }
      ],
      relatedDocuments: [ft.id], // Reference the FT ID
      cancellation: {
        reason: 'Devolução comercial'
      },
      payment: {
        status: 'paid' // NCs are usually immediate
      }
    });
  }

  // 4. Create Nota de Débito (ND) referencing FT
  // ND creates debt, usually references FT.
  if (ft) {
    const nd = await createDocument({
      documentType: 'nota_de_debito',
      buyer: {
        name: 'Consumidor Final',
        nif: '999999999',
        address: 'Luanda'
      },
      lines: [
        {
          description: 'Ajuste de Preço',
          quantity: 1,
          unitPrice: 100,
          vatRate: 14
        }
      ],
      relatedDocuments: [ft.id],
      debitNoteReason: 'Erro de cálculo',
      payment: {
        status: 'pending' // ND usually pending
      }
    });
    
    // If we want to submit ND, it must be finalized (paid/issued)?
    // App logic: "issued" or "paid".
    // Let's create another ND that is "issued"
     const ndIssued = await createDocument({
      documentType: 'nota_de_debito',
      buyer: {
        name: 'Consumidor Final',
        nif: '999999999',
        address: 'Luanda'
      },
      lines: [
        {
          description: 'Ajuste de Preço (Emitido)',
          quantity: 1,
          unitPrice: 100,
          vatRate: 14
        }
      ],
      relatedDocuments: [ft.id],
      debitNoteReason: 'Erro de cálculo',
      status: 'issued',
      payment: {
        status: 'pending' 
      }
    });
  }

  // 5. Create Recibo (RC) referencing FT
  // RC pays an FT.
  // We need a PENDING FT first.
  const ftPending = await createDocument({
    documentType: 'factura',
    buyer: {
      name: 'Cliente a Prazo',
      nif: '999999999',
      address: 'Luanda'
    },
    lines: [
      {
        description: 'Serviço a Prazo',
        quantity: 1,
        unitPrice: 5000,
        vatRate: 14
      }
    ],
    payment: {
      method: 'bank_transfer',
      status: 'pending'
    }
  });

  if (ftPending) {
    const rc = await createDocument({
      documentType: 'recibo',
      buyer: {
        name: 'Cliente a Prazo',
        nif: '999999999',
        address: 'Luanda'
      },
      // RC lines are usually empty or descriptive?
      // App expects lines? Validation says "pelo menos um item".
      // But RC structure in app usually has lines representing what is being paid?
      // Or does it use `relatedDocuments` and `payment`?
      // Let's try with a dummy line "Pagamento referente a FT..."
      lines: [
        {
          description: 'Pagamento de Factura',
          quantity: 1,
          unitPrice: 5000, // Partial or full
          vatRate: 0,
          vatExemptionReason: 'M04' // Just a guess, RC doesn't have VAT usually
        }
      ],
      relatedDocuments: [ftPending.id],
      payment: {
        method: 'cash',
        status: 'paid',
        paidAmount: 5700 // 5000 + 14% = 5700
      }
    });
  }

  console.log('Test Flow Completed.');
}

main();
