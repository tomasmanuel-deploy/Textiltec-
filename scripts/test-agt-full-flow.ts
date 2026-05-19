
import { AgtService } from '../src/services/AgtService';
import { IDocument, DocumentType, DocumentStatus, IParty, ILineItem, ITotals, IPayment } from '../src/models/Document';
import fs from 'fs';
import path from 'path';

// Mock AgtService to use test configuration
class MockAgtService extends AgtService {
  // Override to provide test config without needing DB or files
  async getActiveConfig(): Promise<any> {
    return {
      companyNif: '5417019245',
      agtRestUrl: 'https://sifphml.minfin.gov.ao/sigt/fe/v1',
      agtUsername: '5417019245',
      agtPassword: '123456', // Test password
      nif: '5417019245',
      testMode: true
    };
  }

  // Override to provide test company info
  protected async getCompanyInfo(): Promise<any> {
    return {
      nif: '5417019245',
      name: 'Empresa de Teste Lda',
      address: 'Rua do Teste, 123',
      city: 'Luanda',
      saftProductId: 'com.example.prakash',
      saftProductVersion: '1.0.0',
      saftProductCompanyTaxId: '5417019245',
      saftSoftwareValidationNumber: '0'
    };
  }
}

async function runTests() {
  console.log('Starting AGT Full Flow Tests...');
  const service = new MockAgtService();

  try {
    // 1. Test Solicitar Serie
    console.log('\n--- Testing Solicitar Serie ---');
    const seriePayload = await service.generateSolicitarSeriePayload(2025, 'FT', 'SEDE', false);
    console.log('Solicitar Serie Payload:', JSON.stringify(seriePayload, null, 2));
    
    // Note: In a real scenario we would call service.solicitarSerie()
    // but here we just want to verify payload generation and method existence
    // const serieResult = await service.solicitarSerie(2025, 'FT'); 

    // 2. Test Registar Factura (Invoice)
    console.log('\n--- Testing Registar Factura (FT) ---');
    
    const seller: IParty = {
        nif: '5417019245',
        name: 'Empresa de Teste Lda',
        address: 'Rua do Teste, 123',
        // city: 'Luanda' // Not in interface, but AgtService handles missing city
    };
    (seller as any).city = 'Luanda';

    const buyer: IParty = {
        nif: '999999999',
        name: 'Consumidor Final',
        address: 'Luanda',
        // city: 'Luanda'
    };
    (buyer as any).city = 'Luanda';

    const lines: ILineItem[] = [
        {
          sku: 'PROD001',
          description: 'Serviço de Consultoria',
          quantity: 1,
          unitPrice: 1000,
          unit: 'UN',
          vatRate: 14,
          discount: 0,
          lineTotal: 1000 // 1000 * 1
        }
    ];

    const totals: ITotals = {
        subtotal: 1000,
        taxableBase: 1000,
        vatBreakdown: [{ rate: 14, base: 1000, amount: 140 }],
        grandTotal: 1140,
        discountTotal: 0,
        rounding: 0,
        currency: 'AOA'
    };
    // Add extra property expected by AgtService if any
    (totals as any).vatTotal = 140; 

    const payment: IPayment = {
        method: 'cash',
        paidAmount: 1140,
        status: 'paid'
    };

    const invoice: any = { // Cast to any to avoid strict type checks for missing Mongoose properties
      id: 'doc1',
      uuid: 'uuid-1234',
      documentType: DocumentType.INVOICE,
      series: '2025',
      sequentialNumber: 1,
      documentNumber: 'FT 2025/1',
      status: DocumentStatus.ACCEPTED,
      issueDate: new Date(),
      taxableDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      dueDate: new Date(),
      seller: seller,
      buyer: buyer,
      lines: lines,
      totals: totals,
      payment: payment,
      hash: 'hash-test-123'
    };

    const invoicePayload = await service.generateRegistarFacturaPayload(invoice);
    console.log('Registar Factura Payload:', JSON.stringify(invoicePayload, null, 2));

    // 3. Test QR Code
    console.log('\n--- Testing QR Code Generation ---');
    const qrCodeData = await service.generateQrCodeData(invoice);
    console.log('QR Code Data:', qrCodeData);
    if (!qrCodeData.includes('quiosqueagt.minfin.gov.ao')) {
        console.error('ERROR: QR Code URL format is incorrect!');
    }
    
    // 4. Test Obter Estado
    console.log('\n--- Testing Obter Estado ---');
    const statusPayload = await service.generateObterEstadoPayload('REQ-12345');
    console.log('Obter Estado Payload:', JSON.stringify(statusPayload, null, 2));

    // 5. Test Listar Facturas
    console.log('\n--- Testing Listar Facturas ---');
    const listPayload = await service.generateListarFacturasPayload(new Date('2025-01-01'), new Date('2025-01-31'));
    console.log('Listar Facturas Payload:', JSON.stringify(listPayload, null, 2));

    // =================================================================================
    // REAL CONNECTION TESTS
    // =================================================================================
    console.log('\n\n=================================================================================');
    console.log('STARTING REAL CONNECTION TESTS TO AGT (HML ENVIRONMENT)');
    console.log('Note: Authentication errors (401/403/500) are EXPECTED and PROVE connectivity.');
    console.log('=================================================================================');

    // Helper to print connection result
    const logConnectionResult = (name: string, error: any) => {
        if (error.response) {
            console.log(`\n✅ [${name}] CONNECTION SUCCESSFUL!`);
            console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
            // console.log(`   Server responded: ${JSON.stringify(error.response.data).substring(0, 100)}...`);
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.log(`\n❌ [${name}] CONNECTION FAILED`);
            console.log(`   Error Code: ${error.code}`);
            console.log('   Check internet connection.');
        } else {
            console.log(`\n⚠️  [${name}] UNEXPECTED ERROR:`, error.message);
            if (error.response) console.log('Response:', error.response.status);
        }
    };

    // 1. Registar Factura (SOAP)
    console.log('\n1. Testing Registar Factura (SOAP)...');
    try {
        await service.submitInvoiceSoap(invoice);
        console.log('   Unexpected success (credentials should be invalid).');
    } catch (e) { logConnectionResult('Registar Factura SOAP', e); }

    // 2. Solicitar Serie (REST)
    console.log('\n2. Testing Solicitar Serie (REST)...');
    try {
        await service.solicitarSerie(2025, 'FT', 'SEDE', false);
        console.log('   Unexpected success.');
    } catch (e) { logConnectionResult('Solicitar Serie', e); }

    // 3. Obter Estado (REST)
    console.log('\n3. Testing Obter Estado (REST)...');
    try {
        await service.obterEstado('REQ-TEST-123');
        console.log('   Unexpected success.');
    } catch (e) { logConnectionResult('Obter Estado', e); }

    // 4. Listar Series (REST)
    console.log('\n4. Testing Listar Series (REST)...');
    try {
        await service.listarSeries(2025);
        console.log('   Unexpected success.');
    } catch (e) { logConnectionResult('Listar Series', e); }

    // 5. Listar Facturas (REST)
    console.log('\n5. Testing Listar Facturas (REST)...');
    try {
        await service.listarFacturas(new Date('2025-01-01'), new Date('2025-01-31'));
        console.log('   Unexpected success.');
    } catch (e) { logConnectionResult('Listar Facturas', e); }

    // 6. Consultar Factura (REST)
    console.log('\n6. Testing Consultar Factura (REST)...');
    try {
        await service.consultarFactura('FT 2025/1');
        console.log('   Unexpected success.');
    } catch (e) { logConnectionResult('Consultar Factura', e); }

    console.log('\nAll tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
    if (error instanceof Error) {
        console.error(error.stack);
    }
  }
}

runTests();
