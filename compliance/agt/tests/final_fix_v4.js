const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';

async function run() {
  try {
    const uniqueCode = `TEST-${Date.now()}`;
    // 1. Create Product
    console.log(`--- Step 1: Creating Product (${uniqueCode}) ---`);
    const productPayload = {
        name: 'Teste de Sistema Online',
        description: 'Teste de Sistema Online 100%',
        price: 1,
        code: uniqueCode,
        category: 'Services',
        taxType: 'ISE', 
        taxExemptionReason: 'M02',
        stock: 1000
    };

    let productId;
    try {
        const res = await axios.post(`${BASE}/api/products`, productPayload);
        console.log('✅ Product Created');
        productId = res.data.id || res.data.product?.id;
    } catch (e) {
        console.log('Product creation error:', e.response?.data || e.message);
        // If fail, try to list and find
    }

    if (!productId) {
         console.log('Trying to find created product in list...');
         const allProds = await axios.get(`${BASE}/api/products`);
         const products = Array.isArray(allProds.data) ? allProds.data : (allProds.data.products || []);
         const found = products.find(p => p.code === uniqueCode);
         if (found) productId = found.id;
    }

    if (!productId) {
        throw new Error('Could not get Product ID');
    }

    console.log(`Using Product ID: ${productId}`);

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
                productId: productId,
                sku: uniqueCode,
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
