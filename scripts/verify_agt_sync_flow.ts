// @ts-nocheck
const { documentStore } = require('../src/lib/documentStore');
const { AgtService } = require('../src/services/AgtService');
const fs = require('fs');
const path = require('path');

// Mock Next.js request/response objects
const mockReq = (method, body = {}, query = {}) => ({
  method,
  body,
  query,
  headers: {}
});

const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  res.setHeader = () => res;
  return res;
};

async function runVerification() {
  console.log('Starting AGT Robust System Verification...');

  // 1. Create a test document (Invoice)
  const invoice = {
    id: `TEST-INV-${Date.now()}`,
    documentType: 'factura',
    series: '2025',
    sequentialNumber: Math.floor(Math.random() * 1000),
    issueDate: new Date().toISOString(),
    status: 'issued', // Final status
    totals: { total: 1000, subtotal: 1000, vatTotal: 0 },
    lines: [{ description: 'Test Item', quantity: 1, unitPrice: 1000, total: 1000 }],
    agtSubmission: {
      status: 'offline_pending',
      message: 'Created offline',
      submissionDate: new Date().toISOString()
    }
  };

  console.log('1. Creating test document...');
  // Force create/update
  const created = documentStore.createDocument(invoice);
  if (!created) throw new Error('Failed to create document');
  
  // Force update to offline_pending (in case createDocument overrides it)
  documentStore.updateDocument(created.id, {
    agtSubmission: {
        status: 'offline_pending',
        mode: 'offline',
        submissionDate: new Date().toISOString()
    }
  });

  // 2. Test /api/agt/pending
  console.log('2. Testing /api/agt/pending...');
  const pendingHandler = require('../src/pages/api/agt/pending').default;
  const req1 = mockReq('GET');
  const res1 = mockRes();
  await pendingHandler(req1, res1);

  if (res1.statusCode !== 200) {
    console.error('Pending API failed:', res1.data);
    throw new Error('Pending API returned non-200');
  }

  const pendingDocs = res1.data;
  console.log(`   Found ${pendingDocs.length} pending documents.`);
  const found = pendingDocs.find(d => d.id === created.id);
  if (!found) {
    console.error('Pending docs:', JSON.stringify(pendingDocs, null, 2));
    throw new Error('Created document not found in pending list');
  }
  console.log('   ✓ Document found in pending list');

  // 3. Test /api/agt/sync-document
  console.log('3. Testing /api/agt/sync-document...');
  
  // Mock AgtService to succeed
  const originalRegistar = AgtService.prototype.registarFactura;
  AgtService.prototype.registarFactura = async function(doc) {
    console.log(`   [Mock] Submitting ${doc.id} to AGT...`);
    return {
      resultCode: 1,
      requestID: 'MOCK-REQ-123',
      submissionToken: 'MOCK-TOKEN-123'
    };
  };

  try {
    const syncHandler = require('../src/pages/api/agt/sync-document').default;
    const req2 = mockReq('POST', { documentId: created.id });
    const res2 = mockRes();
    await syncHandler(req2, res2);

    if (res2.statusCode !== 200) {
      console.error('Sync API failed:', res2.data);
      throw new Error('Sync API returned non-200');
    }

    console.log('   Sync response:', res2.data);

    // 4. Verify document status updated
    const updated = documentStore.getDocument(created.id);
    if (updated?.agtSubmission?.status !== 'success') {
      console.error('Document state:', updated?.agtSubmission);
      throw new Error('Document status not updated to success');
    }
    console.log('   ✓ Document status updated to success');

  } finally {
    // Restore mock
    AgtService.prototype.registarFactura = originalRegistar;
  }
  
  // 5. Cleanup
  documentStore.deleteDocument(created.id);
  console.log('Verification successful!');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
