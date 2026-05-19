
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function runTest() {
  console.log('Starting AGT Compliance UI Verification...');

  try {
    // 1. Create a valid Factura (FT)
    console.log('\n[1] Creating Valid Factura (FT)...');
    const ftData = {
      documentType: 'factura',
      buyer: {
        name: 'Consumidor Final',
        nif: '999999999'
      },
      lines: [
        {
          description: 'Serviço de Teste',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 14,
          total: 1140 // 1000 + 14% VAT
        }
      ],
      payment: {
        method: 'cash',
        status: 'paid' // Should trigger auto-submit
      }
    };

    const ftRes = await axios.post(`${API_URL}/documents?compliance=true`, ftData);
    if (ftRes.status === 200 || ftRes.status === 201) {
      console.log('✅ FT Created successfully.');
      const doc = ftRes.data.document;
      console.log(`   ID: ${doc.id}, Series: ${doc.series}/${doc.sequentialNumber}`);
      console.log(`   AGT Status: ${doc.agtSubmission?.status}`);
      console.log(`   AGT Message: ${doc.agtSubmission?.message}`);
      
      if (doc.agtSubmission?.status === 'success' || doc.agtSubmission?.status === 'error') {
        console.log('✅ AGT Submission attempted (Status updated).');
      } else {
        console.error('❌ AGT Submission NOT attempted (Status missing or pending).');
      }
    }

    // 2. Create a document with 0 total (should fail)
    console.log('\n[2] Creating Invalid Factura (Total 0)...');
    const invalidData = {
      documentType: 'factura',
      buyer: { name: 'Test', nif: '999999999' },
      lines: [
        {
          description: 'Free Item',
          quantity: 1,
          unitPrice: 0,
          vatRate: 14,
          total: 0
        }
      ],
      payment: { method: 'cash' }
    };
    
    try {
      await axios.post(`${API_URL}/documents`, invalidData);
      console.error('❌ Failed: 0-value document was accepted!');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log(`✅ Correctly rejected with 400: ${error.response.data.error}`);
        if (error.response.data.error.includes('superior a 0.00 Kz')) {
           console.log('✅ Error message matches expectation.');
        } else {
           console.warn(`⚠️ Unexpected error message: ${error.response.data.error}`);
        }
      } else {
        console.error('❌ Failed with unexpected error:', error.message);
      }
    }

    // 3. Create Credit Note (NC) for the FT
    // Note: This requires the FT to be in 'issued' or 'paid' state (which it is)
    if (ftRes.data.document) {
        console.log('\n[3] Creating Credit Note (NC) for FT...');
        const ncData = {
            documentType: 'nota_de_credito',
            buyer: ftRes.data.document.buyer,
            relatedDocuments: [ftRes.data.document.id],
            lines: [
                {
                    description: 'Devolução',
                    quantity: 1,
                    unitPrice: 1000,
                    vatRate: 14,
                    total: 1140
                }
            ],
            reason: 'Devolução comercial',
            status: 'issued' // Auto-submit
        };
        
        const ncRes = await axios.post(`${API_URL}/documents?compliance=true`, ncData);
        if (ncRes.status === 200 || ncRes.status === 201) {
             const doc = ncRes.data.document;
             console.log('✅ NC Created successfully.');
             console.log(`   ID: ${doc.id}, Series: ${doc.series}/${doc.sequentialNumber}`);
             console.log(`   AGT Status: ${doc.agtSubmission?.status}`);
             if (doc.agtSubmission?.status === 'success') {
                 console.log('✅ NC Auto-submitted to AGT.');
             }
        }
    }

  } catch (error) {
    console.error('Test Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
    }
  }
}

runTest();
