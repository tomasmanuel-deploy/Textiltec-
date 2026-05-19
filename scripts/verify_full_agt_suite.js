
const fs = require('fs');

const API_URL = 'http://localhost:3000/api/documents';

// Helper for requests
async function post(url, data) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return { status: res.status, data: json };
  } catch (e) {
    return { status: 500, error: e.message };
  }
}

async function run() {
  console.log('🚀 Starting Full AGT Suite Verification...');
  
  const results = {
    FT: false,
    FR: false,
    NC: false,
    ND: false,
    RC: false,
    GT: false
  };

  try {
    // 1. Factura (FT)
    console.log('\n📄 Creating Factura (FT)...');
    const ftData = {
      documentType: 'factura',
      buyer: { name: 'Consumidor Final', nif: '999999999' },
      lines: [{ description: 'Item A', quantity: 2, unitPrice: 1000, vatRate: 14, total: 2280 }],
      payment: { method: 'cash', status: 'paid' }
    };
    const ftRes = await post(`${API_URL}?compliance=true`, ftData);
    if (ftRes.status === 201) {
      const doc = ftRes.data.document;
      console.log(`✅ FT Created: ${doc.sequentialNumber}`);
      if (doc.agtSubmission?.status === 'success') {
        console.log(`✅ FT Auto-Submitted: ${doc.agtSubmission.agtId || 'OK'}`);
        results.FT = true;
      } else {
        console.error(`❌ FT AGT Failed: ${doc.agtSubmission?.message}`);
      }
      
      // 2. Factura-Recibo (FR)
      console.log('\n📄 Creating Factura-Recibo (FR)...');
      const frData = {
        documentType: 'factura_recibo',
        buyer: { name: 'Consumidor Final', nif: '999999999' },
        lines: [{ description: 'Item B', quantity: 1, unitPrice: 5000, vatRate: 14, total: 5700 }],
        payment: { method: 'card', status: 'paid' }
      };
      const frRes = await post(`${API_URL}?compliance=true`, frData);
      if (frRes.status === 201) {
        const doc = frRes.data.document;
        console.log(`✅ FR Created: ${doc.sequentialNumber}`);
        if (doc.agtSubmission?.status === 'success') {
          console.log(`✅ FR Auto-Submitted: ${doc.agtSubmission.agtId || 'OK'}`);
          results.FR = true;
        } else {
            console.error(`❌ FR AGT Failed: ${doc.agtSubmission?.message}`);
        }
      }

      // 3. Nota de Crédito (NC) -> Refers FT
      console.log('\n📄 Creating Nota de Crédito (NC) for FT...');
      const ncData = {
        documentType: 'nota_de_credito',
        buyer: { name: 'Consumidor Final', nif: '999999999' },
        lines: [{ description: 'Devolução Item A', quantity: 2, unitPrice: 1000, vatRate: 14, total: 2280 }],
        relatedDocuments: [doc.id],
        reason: 'Devolução',
        status: 'issued'
      };
      const ncRes = await post(`${API_URL}?compliance=true`, ncData);
      if (ncRes.status === 201) {
        const doc = ncRes.data.document;
        console.log(`✅ NC Created: ${doc.sequentialNumber}`);
        if (doc.agtSubmission?.status === 'success') {
          console.log(`✅ NC Auto-Submitted: ${doc.agtSubmission.agtId || 'OK'}`);
          results.NC = true;
        } else {
             console.error(`❌ NC AGT Failed: ${doc.agtSubmission?.message}`);
        }
      }

      // 4. Nota de Débito (ND) -> Refers FT
      console.log('\n📄 Creating Nota de Débito (ND) for FT...');
      const ndData = {
        documentType: 'nota_de_debito',
        buyer: { name: 'Consumidor Final', nif: '999999999' },
        lines: [{ description: 'Ajuste Preço', quantity: 1, unitPrice: 100, vatRate: 14, total: 114 }],
        relatedDocuments: [doc.id],
        debitNoteReason: 'Erro preço',
        status: 'issued'
      };
      const ndRes = await post(`${API_URL}?compliance=true`, ndData);
      if (ndRes.status === 201) {
        const doc = ndRes.data.document;
        console.log(`✅ ND Created: ${doc.sequentialNumber}`);
        if (doc.agtSubmission?.status === 'success') {
           console.log(`✅ ND Auto-Submitted: ${doc.agtSubmission.agtId || 'OK'}`);
           results.ND = true;
        } else {
             console.error(`❌ ND AGT Failed: ${doc.agtSubmission?.message}`);
        }
      }
    } else {
        console.error('❌ FT Creation Failed:', ftRes.data);
    }

    // 5. Nota de Entrega (GT)
    console.log('\n📄 Creating Nota de Entrega (GT)...');
    const gtData = {
        documentType: 'nota_de_entrega',
        buyer: { name: 'Cliente Logística', nif: '999999999' },
        lines: [{ 
            description: 'Transporte Mercadoria', 
            quantity: 10, 
            unitPrice: 0, 
            vatRate: 0, 
            vatExemptionReason: 'Transmissão gratuita', // Reason is text
            vatExemptionCode: 'M00', // Code is optional but good
            total: 0 
        }],
        status: 'issued'
    };
    // GT usually has value 0 or implies transport.
    // If value is 0, my validation might fail unless I exempt it.
    // In index.ts I added: if (calculatedTotal <= 0 && documentData.documentType !== 'nota_de_entrega')
    // So GT with 0 total should be allowed.
    const gtRes = await post(`${API_URL}?compliance=true`, gtData);
    if (gtRes.status === 201) {
        const doc = gtRes.data.document;
        console.log(`✅ GT Created: ${doc.sequentialNumber}`);
        // GT is not submitted to registarFactura endpoint, so we expect success without submission
        results.GT = true;
        if (doc.agtSubmission) {
             console.log(`ℹ️ GT AGT Status: ${doc.agtSubmission.status}`);
        } else {
             console.log(`✅ GT Created (Local only, as expected)`);
        }
    } else {
        console.error('❌ GT Creation Failed:', gtRes.data);
    }

    // 6. Recibo (RC)
    // Needs a pending FT.
    console.log('\n📄 Creating Pending FT for Recibo...');
    const ftPendingData = {
        documentType: 'factura',
        buyer: { name: 'Cliente Prazo', nif: '999999999' },
        lines: [{ description: 'Serviço Prazo', quantity: 1, unitPrice: 10000, vatRate: 14, total: 11400 }],
        payment: { method: 'bank_transfer', status: 'pending' }
    };
    const ftPendingRes = await post(`${API_URL}?compliance=true`, ftPendingData);
    if (ftPendingRes.status === 201) {
        const ftDoc = ftPendingRes.data.document;
        console.log(`✅ Pending FT Created: ${ftDoc.sequentialNumber}`);
        
        console.log('\n📄 Creating Recibo (RC)...');
        const rcData = {
            documentType: 'recibo',
            buyer: { name: 'Cliente Prazo', nif: '999999999' },
            lines: [{
                description: `Pagamento da Factura ${ftDoc.series}/${ftDoc.sequentialNumber}`,
                quantity: 1,
                unitPrice: 11400,
                vatRate: 0,
                vatExemptionReason: 'Regime de Transição',
                vatExemptionCode: 'M00',
                total: 11400
            }],
            relatedDocuments: [ftDoc.id],
            payment: { method: 'bank_transfer', paidAmount: 11400 },
            status: 'paid'
        };
        const rcRes = await post(`${API_URL}?compliance=true`, rcData);
        if (rcRes.status === 201) {
            const doc = rcRes.data.document;
            console.log(`✅ RC Created: ${doc.sequentialNumber}`);
            if (doc.agtSubmission?.status === 'success') {
                 console.log(`✅ RC Auto-Submitted: ${doc.agtSubmission.agtId || 'OK'}`);
                 results.RC = true;
            } else {
                 console.error(`❌ RC AGT Failed: ${doc.agtSubmission?.message}`);
            }
        } else {
            console.error('❌ RC Creation Failed:', rcRes.data);
        }
    }

  } catch (error) {
    console.error('Script Error:', error);
  }

  console.log('\n📊 Summary:');
  console.table(results);
}

run();
