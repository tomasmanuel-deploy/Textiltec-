
import { documentStore } from '../src/lib/documentStore';
import { AgtService } from '../src/services/AgtService';
import fs from 'fs';
import path from 'path';
import { companyJsonPath } from '../src/lib/dataPaths';

// Mock console.log
const originalLog = console.log;
console.log = (...args) => {};

async function runTest() {
  try {
    originalLog('Starting NC Visibility Reproduction Test...');

    // 1. Setup Company Info (Mocking what API does)
    let activeNif = '';
    let activeName = '';
    let activeTradeName = '';
    try {
        const companyPath = companyJsonPath();
        if (fs.existsSync(companyPath)) {
          const raw = fs.readFileSync(companyPath, 'utf-8');
          const cfg = raw ? JSON.parse(raw) : {};
          activeNif = cfg.nif || '';
          activeName = cfg.name || '';
          activeTradeName = cfg.tradeName || '';
        }
    } catch {}

    originalLog(`Active Company: NIF=${activeNif}, Name=${activeName}, TradeName=${activeTradeName}`);

    // 2. Create a base document (Invoice)
    const ftData = {
      documentType: 'factura',
      series: 'FT',
      buyer: {
        name: 'Test Client',
        nif: '999999999',
        address: 'Luanda',
        email: 'test@client.com',
        phone: '999999999'
      },
      lines: [
        {
          sku: 'ITEM001',
          description: 'Test Item',
          quantity: 1,
          unitPrice: 1000,
          discount: 0,
          vatRate: 14,
          total: 1140
        }
      ],
      payment: { method: 'cash', status: 'pending' }
    };

    const ft = documentStore.createDocument(ftData as any);
    documentStore.updateDocument(ft.id, { status: 'issued' });
    originalLog(`Created Invoice: ${ft.series}/${ft.sequentialNumber} (${ft.id})`);
    originalLog(`Invoice Seller: NIF=${ft.seller.nif}, Name=${ft.seller.name}`);

    // 3. Cancel the invoice to create a Credit Note
    originalLog('Cancelling invoice...');
    const cancelledFt = documentStore.cancelDocument(ft.id);
    
    if (!cancelledFt) {
        throw new Error('Failed to cancel document');
    }

    // 4. Find the generated Credit Note
    // The relatedDocuments of the cancelled FT should contain the NC ID
    const relDocs = cancelledFt.relatedDocuments || [];
    if (relDocs.length === 0) {
        throw new Error("No related documents found on cancelled FT/ND - NC was not linked!");
    }
    const ncId = relDocs[relDocs.length - 1];
    originalLog(`Expected NC ID: ${ncId}`);

    const nc = documentStore.getDocument(ncId);
    if (!nc) {
        throw new Error(`Credit Note ${ncId} not found in store!`);
    }
    const ncAny = nc as any;
    originalLog(`NC Found in store. Type: ${ncAny.type}, Status: ${ncAny.status}, Total: ${ncAny.totals?.total || ncAny.total}`);

    const agtService = new AgtService();
        const payload = await agtService.generateRegistarFacturaPayload(nc as any);
        originalLog("Payload generated successfully");
    
    const docData = payload.documents[0];
    originalLog("Billing Reference:", JSON.stringify(docData.billingReference, null, 2));
    if (docData.lines && docData.lines.length > 0) {
        originalLog("Line 1 Reference Info:", JSON.stringify(docData.lines[0].referenceInfo, null, 2));
        originalLog("Line 1 Debit Amount:", docData.lines[0].debitAmount);
    } else {
        originalLog("WARNING: No lines in payload!");
    }

    // 5. Test Visibility Filter (mimic API logic)
    // We need to check if this document would be returned by the API for the active company
    // Logic from src/pages/api/documents/index.ts usually filters by company NIF or ID
    
    // Use the values we loaded earlier or defaults
    const testNif = activeNif || "5417523774"; 
    const testTradeName = activeTradeName || "PRAKASH - PRESTAÇÃO DE SERVIÇOS, (SU) Lda";
    const testName = activeName || "PRAKASH - PRESTAÇÃO DE SERVIÇOS, (SU) Lda";

    const norm = (s: any) => String(s || '').trim().toLowerCase();
    
    // Logic extracted from common patterns in this codebase
    const isVisible = (d: any) => {
          const s = (d as any).seller || {};
          // Check if seller matches active company
          const matchesNif = testNif && s.nif && norm(s.nif) === norm(testNif);
          const matchesTradeName = testTradeName && s.tradeName && norm(s.tradeName) === norm(testTradeName);
          const matchesName = testName && s.name && norm(s.name) === norm(testName);
          
          return matchesNif || matchesTradeName || matchesName;
    };

    const visible = isVisible(nc);
    originalLog(`Is NC visible to active company? ${visible}`);

    if (!visible) {
        originalLog("DEBUG: NC Seller info:", JSON.stringify(nc.seller, null, 2));
    }

    // Cleanup
    try {
      documentStore.deleteDocument(nc.id);
      documentStore.deleteDocument(cancelledFt.id);
      originalLog("Cleanup successful");
    } catch (e: any) {
       originalLog("Cleanup warning:", e.message); 
    }

    
  } catch (error) {
    console.error('Test Error:', error);
    process.exit(1);
  }
}

runTest();
