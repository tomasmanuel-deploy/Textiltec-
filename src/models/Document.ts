import mongoose, { Schema, Document as MongooseDocument, model } from 'mongoose';
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

// Enum for document types
export enum DocumentType {
  INVOICE = 'factura',
  QUOTE = 'orçamento',
  CREDIT_NOTE = 'nota_de_credito',
  RECEIPT = 'recibo',
  DELIVERY_NOTE = 'nota_de_entrega',
  DEBIT_NOTE = 'nota_de_debito',
  INVOICE_RECEIPT = 'factura_recibo',
  PROFORMA = 'proforma',
  OTHER_RECEIPT = 'outros_recibos',
  AVISO_COBRANCA = 'aviso_cobranca',
  GENERIC_INVOICE = 'factura_generica',
  GLOBAL_INVOICE = 'factura_global',
  SELF_BILLING_INVOICE_RECEIPT = 'factura_recibo_autofacturacao',
  REVERSAL_RECEIPT = 'recibo_estorno',
  ADVANCE_INVOICE = 'factura_adiantamento',
  PAYMENT_NOTICE_RECEIPT = 'aviso_cobranca_recibo'
}

// Enum for document status
export enum DocumentStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected'
}

// Enum for VAT exemption reasons
export enum VatExemptionReason {
  EXPORT = 'M01',
  DIPLOMATIC = 'M02',
  HEALTH_SERVICES = 'M03',
  EDUCATION = 'M04',
  FINANCIAL_SERVICES = 'M05',
  OTHER = 'M99'
}

// Party (Seller/Buyer) interface
export interface IParty {
  name: string;
  tradeName?: string;
  address: string;
  nif: string;
  email?: string;
  phone?: string;
}

// Line item interface
export interface ILineItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  vatRate: number;
  vatExemptionReason?: VatExemptionReason;
  lineTotal: number;
}

// Totals interface
export interface ITotals {
  taxableBase: number;
  vatBreakdown: {
    rate: number;
    base: number;
    amount: number;
  }[];
  subtotal: number;
  discountTotal: number;
  rounding: number;
  grandTotal: number;
  currency: string;
}

// AGT submission interface
export interface IAgtSubmission {
  status: 'draft' | 'pending' | 'success' | 'error' | 'offline_pending' | 'blocked';
  agtToken?: string;
  requestPayload?: string;
  responsePayload?: string;
  submissionDate?: string | Date;
  errorMessage?: string;
  message?: string;
  mode?: 'online' | 'offline';
  lastPollAt?: string | Date;
  requestID?: string;
  agtStatus?: string;
  estadoPayload?: string;
}

// Audit log entry interface
export interface IAuditLogEntry {
  action: 'create' | 'update' | 'delete' | 'status_change' | 'agt_submission';
  timestamp: Date;
  userId: mongoose.Types.ObjectId;
  details: string;
}

// Payment information interface
export interface IPayment {
  method: 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other';
  status: 'pending' | 'partial' | 'paid';
  dueDate?: Date;
  paidAmount?: number;
  paidDate?: Date;
  reference?: string;
}

// Document interface
export interface IDocument extends MongooseDocument {
  uuid: string;
  series: string;
  sequentialNumber: number;
  documentType: DocumentType;
  issueDate: Date;
  taxableDate: Date;
  seller: IParty;
  buyer: IParty;
  lines: ILineItem[];
  totals: ITotals;
  payment: IPayment;
  status: DocumentStatus;
  agtSubmission: IAgtSubmission;
  auditLog: IAuditLogEntry[];
  attachments?: string[];
  qrCodeData?: string;
  relatedDocuments?: mongoose.Types.ObjectId[];
  referenceInvoiceNo?: string;
  referenceInvoiceDate?: Date;
  debitNoteReason?: string;
  expenseRepass?: boolean;
  referenceText?: string;
  isManual?: boolean;
  manualBlockReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for Party
const PartySchema = new Schema({
  name: { type: String, required: true },
  tradeName: { type: String },
  address: { type: String, required: true },
  nif: { type: String, required: true },
  email: { type: String },
  phone: { type: String }
});

// Schema for Line Item
const LineItemSchema = new Schema({
  sku: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  vatRate: { type: Number, required: true },
  vatExemptionReason: { 
    type: String, 
    enum: Object.values(VatExemptionReason),
    required: function(this: any) { return this.vatRate === 0; }
  },
  lineTotal: { type: Number, required: true }
});

// Schema for VAT Breakdown
const VatBreakdownSchema = new Schema({
  rate: { type: Number, required: true },
  base: { type: Number, required: true },
  amount: { type: Number, required: true }
});

// Schema for Totals
const TotalsSchema = new Schema({
  taxableBase: { type: Number, required: true },
  vatBreakdown: [VatBreakdownSchema],
  subtotal: { type: Number, required: true },
  discountTotal: { type: Number, default: 0 },
  rounding: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  currency: { type: String, default: 'AOA', required: true }
});

// Schema for AGT Submission
const AgtSubmissionSchema = new Schema({
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'success', 'error'],
    default: 'draft'
  },
  agtToken: { type: String },
  requestPayload: { type: String },
  responsePayload: { type: String },
  submissionDate: { type: Date },
  errorMessage: { type: String }
});

// Schema for Audit Log Entry
const AuditLogEntrySchema = new Schema({
  action: { 
    type: String, 
    enum: ['create', 'update', 'delete', 'status_change', 'agt_submission'],
    required: true
  },
  timestamp: { type: Date, default: Date.now, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  details: { type: String, required: true }
});

// Schema for Payment
const PaymentSchema = new Schema({
  method: { 
    type: String, 
    enum: ['cash', 'bank_transfer', 'card', 'mobile_money', 'other'],
    required: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },
  dueDate: { type: Date },
  paidAmount: { type: Number, min: 0 },
  paidDate: { type: Date },
  reference: { type: String }
});

// Main Document Schema
const DocumentSchema = new Schema({
  uuid: { type: String, required: true, unique: true },
  series: { type: String, required: true },
  sequentialNumber: { type: Number, required: true },
  documentType: { 
    type: String, 
    enum: Object.values(DocumentType),
    required: true
  },
  issueDate: { type: Date, required: true },
  taxableDate: { type: Date, required: true },
  seller: { type: PartySchema, required: true },
  buyer: { type: PartySchema, required: true },
  lines: { 
    type: [LineItemSchema], 
    required: true,
    validate: [arrayMinLength, 'Document must have at least one line item']
  },
  totals: { type: TotalsSchema, required: true },
  payment: { type: PaymentSchema, required: true },
  status: { 
    type: String, 
    enum: Object.values(DocumentStatus),
    default: DocumentStatus.DRAFT
  },
  agtSubmission: { 
    type: AgtSubmissionSchema, 
    default: () => ({}) 
  },
  auditLog: [AuditLogEntrySchema],
  attachments: [String],
  qrCodeData: { type: String },
  relatedDocuments: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
  referenceInvoiceNo: { type: String },
  referenceInvoiceDate: { type: Date },
  debitNoteReason: { type: String },
  expenseRepass: { type: Boolean, default: false },
  referenceText: { type: String },
  isManual: { type: Boolean, default: false },
  manualBlockReference: { type: String }
}, {
  timestamps: true
});

// Validator function for array minimum length
function arrayMinLength(val: any[]) {
  return val.length > 0;
}

// Compound index for series and sequentialNumber to ensure uniqueness
DocumentSchema.index({ series: 1, sequentialNumber: 1, documentType: 1 }, { unique: true });

// Pre-save hook to generate UUID if not provided
DocumentSchema.pre('save', function(next) {
  if (!this.uuid) {
    this.uuid = new mongoose.Types.ObjectId().toString();
  }
  next();
});

// AGT Compliance: Rounding helper (Round Half Up)
const round = (value: number, decimals: number = 2): number => {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
};

// Method to calculate totals based on line items
DocumentSchema.methods.calculateTotals = function() {
  // Calculate line totals first with rounding
  const processedLines = this.lines.map((line: any) => {
    const qty = Number(line.quantity || 0);
    const unitPrice = Number(line.unitPrice || 0);
    const discountPct = Number(line.discount || 0);
    const vatRate = Number(line.vatRate || 0);
    
    const lineSubtotal = round(qty * unitPrice);
    const lineDiscount = round(lineSubtotal * (discountPct / 100));
    const lineNet = round(lineSubtotal - lineDiscount);
    const lineVat = vatRate > 0 ? round(lineNet * (vatRate / 100)) : 0;
    
    return {
      net: lineNet,
      vat: lineVat,
      rate: vatRate,
      discountAmt: lineDiscount,
      subtotal: lineSubtotal
    };
  });

  const taxableBase = round(processedLines.reduce((sum: number, l: any) => sum + l.subtotal, 0));
  const discountTotal = round(processedLines.reduce((sum: number, l: any) => sum + l.discountAmt, 0));
  const net = round(taxableBase - discountTotal);
  
  const vatBreakdownMap = new Map<number, { base: number, amount: number }>();
  let vatTotal = 0;
  
  processedLines.forEach((l: any) => {
    const entry = vatBreakdownMap.get(l.rate) || { base: 0, amount: 0 };
    entry.base += l.net;
    entry.amount += l.vat;
    vatBreakdownMap.set(l.rate, entry);
    vatTotal += l.vat;
  });
  
  // Round accumulated VAT total
  vatTotal = round(vatTotal);
  
  const vatBreakdown = Array.from(vatBreakdownMap.entries()).map(([rate, val]) => ({
    rate,
    base: round(val.base),
    amount: round(val.amount)
  }));

  this.totals = {
    taxableBase,
    vatBreakdown,
    subtotal: net,
    discountTotal,
    rounding: 0,
    grandTotal: round(net + vatTotal),
    currency: 'AOA',
  };
};

// Validate totals method
DocumentSchema.methods.validateTotals = function() {
  return this.totals && typeof this.totals.grandTotal === 'number' && this.totals.grandTotal >= 0;
};

export default mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);