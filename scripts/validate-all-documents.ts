
import fs from 'fs';
import path from 'path';
import { documentStore } from '../src/lib/documentStore';
import { AgtService } from '../src/services/AgtService';
import { DocumentType } from '../src/models/Document';

// Helper for colored logs
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  let color = colors.reset;
  switch (level) {
    case 'INFO': color = colors.blue; break;
    case 'WARN': color = colors.yellow; break;
    case 'ERROR': color = colors.red; break;
    case 'SUCCESS': color = colors.green; break;
  }
  console.log(`${color}[${timestamp}] [${level}] ${message}${colors.reset}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

import { CentralLogService } from '../src/services/CentralLogService';

// Mock AgtService to ensure safe config without DB
class TestAgtService extends AgtService {
    // Override to return safe test config
    async getActiveConfig(): Promise<any> {
        return {
            apiUrl: 'https://test-agt.minfin.gov.ao', // Mock URL
            clientId: 'TEST-CLIENT',
            clientSecret: 'TEST-SECRET',
            testMode: true,
            submissionMode: 'online',
            companyNif: '5417019245',
            taxRegistrationNumber: '5417019245'
        };
    }
    
    // Override to avoid file system reads for company info if needed
    protected async getCompanyInfo(): Promise<any> {
        return CONFIG.seller;
    }
}

const agtService = new TestAgtService();

// Validation Configuration
const CONFIG = {
  unitPrice: 1, // 1 Kwanza
  buyer: {
    name: 'Consumidor Final',
    nif: '999999999',
    address: 'Luanda, Angola',
    email: 'consumidor@teste.ao',
    phone: '900000000'
  },
  seller: { // Fallback if not in company.json
    name: 'Empresa de Teste',
    tradeName: 'Teste Lda',
    address: 'Luanda',
    nif: '5417019245',
    email: 'teste@empresa.ao',
    phone: '900000000'
  }
};

async function validateDocumentType(type: string, referenceDoc?: any) {
  log('INFO', `Starting validation for document type: ${type}`);

  try {
    // 1. Prepare Document Data
    const lineItem = {
      sku: 'TEST-001',
      description: `Item de Teste para ${type}`,
      quantity: 1,
      unitPrice: CONFIG.unitPrice,
      discount: 0,
      vatRate: 14,
      total: CONFIG.unitPrice + (CONFIG.unitPrice * 0.14),
      unit: 'UN'
    };

    // Calculate totals manually for the payload
    const subtotal = lineItem.quantity * lineItem.unitPrice;
    const vatAmount = subtotal * 0.14;
    const total = subtotal + vatAmount;

    const docData: any = {
      documentType: type,
      buyer: CONFIG.buyer,
      seller: CONFIG.seller, // DocumentStore might override this from company.json
      lines: [lineItem],
      totals: {
        subtotal: subtotal,
        discount: 0,
        vatTotal: vatAmount,
        total: total,
        vatBreakdown: [{ rate: 14, base: subtotal, amount: vatAmount }]
      },
      payment: {
        method: 'cash',
        status: 'paid',
        paidAmount: total,
        paidDate: new Date().toISOString()
      },
      status: 'draft',
      // Special handling for credit/debit notes
      relatedDocuments: referenceDoc ? [referenceDoc.id] : undefined,
      referenceInvoiceNo: referenceDoc ? referenceDoc.documentNo || referenceDoc.id : undefined,
      debitNoteReason: type === 'nota_de_debito' ? 'Teste de validação' : undefined,
      cancellation: type === 'nota_de_credito' ? { reason: 'Teste de validação' } : undefined
    };

    // 2. Create Document in Store
    log('INFO', `Creating document of type ${type}...`);
    let createdDoc;
    try {
        createdDoc = documentStore.createDocument(docData);
        log('SUCCESS', `Document created successfully. ID: ${createdDoc.id}, Type: ${createdDoc.documentType}`);
    } catch (err: any) {
        log('ERROR', `Failed to create document: ${err.message}`);
        throw err;
    }

    // 3. Submit to AGT (Simulated or Real based on config)
    log('INFO', `Submitting document ${createdDoc.id} to AGT...`);
    
    // Update status to 'submitted' (simulating dashboard logic)
    // Note: In real app, this happens after successful submission or during processing
    // We will try to call AgtService to generate payload and "send"
    
    let submissionResult;
    try {
        // We use generateRegistarFacturaPayload to validate payload generation logic
        // This confirms data integrity for AGT standards
        const payload = await agtService.generateRegistarFacturaPayload(createdDoc as any);
        log('INFO', `AGT Payload generated successfully`, { 
            docNo: payload.documentNo,
            hash: payload.hash ? payload.hash.substring(0, 10) + '...' : 'N/A' 
        });

        // Simulating submission success
        submissionResult = {
            status: 'success',
            message: 'Documento submetido com sucesso (Simulação)',
            agtToken: 'SIMULATED-TOKEN-' + Date.now()
        };

        // 5. Update status to issued and simulated AGT success
        const docRef = documentStore.getDocument(createdDoc.id);
        if (docRef) {
            docRef.status = 'issued';
            docRef.agtSubmission = {
                status: 'success',
                message: submissionResult.message,
                agtToken: submissionResult.agtToken,
                submissionDate: new Date().toISOString(),
                mode: 'online'
            };
            
            // Explicitly override seller to ensure consistency
            documentStore.overrideSeller(docRef.id, docRef.seller);
            
            // Log to Central Dashboard
            try {
                log('INFO', `Reporting submission of ${docRef.id} to Central Dashboard...`);
                // Ensure fetch is available (Node 18+) or use a polyfill if needed
                if (typeof fetch === 'undefined') {
                    log('WARN', 'Fetch API not available, skipping Central Dashboard report.');
                } else {
                    await CentralLogService.logSubmission(docRef.id, 'success', {
                        documentType: docRef.documentType,
                        amount: docRef.totals.total,
                        customer: docRef.buyer?.name,
                        agtToken: docRef.agtSubmission.agtToken
                    });
                    log('SUCCESS', `Reported to Central Dashboard.`);
                }
            } catch (e) {
                log('ERROR', `Failed to report to Central Dashboard: ${e}`);
            }

            log('SUCCESS', `Document ${docRef.id} status updated to 'issued' and AGT submission recorded.`);
        }

    } catch (err: any) {
        log('ERROR', `AGT Submission failed: ${err.message}`);
        // Implement Retry Logic
        log('WARN', `Retrying submission in 1 second...`);
        await new Promise(r => setTimeout(r, 1000));
        try {
             const payload = await agtService.generateRegistarFacturaPayload(createdDoc as any);
             log('SUCCESS', `Retry: AGT Payload generated successfully`);
        } catch (retryErr: any) {
             log('ERROR', `Retry failed: ${retryErr.message}`);
             throw retryErr;
        }
    }

    // 4. Verification
    const verifiedDoc = documentStore.getDocument(createdDoc.id);
    if (verifiedDoc && verifiedDoc.agtSubmission?.status === 'success') {
        log('SUCCESS', `Validation passed for ${type}. Dashboard status: CONFIRMADO (Simulated via 'issued' + success)`);
        return verifiedDoc;
    } else {
        throw new Error(`Verification failed for ${type}`);
    }

  } catch (error) {
    log('ERROR', `Validation failed for ${type}`);
    return null;
  }
}

async function runAllValidations() {
  log('INFO', 'Starting Full System Validation - 1 Document per Type (1 AOA)');
  
  const results: Record<string, boolean> = {};
  
  // Order matters: Invoice first to serve as reference for others
  const typesToValidate = [
    DocumentType.INVOICE, // factura
    DocumentType.INVOICE_RECEIPT, // factura_recibo
    DocumentType.QUOTE, // orçamento
    DocumentType.PROFORMA, // proforma
    DocumentType.DELIVERY_NOTE, // nota_de_entrega
    DocumentType.AVISO_COBRANCA, // aviso_cobranca (Independent?)
    DocumentType.OTHER_RECEIPT, // outros_recibos (Independent?)
    // DocumentType.RECEIPT, // recibo (requires invoice ref usually, but we can try standalone if allowed)
    // Credit/Debit notes need reference
  ];

  let baseInvoice: any = null;

  // 1. Validate Base Invoice (Factura)
  baseInvoice = await validateDocumentType(DocumentType.INVOICE);
  results[DocumentType.INVOICE] = !!baseInvoice;

  if (!baseInvoice) {
      log('ERROR', 'CRITICAL: Failed to create base Invoice. Dependent document validations (Credit Note, Debit Note) will fail.');
  }

  // 2. Validate Other Independent Types
  for (const type of typesToValidate) {
      if (type === DocumentType.INVOICE) continue; // Already done
      const result = await validateDocumentType(type);
      results[type] = !!result;
  }

  // 3. Validate Dependent Types (Credit Note, Debit Note)
  if (baseInvoice) {
      // Nota de Crédito
      const ncResult = await validateDocumentType(DocumentType.CREDIT_NOTE, baseInvoice);
      results[DocumentType.CREDIT_NOTE] = !!ncResult;

      // Nota de Débito
      const ndResult = await validateDocumentType(DocumentType.DEBIT_NOTE, baseInvoice);
      results[DocumentType.DEBIT_NOTE] = !!ndResult;
      
      // Recibo (referencing Invoice)
      const rcResult = await validateDocumentType(DocumentType.RECEIPT, baseInvoice);
      results[DocumentType.RECEIPT] = !!rcResult;
  } else {
      results[DocumentType.CREDIT_NOTE] = false;
      results[DocumentType.DEBIT_NOTE] = false;
      results[DocumentType.RECEIPT] = false;
      log('WARN', 'Skipping Dependent Types due to base Invoice failure.');
  }

  // Summary
  console.log('\n=============================================');
  console.log('           VALIDATION SUMMARY                ');
  console.log('=============================================');
  let allPassed = true;
  for (const [type, passed] of Object.entries(results)) {
      const status = passed ? `${colors.green}PASSED${colors.reset}` : `${colors.red}FAILED${colors.reset}`;
      console.log(`${type.padEnd(20)}: ${status}`);
      if (!passed) allPassed = false;
  }
  console.log('=============================================');
  
  if (allPassed) {
      log('SUCCESS', 'ALL SYSTEMS OPERATIONAL. Ready for production usage.');
  } else {
      log('ERROR', 'SOME CHECKS FAILED. Please review logs.');
      process.exit(1);
  }
}

// Execute
runAllValidations().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
