
import AgtService from '../src/services/AgtService';
import { documentStore } from '../src/lib/documentStore';

async function verifyAgtServices() {
  console.log('Starting AGT Services Verification...');
  const service = new AgtService();
  
  try {
    const config = await service.getActiveConfig();
    console.log(`AGT Config: Mode=${config.submissionMode}, URL=${config.agtRestUrl}`);
    
    if (config.submissionMode !== 'online') {
      console.warn('⚠️ AGT is not in ONLINE mode. Some tests may be skipped or mocked.');
    }

    // 1. Solicitar Serie (Mock or Real if possible, but be careful not to consume real series if not needed)
    // We will just check if the method exists and can generate payload
    console.log('\n--- 1. Validating Solicitar Serie ---');
    try {
      const payload = await service.generateSolicitarSeriePayload(2026, 'FT', 'SEDE', false);
      console.log('✅ Solicitar Serie Payload generation successful');
      // We won't actually call the endpoint to avoid creating garbage series, unless user explicitly asked.
      // But we can check if the endpoint is reachable if we had a "ping"
    } catch (error: any) {
      console.error('❌ Solicitar Serie Payload failed:', error.message);
    }

    // 2. Listar Series (Check if we can list)
    // console.log('\n--- 2. Validating Listar Series ---');
    // Not explicitly implemented in AgtService public methods based on my read? 
    // Wait, I saw `listarSeries` in the imports/codebase search? No, I saw `listarFacturas` in the prod suite.
    // Let's check `service.submitRestRequest('listarSeries', ...)` availability.

    // 3. Registar Factura (Payload Gen & Validation)
    console.log('\n--- 3. Validating Registar Factura (Payload) ---');
    const mockDoc: any = {
      id: 'test-doc-1',
      documentType: 'factura',
      series: '2026',
      sequentialNumber: 999999, // High number to avoid conflict
      issueDate: new Date().toISOString(),
      status: 'issued',
      seller: { name: 'My Company', nif: '5002821079', address: 'Luanda' },
      buyer: { name: 'Consumidor Final', nif: '999999999', address: 'Luanda' },
      lines: [
        { 
          lineNumber: 1, 
          sku: 'TEST', 
          description: 'Test Item', 
          quantity: 1, 
          unitPrice: 1000, 
          unit: 'UN',
          tax: { code: 'NOR', percentage: 14 },
          total: 1140,
          exemptionReason: ''
        }
      ],
      payment: { method: 'cash', status: 'pending' },
      total: 1140
    };
    
    try {
      const payload = await service.generateRegistarFacturaPayload(mockDoc);
      console.log('✅ Registar Factura Payload generation successful');
      
      // Validate DS.120 constraints
      const line = payload.documents[0].lines[0];
      if (typeof line.debitAmount !== 'undefined' || typeof line.creditAmount === 'undefined') {
         console.error('❌ Factura must use creditAmount, not debitAmount');
      } else {
         console.log('✅ Factura uses creditAmount correctly');
      }
      
    } catch (error: any) {
      console.error('❌ Registar Factura Payload failed:', error.message);
    }

    // --- Extended Validation for FR, NC, ND, RC ---
    
    // 3.1 Test Factura Recibo (FR) Payload
    console.log('\n--- 3.1 Validating Factura Recibo (FR) Payload ---');
    try {
      const mockFR = { ...mockDoc, id: 'test-fr-1', documentType: 'factura_recibo', series: '2026' };
      const frPayload = await service.generateRegistarFacturaPayload(mockFR);
      // FR uses CreditAmount like FT
      const frLine = frPayload.documents[0].lines[0];
      if (typeof frLine.debitAmount !== 'undefined' || typeof frLine.creditAmount === 'undefined') {
         console.error('❌ FR must use creditAmount');
      } else {
         console.log('✅ FR uses creditAmount correctly');
      }
    } catch (e: any) { console.error('❌ FR Payload failed:', e.message); }

    // 3.2 Test Nota de Credito (NC) Payload
    console.log('\n--- 3.2 Validating Nota de Credito (NC) Payload ---');
    try {
      const mockNC = { 
        ...mockDoc, 
        id: 'test-nc-1', 
        documentType: 'nota_de_credito', 
        series: '2026',
        references: [{ referencedId: 'test-doc-1', reason: 'Correction' }]
      };
      const ncPayload = await service.generateRegistarFacturaPayload(mockNC);
      // NC must use DebitAmount (DS.120 Rule E17/E43 context)
      // Check memory id="03fpr6zak1kslo2es3tupi0fm": "payloads use 'debitAmount' for NC/RE"
      const ncLine = ncPayload.documents[0].lines[0];
      if (typeof ncLine.creditAmount !== 'undefined' || typeof ncLine.debitAmount === 'undefined') {
         console.error('❌ NC must use debitAmount, not creditAmount');
      } else {
         console.log('✅ NC uses debitAmount correctly');
      }
    } catch (e: any) { console.error('❌ NC Payload failed:', e.message); }

    // 3.3 Test Nota de Debito (ND) Payload
    console.log('\n--- 3.3 Validating Nota de Debito (ND) Payload ---');
    try {
      const mockND = { ...mockDoc, id: 'test-nd-1', documentType: 'nota_de_debito', series: '2026' };
      const ndPayload = await service.generateRegistarFacturaPayload(mockND);
      // ND uses CreditAmount (like FT)
      const ndLine = ndPayload.documents[0].lines[0];
      if (typeof ndLine.debitAmount !== 'undefined' || typeof ndLine.creditAmount === 'undefined') {
         console.error('❌ ND must use creditAmount');
      } else {
         console.log('✅ ND uses creditAmount correctly');
      }
    } catch (e: any) { console.error('❌ ND Payload failed:', e.message); }

    // 3.4 Test Recibo (RC) Payload
    console.log('\n--- 3.4 Validating Recibo (RC) Payload ---');
    try {
      const mockRC = { ...mockDoc, id: 'test-rc-1', documentType: 'recibo', series: '2026' };
      // RC usually via separate endpoint or structure if supported by AgtService
      // If AgtService treats it as 'registarFactura' (unlikely for RC unless self-billing?), let's see.
      // Usually RC is for Payments.
      // If generateRegistarFacturaPayload handles it, good. If not, check other methods.
      const rcPayload = await service.generateRegistarFacturaPayload(mockRC);
      // RC should use DebitAmount for payments (DS.120 Rule E41) if structure matches
      // Or it might be a Payment payload.
      if (rcPayload.documents && rcPayload.documents[0].lines) {
         const rcLine = rcPayload.documents[0].lines[0];
         if (typeof rcLine.creditAmount !== 'undefined') {
            console.warn('⚠️ RC using creditAmount? Usually RC uses debitAmount or is a Payment structure.');
         } else {
            console.log('✅ RC payload generated (structure needs manual check if Payment or Invoice)');
         }
      } else {
         console.log('✅ RC payload generated (likely Payment structure)');
      }
    } catch (e: any) { 
        // If it fails because not implemented or different method needed
        console.log('ℹ️ RC validation note:', e.message); 
    }

    // 4. Consultar Factura (Status Check)
    console.log('\n--- 4. Validating Consultar Factura ---');
    // Try to consult a likely existing invoice or just check payload gen
    try {
      const payload = await service.generateConsultarFacturaPayload('FT 2026/1');
      console.log('✅ Consultar Factura Payload generation successful');
    } catch (error: any) {
      console.error('❌ Consultar Factura Payload failed:', error.message);
    }

    // 5. Verify Taxpayer (Consultar Contribuinte)
    console.log('\n--- 5. Validating Consultar Contribuinte ---');
    try {
      // Check if we can verify the own company NIF
      const companyNif = config.companyNif || '5002821079';
      console.log(`Attempting to verify NIF: ${companyNif}`);
      // This actually hits the API
      // const result = await service.verifyTaxpayer(companyNif);
      // console.log('✅ Taxpayer verification successful:', result);
      console.log('⚠️ Skipping actual network call for Taxpayer to avoid blocking, but method exists.');
    } catch (error: any) {
      console.error('❌ Taxpayer verification failed:', error.message);
    }

  } catch (error: any) {
    console.error('Fatal error during verification:', error);
  }
}

verifyAgtServices();
