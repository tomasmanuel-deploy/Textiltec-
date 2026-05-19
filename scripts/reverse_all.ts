
import { documentStore } from '../src/lib/documentStore';
import { AgtService } from '../src/services/AgtService';
import { IDocument, DocumentType, DocumentStatus } from '../src/models/Document';
import fs from 'fs';
import path from 'path';

// Initialize services
const agtService = new AgtService();

async function main() {
  console.log('Starting reversal process...');
  
  // 1. Cancel drafts
  const allDocs = documentStore.getAllDocuments();
  const drafts = allDocs.filter((d: any) => d.status === 'draft');
  console.log(`Found ${drafts.length} drafts to cancel.`);
  
  for (const draft of drafts) {
    documentStore.updateDocument(draft.id, {
      status: 'cancelled',
      cancellation: {
        reason: 'Solicitação de cancelamento em massa (Estorno)',
        cancelledAt: new Date().toISOString()
      }
    } as any);
    console.log(`Cancelled draft ${draft.id} (${draft.documentType})`);
  }

  // 2. Reverse valid documents (FT, FR, ND)
  const validTypes = ['factura', 'factura_recibo', 'nota_de_debito', 'ft', 'fr', 'nd'];
  const toReverse = allDocs.filter((d: any) => 
    validTypes.includes(String(d.documentType).toLowerCase()) && 
    d.status !== 'cancelled' &&
    d.status !== 'draft' // already handled
  );

  console.log(`Found ${toReverse.length} valid documents to reverse.`);

  const agtService = new AgtService();
  
  // Get active config to ensure we are online
  const config = await agtService.getActiveConfig();
  console.log(`AGT Mode: ${(config as any).submissionMode}`);

  for (const doc of toReverse) {
    console.log(`Processing reversal for ${doc.documentType} ${doc.series}/${doc.sequentialNumber} (${doc.id})`);
    
    // Check if already reversed
    const existingNC = allDocs.find((d: any) => 
      (d.documentType === 'nota_de_credito' || d.documentType === 'nc') &&
      d.relatedDocuments && 
      d.relatedDocuments.includes(doc.id)
    );

    if (existingNC) {
      console.log(`Document ${doc.id} already has Credit Note ${existingNC.series}/${existingNC.sequentialNumber}. Skipping.`);
      continue;
    }

    // Create Credit Note
    const year = new Date().getFullYear();
    const series = 'NC'; 
    // Find max sequential number for NC/Year
    // Re-fetch all docs to get latest state
    const currentDocs = documentStore.getAllDocuments();
    const ncDocs = currentDocs.filter((d: any) => 
      (d.documentType === 'nota_de_credito' || d.documentType === 'nc') &&
      d.series === series &&
      new Date(d.issueDate).getFullYear() === year
    );
    const maxSeq = ncDocs.reduce((max: number, d: any) => Math.max(max, Number(d.sequentialNumber) || 0), 0);
    const nextSeq = maxSeq + 1;

    // Create NC payload
    const ncPayload: any = {
      series,
      sequentialNumber: nextSeq,
      documentType: 'nota_de_credito',
      issueDate: new Date().toISOString().split('T')[0],
      taxableDate: new Date().toISOString().split('T')[0],
      buyer: doc.buyer,
      seller: doc.seller,
      lines: doc.lines.map((l: any) => ({
        ...l,
        total: Math.abs(Number(l.total) || 0),
        unitPrice: Math.abs(Number(l.unitPrice) || 0),
        // Ensure quantity is positive
        quantity: Math.abs(Number(l.quantity) || 1)
      })),
      totals: {
        ...doc.totals,
        total: Math.abs(Number(doc.totals?.total) || 0),
        subtotal: Math.abs(Number(doc.totals?.subtotal) || 0),
        vatTotal: Math.abs(Number(doc.totals?.vatTotal) || 0)
      },
      payment: {
        method: 'other',
        status: 'pending',
        dueDate: new Date().toISOString().split('T')[0]
      },
      status: 'issued',
      relatedDocuments: [doc.id],
      referenceInvoiceNo: `${doc.documentType === 'factura' ? 'FT' : doc.documentType === 'factura_recibo' ? 'FR' : 'ND'} ${doc.series}/${doc.sequentialNumber}`,
      cancellation: {
        reason: 'Estorno total do documento',
        cancelledAt: new Date().toISOString()
      }
    };

    // Save NC
    const createdNC = documentStore.createDocument(ncPayload);
    console.log(`Created Credit Note ${createdNC.series}/${createdNC.sequentialNumber} (${createdNC.id})`);

    // Submit to AGT
    try {
        console.log(`Submitting NC to AGT...`);
        const result = await agtService.registarFactura(createdNC as any);
        console.log(`AGT Result: ${result.resultCode} - ${result.resultMessage || ''}`);
        
        if (result.resultCode === 1 || result.resultCode === '1' || (result.requestID && (!result.errorList || !result.errorList.length))) {
             const token = result.submissionToken || result.agtToken || result.requestID || 'mock-token';
             documentStore.updateDocument(createdNC.id, {
                 agtSubmission: {
                     status: 'success',
                     agtToken: token,
                     submissionDate: new Date().toISOString(),
                     message: 'Auto-submitted successfully'
                 }
             } as any);
             console.log(`NC submitted successfully.`);
             
             // Update original document status to 'cancelled' (or just link it)
             documentStore.updateDocument(doc.id, {
                 status: 'cancelled',
                 cancellation: {
                     reason: `Estornado por NC ${createdNC.series}/${createdNC.sequentialNumber}`,
                     cancelledAt: new Date().toISOString()
                 }
             } as any);
        } else {
             console.error(`AGT Submission failed for NC: ${JSON.stringify(result)}`);
             documentStore.updateDocument(createdNC.id, {
                 agtSubmission: {
                     status: 'error',
                     errorMessage: result.errorList ? JSON.stringify(result.errorList) : `Code ${result.resultCode}`,
                     submissionDate: new Date().toISOString()
                 }
             } as any);
        }

    } catch (e) {
        console.error(`Error submitting NC:`, e);
    }
  }
}

main().catch(console.error);
