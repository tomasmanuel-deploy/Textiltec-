const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

async function run() {
  try {
    // 1. Create Product (Ignore error if exists)
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
        console.log('✅ Product Created');
    } catch (e) {
        console.log('Product creation note:', e.message);
    }

    // 2. Find Product ID
    console.log('\n--- Step 2: Finding Product ID ---');
    let productId;
    try {
        const allProds = await axios.get(`${BASE}/api/products`);
        // Check structure
        const products = Array.isArray(allProds.data) ? allProds.data : (allProds.data.products || []);
        
        const found = products.find(p => p.code === 'TEST-1KZ');
        if (found) {
            productId = found.id;
            console.log(`Found Product ID: ${productId}`);
        } else {
            console.log('Product TEST-1KZ not found in list.');
        }
    } catch (e) {
        console.error('Error fetching products:', e.message);
    }

    if (!productId) {
        throw new Error('Could not get Product ID for TEST-1KZ');
    }

    // 3. Create New 1 Kz Invoice
    console.log('\n--- Step 3: Creating New 1 Kz Invoice ---');
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
                productId: productId,
                sku: 'TEST-1KZ',
                description: 'Teste de Sistema Online',
                quantity: 1,
                unit: 'UN',
                unitPrice: 1,
                discount: 0,
                vatRate: 0,
                vatExemptionReason: 'M02'
            }
        ],
        payment: {
            method: 'cash',
            status: 'paid', 
            paidAmount: 1
        }
    };

    const createRes = await axios.post(`${BASE}/api/documents`, newDocPayload);
    const newDoc = createRes.data.document;
    
    console.log(`✅ Created Invoice: ${newDoc.series}/${newDoc.sequentialNumber} (ID: ${newDoc.id})`);
    console.log(`💰 Total: ${newDoc.totals.total} Kz`);
    
    // 4. Check AGT Submission Status
    console.log('\n--- Step 4: Verifying AGT Submission ---');
    
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
