import crypto from 'crypto';
import Document, { 
  IDocument, 
  DocumentStatus, 
  DocumentType,
  ILineItem,
  IAuditLogEntry
} from '../models/Document';
import mongoose from 'mongoose';

class DocumentService {
  /**
   * Create a new document (invoice, quote, credit note, receipt)
   */
  async createDocument(documentData: Partial<IDocument>, userId: string): Promise<IDocument> {
    try {
      // Generate UUID if not provided
      if (!documentData.uuid) {
        documentData.uuid = (crypto as any).randomUUID ? crypto.randomUUID() : new mongoose.Types.ObjectId().toString();
      }
      
      // Set initial status to DRAFT
      documentData.status = DocumentStatus.DRAFT;
      
      // Get next sequential number for the series
      if (documentData.series) {
        const nextNumber = await this.getNextSequentialNumber(
          documentData.series, 
          documentData.documentType as DocumentType
        );
        documentData.sequentialNumber = nextNumber;
      }
      
      // Create audit log entry
      const auditEntry: IAuditLogEntry = {
        action: 'create',
        timestamp: new Date(),
        userId: new mongoose.Types.ObjectId(userId),
        details: `Created ${documentData.documentType} document`
      };
      
      if (!documentData.auditLog) {
        documentData.auditLog = [];
      }
      documentData.auditLog.push(auditEntry);
      
      // Create new document
      const document = new Document(documentData);
      
      // Calculate and validate totals
      document.calculateTotals();
      
      await document.save();
      return document;
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }
  
  /**
   * Get next sequential number for a document series
   */
  async getNextSequentialNumber(series: string, documentType: DocumentType): Promise<number> {
    try {
      const lastDocument = await Document.findOne({
        series,
        documentType
      }).sort({ sequentialNumber: -1 }).limit(1);
      
      return lastDocument ? lastDocument.sequentialNumber + 1 : 1;
    } catch (error) {
      console.error('Error getting next sequential number:', error);
      throw error;
    }
  }
  
  /**
   * Update an existing document
   */
  async updateDocument(id: string, updateData: Partial<IDocument>, userId: string): Promise<IDocument | null> {
    try {
      const document = await Document.findById(id);
      
      if (!document) {
        return null;
      }
      
      // Only allow updates if document is in DRAFT status
      if (document.status !== DocumentStatus.DRAFT) {
        throw new Error('Cannot update document that is not in DRAFT status');
      }
      
      // Update fields
      Object.keys(updateData).forEach(key => {
        if (key !== '_id' && key !== 'uuid' && key !== 'series' && 
            key !== 'sequentialNumber' && key !== 'documentType' && 
            key !== 'status' && key !== 'auditLog') {
          (document as any)[key] = (updateData as any)[key];
        }
      });
      
      // Create audit log entry
      const auditEntry: IAuditLogEntry = {
        action: 'update',
        timestamp: new Date(),
        userId: new mongoose.Types.ObjectId(userId),
        details: `Updated ${document.documentType} document`
      };
      
      document.auditLog.push(auditEntry);
      
      // Recalculate totals
      document.calculateTotals();
      
      await document.save();
      return document;
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }
  
  /**
   * Change document status
   */
  async changeDocumentStatus(id: string, newStatus: DocumentStatus, userId: string, details?: string): Promise<IDocument | null> {
    try {
      const document = await Document.findById(id);
      
      if (!document) {
        return null;
      }
      
      // Validate status transition
      this.validateStatusTransition(document.status, newStatus);
      
      // Update status
      document.status = newStatus;
      
      // Create audit log entry
      const auditEntry: IAuditLogEntry = {
        action: 'status_change',
        timestamp: new Date(),
        userId: new mongoose.Types.ObjectId(userId),
        details: details || `Changed status from ${document.status} to ${newStatus}`
      };
      
      document.auditLog.push(auditEntry);
      
      await document.save();
      return document;
    } catch (error) {
      console.error('Error changing document status:', error);
      throw error;
    }
  }
  
  /**
   * Validate document status transition
   */
  validateStatusTransition(currentStatus: DocumentStatus, newStatus: DocumentStatus): void {
    // Define valid transitions
    const validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
      [DocumentStatus.DRAFT]: [DocumentStatus.SUBMITTED],
      [DocumentStatus.SUBMITTED]: [DocumentStatus.ACCEPTED, DocumentStatus.REJECTED],
      [DocumentStatus.ACCEPTED]: [],
      [DocumentStatus.REJECTED]: [DocumentStatus.DRAFT]
    };
    
    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }
  
  /**
   * Delete a document (only if in DRAFT status)
   */
  async deleteDocument(id: string, userId: string): Promise<boolean> {
    try {
      const document = await Document.findById(id);
      
      if (!document) {
        return false;
      }
      
      // Only allow deletion if document is in DRAFT status
      if (document.status !== DocumentStatus.DRAFT) {
        throw new Error('Cannot delete document that is not in DRAFT status');
      }
      
      await Document.deleteOne({ _id: id });
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }
  
  /**
   * Convert quote to invoice
   */
  async convertQuoteToInvoice(quoteId: string, userId: string): Promise<IDocument> {
    try {
      const quote = await Document.findById(quoteId);
      
      if (!quote) {
        throw new Error('Quote not found');
      }
      
      if (quote.documentType !== DocumentType.QUOTE) {
        throw new Error('Document is not a quote');
      }
      
      // Create new invoice data
      const invoiceData: Partial<IDocument> = {
        documentType: DocumentType.INVOICE,
        series: quote.series,
        issueDate: new Date(),
        taxableDate: new Date(),
        seller: quote.seller,
        buyer: quote.buyer,
        lines: quote.lines,
        totals: quote.totals,
        payment: quote.payment,
        relatedDocuments: [quote._id]
      };
      
      // Create new invoice
      const invoice = await this.createDocument(invoiceData, userId);
      
      // Update quote with reference to invoice
      if (!quote.relatedDocuments) {
        quote.relatedDocuments = [];
      }
      quote.relatedDocuments.push(invoice._id);
      await quote.save();
      
      return invoice;
    } catch (error) {
      console.error('Error converting quote to invoice:', error);
      throw error;
    }
  }
  
  /**
   * Get document by ID
   */
  async getDocumentById(id: string): Promise<IDocument | null> {
    try {
      return await Document.findById(id);
    } catch (error) {
      console.error('Error getting document by ID:', error);
      throw error;
    }
  }
  
  /**
   * Get documents by type and status
   */
  async getDocuments(
    documentType?: DocumentType,
    status?: DocumentStatus,
    page: number = 1,
    limit: number = 10
  ): Promise<{ documents: IDocument[], total: number }> {
    try {
      const query: any = {};
      
      if (documentType) {
        query.documentType = documentType;
      }
      
      if (status) {
        query.status = status;
      }
      
      const skip = (page - 1) * limit;
      
      const [documents, total] = await Promise.all([
        Document.find(query)
          .sort({ issueDate: -1 })
          .skip(skip)
          .limit(limit),
        Document.countDocuments(query)
      ]);
      
      return { documents, total };
    } catch (error) {
      console.error('Error getting documents:', error);
      throw error;
    }
  }
}

export default new DocumentService();
