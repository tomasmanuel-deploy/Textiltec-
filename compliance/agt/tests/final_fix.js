const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const documentsPath = path.resolve(__dirname, '../../../data/documents.json');

async function run() {
  try {
    // 1. Cancel Last Invoice (324) if not cancelled
    console.log('--- Step 1: Checking Last Invoice (324) ---');
    let data = JSON.parse(fs.readFileSync(documentsPath, 'utf8'));
    const doc324 = data.documents['324'];
    
    if (doc324 && doc324.status !== 'cancelled') {
        console.log(`Cancelling Invoice 324 (Total: ${doc324.totals.total})...`);
        try {
            await axios.post(`${BASE}/api/documents/324/cancel`, { reason: 'Substituição por fatura de 1 Kz (Teste Final)' });
            console.log('✅ Invoice 324 Cancelled.');
        } catch (e) {
            console.error('❌ Failed to cancel 324:', e.message);
        }
    } else {
        console.log('Invoice 324 already cancelled or not found.');
    }

    // 2. Create New 1 Kz Invoice
    console.log('\n--- Step 2: Creating New 1 Kz Invoice ---');
    const newDocPayload = {
        documentType: 'factura',
        series: 'FT',
        buyer: {
            name: 'Consumidor Final',
            nif: '999999999',
            address: 'Luanda'
        },
        lines: [
            {
                productId: 'TEST-1KZ',
                sku: 'TEST-1KZ',
                description: 'Teste de Sistema Online',
                quantity: 1,
                unit: 'UN',
                unitPrice: 1,
                discount: 0,
                vatRate: 0,
                vatExemptionReason: 'M02' // Transmissão de bens isenta
            }
        ],
        payment: {
            method: 'cash',
            status: 'paid', // Pay immediately
            paidAmount: 1
        }
    };

    const createRes = await axios.post(`${BASE}/api/documents`, newDocPayload, {
        headers: { 'x-compliance-override': 'true' }
    });

    const newDoc = createRes.data.document;
    console.log(`✅ Created Invoice: ${newDoc.series}/${newDoc.sequentialNumber} (ID: ${newDoc.id})`);
    console.log(`💰 Total: ${newDoc.totals.total} Kz`);

    // 3. Check AGT Submission Status
    console.log('\n--- Step 3: Verifying AGT Submission ---');
    // Wait a moment for async processing if any (though my code does it await-ed in the API)
    
    // Re-read document from API or File to get latest status
    // The API response 'newDoc' might already have it if the API waited.
    // Let's check newDoc.agtSubmission
    
    if (newDoc.agtSubmission) {
        console.log(`AGT Status: ${newDoc.agtSubmission.status}`);
        console.log(`Message: ${newDoc.agtSubmission.message || 'N/A'}`);
        console.log(`Token: ${newDoc.agtSubmission.agtToken || 'N/A'}`);
        
        if (newDoc.agtSubmission.status === 'success') {
            console.log('🎉 SUCCESS! Document automatically submitted to AGT.');
        } else {
            console.log('⚠️ Warning: Document created but AGT submission failed/pending.');
        }
    } else {
        console.log('⚠️ No AGT Submission info found on created document.');
    }

  } catch (err) {
    console.error('\n❌ ERROR:', err.response?.data || err.message);
  }
}

run();
