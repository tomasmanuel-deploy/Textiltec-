const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

async function run() {
  try {
    // 1. Create Product
    console.log('--- Step 1: Creating Product ---');
    const productPayload = {
        name: 'Teste de Sistema Online',
        description: 'Teste de Sistema Online 100%',
        price: 1,
        code: 'TEST-1KZ',
        category: 'Services',
        taxType: 'ISE', // Isento
        taxExemptionReason: 'M02',
        stock: 1000
    };

    try {
        await axios.post(`${BASE}/api/products`, productPayload);
        console.log('✅ Product Created/Updated');
    } catch (e) {
        console.log('Product might already exist or error:', e.message);
    }

    // 2. Create New 1 Kz Invoice
    console.log('\n--- Step 2: Creating New 1 Kz Invoice ---');
    const newDocPayload = {
        documentType: 'factura', // Must match API enum
        series: 'FT',
        buyer: {
            name: 'Consumidor Final',
            nif: '999999999',
            address: 'Luanda'
        },
        lines: [
            {
                productId: 'TEST-1KZ', // Now exists? Actually the ID might be generated.
                // The API usually takes productId as the internal ID.
                // If I posted to /api/products, I need the ID from response.
                // Let's retry fetching products to find it or use the one from response.
            }
        ],
        payment: {
            method: 'cash',
            status: 'paid', // Pay immediately to trigger finalization if needed
            paidAmount: 1
        }
    };
    
    // Better approach: Get the product ID from creation
    let productId;
    try {
        const prodRes = await axios.post(`${BASE}/api/products`, productPayload);
        productId = prodRes.data.id || prodRes.data.product?.id;
        console.log(`Product ID: ${productId}`);
    } catch (e) {
         // If fails, maybe search?
         console.log('Fetching products to find TEST-1KZ...');
         const allProds = await axios.get(`${BASE}/api/products`);
         const found = allProds.data.find(p => p.code === 'TEST-1KZ');
         if (found) productId = found.id;
    }

    if (!productId) {
        throw new Error('Could not get Product ID for TEST-1KZ');
    }

    newDocPayload.lines[0].productId = productId;
    newDocPayload.lines[0].sku = 'TEST-1KZ';
    newDocPayload.lines[0].description = 'Teste de Sistema Online';
    newDocPayload.lines[0].quantity = 1;
    newDocPayload.lines[0].unit = 'UN';
    newDocPayload.lines[0].unitPrice = 1;
    newDocPayload.lines[0].discount = 0;
    newDocPayload.lines[0].vatRate = 0;
    newDocPayload.lines[0].vatExemptionReason = 'M02';

    const createRes = await axios.post(`${BASE}/api/documents`, newDocPayload);

    const newDoc = createRes.data.document;
    console.log(`✅ Created Invoice: ${newDoc.series}/${newDoc.sequentialNumber} (ID: ${newDoc.id})`);
    console.log(`💰 Total: ${newDoc.totals.total} Kz`);
    
    // Check Status
    console.log(`Internal Status: ${newDoc.status}`);

    // 3. Check AGT Submission Status
    console.log('\n--- Step 3: Verifying AGT Submission ---');
    
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
