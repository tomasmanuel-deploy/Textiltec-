// Shared document store for all API endpoints
// This ensures data consistency across all document operations

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { seriesStore } from './seriesStore';
import { companyJsonPath, resolveDataPath } from './dataPaths';

export interface DocumentBuyer {
  name: string;
  tradeName?: string;
  address: string;
  nif: string;
  email: string;
  phone: string;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  vatTotal: number;
  total: number;
  vatBreakdown: Array<{
    rate: number;
    base: number;
    amount: number;
  }>;
}

export interface LineItem {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  total: number;
  // Optional fields to link with products and maintain unit information
  productId?: string;
  unit?: string;
  // AGT compliance: reason required when vatRate=0
  vatExemptionReason?: string;
}

export interface Document {
  id: string;
  uuid: string;
  series: string;
  sequentialNumber: number;
  documentType: 'factura' | 'factura_recibo' | 'nota_de_debito' | 'orçamento' | 'nota_de_entrega' | 'nota_de_credito' | 'recibo' | 'proforma' | 'factura_global' | 'factura_generica' | 'factura_adiantamento' | 'factura_recibo_autofacturacao' | 'aviso_cobranca' | 'aviso_cobranca_recibo' | 'outros_recibos' | 'recibo_estorno';
  issueDate: string;
  taxableDate: string;
  seller: {
    name: string;
    tradeName: string;
    address: string;
    nif: string;
    email: string;
    phone: string;
  };
  buyer: DocumentBuyer;
  lines: LineItem[];
  totals: DocumentTotals;
  headerDiscountAmount?: number;
  payment: {
    method: string;
    status: string;
    dueDate?: string;
    paidAmount?: number;
    paidDate?: string;
  };
  // Debit note metadata (AGT compliance): reason/motivo and references
  debitNoteReason?: string;
  referenceInvoiceNo?: string;
  referenceInvoiceDate?: string; // YYYY-MM-DD
  referenceText?: string; // fallback observation text
  expenseRepass?: boolean; // mark when it is "Repasse de Despesas"
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  cancellation?: {
    reason?: string;
    cancelledAt?: string;
  };
  // Optional references to related/source documents (e.g., invoices, quotes)
  relatedDocuments?: string[];
  // AGT Compliance
  hash?: string;
  prevHash?: string;
  hashAlgorithm?: string;
  
  // AGT Submission Status
  agtSubmission?: {
    status: 'success' | 'error' | 'pending' | 'offline_pending' | 'blocked';
    message?: string;
    agtToken?: string;
    submissionDate?: string;
    mode?: 'online' | 'offline';
    lastPollAt?: string;
  };

  createdAt: string;
  updatedAt: string;
}

// Initial mock documents
const initialMockDocuments: { [key: string]: Document } = {
  '1': { 
    id: '1',
    uuid: 'doc-uuid-001',
    series: 'FT',
    sequentialNumber: 1,
    documentType: 'factura',
    issueDate: '2023-05-15',
    taxableDate: '2023-05-15',
    seller: {
      name: 'AGT - Assessoria de Gestão e Tecnologia, Lda',
      tradeName: 'AGT',
      address: 'Rua Principal, 123, Luanda, Angola',
      nif: '5417189144',
      email: 'geral@agt.ao',
      phone: '+244 923 456 789'
    },
    buyer: {
      name: 'Empresa Cliente, Lda',
      tradeName: 'Cliente Lda',
      address: 'Rua do Cliente, 456, Luanda, Angola',
      nif: '1234567890',
      email: 'cliente@exemplo.ao',
      phone: '+244 912 345 678'
    },
    lines: [
      {
        sku: 'SERV001',
        description: 'Consultoria em Gestão',
        quantity: 10,
        unitPrice: 50000,
        discount: 0,
        vatRate: 14,
        total: 570000
      }
    ],
    totals: {
      subtotal: 500000,
      discount: 0,
      vatTotal: 70000,
      total: 570000,
      vatBreakdown: [
        { rate: 14, base: 500000, amount: 70000 }
      ]
    },
    payment: {
      method: 'bank_transfer',
      status: 'pending',
      dueDate: '2023-06-15'
    },
    status: 'draft',
    createdAt: '2023-05-15T10:00:00Z',
    updatedAt: '2023-05-15T10:00:00Z'
  },
  '2': { 
    id: '2',
    uuid: 'doc-uuid-002',
    series: 'FT',
    sequentialNumber: 2,
    documentType: 'factura',
    issueDate: '2023-05-20',
    taxableDate: '2023-05-20',
    seller: {
      name: 'AGT - Assessoria de Gestão e Tecnologia, Lda',
      tradeName: 'AGT',
      address: 'Rua Principal, 123, Luanda, Angola',
      nif: '5417189144',
      email: 'geral@agt.ao',
      phone: '+244 923 456 789'
    },
    buyer: {
      name: 'Cliente Individual',
      tradeName: '',
      address: 'Rua Individual, 789, Luanda, Angola',
      nif: '0987654321',
      email: 'individual@exemplo.ao',
      phone: '+244 987 654 321'
    },
    lines: [
      {
        sku: 'PROD001',
        description: 'Produto de Exemplo',
        quantity: 5,
        unitPrice: 25000,
        discount: 10,
        vatRate: 14,
        total: 128250
      }
    ],
    totals: {
      subtotal: 125000,
      discount: 12500,
      vatTotal: 15750,
      total: 128250,
      vatBreakdown: [
        { rate: 14, base: 112500, amount: 15750 }
      ]
    },
    payment: {
      method: 'cash',
      status: 'paid',
      paidAmount: 128250,
      paidDate: '2023-05-20'
    },
    status: 'issued',
    createdAt: '2023-05-20T14:30:00Z',
    updatedAt: '2023-05-20T14:30:00Z'
  },
  '3': { 
    id: '3',
    uuid: 'doc-uuid-003',
    series: 'OR',
    sequentialNumber: 1,
    documentType: 'orçamento',
    issueDate: '2023-05-22',
    taxableDate: '2023-05-22',
    seller: {
      name: 'AGT - Assessoria de Gestão e Tecnologia, Lda',
      tradeName: 'AGT',
      address: 'Rua Principal, 123, Luanda, Angola',
      nif: '5417189144',
      email: 'geral@agt.ao',
      phone: '+244 923 456 789'
    },
    buyer: {
      name: 'Potencial Cliente, S.A.',
      tradeName: 'Potencial S.A.',
      address: 'Avenida Potencial, 321, Luanda, Angola',
      nif: '1122334455',
      email: 'potencial@exemplo.ao',
      phone: '+244 911 222 333'
    },
    lines: [
      {
        sku: 'PACK001',
        description: 'Pacote de Serviços Completo',
        quantity: 1,
        unitPrice: 1000000,
        discount: 5,
        vatRate: 14,
        total: 1083000
      }
    ],
    totals: {
      subtotal: 1000000,
      discount: 50000,
      vatTotal: 133000,
      total: 1083000,
      vatBreakdown: [
        { rate: 14, base: 950000, amount: 133000 }
      ]
    },
    payment: {
      method: 'bank_transfer',
      status: 'pending',
      dueDate: '2023-06-22'
    },
    status: 'draft',
    createdAt: '2023-05-22T09:15:00Z',
    updatedAt: '2023-05-22T09:15:00Z'
  },
  '4': { 
    id: '4',
    uuid: 'doc-uuid-004',
    series: 'FT',
    sequentialNumber: 3,
    documentType: 'factura',
    issueDate: '2023-05-25',
    taxableDate: '2023-05-25',
    seller: {
      name: 'AGT - Assessoria de Gestão e Tecnologia, Lda',
      tradeName: 'AGT',
      address: 'Rua Principal, 123, Luanda, Angola',
      nif: '5417189144',
      email: 'geral@agt.ao',
      phone: '+244 923 456 789'
    },
    buyer: {
      name: 'Novo Cliente Empresarial, Lda',
      tradeName: 'Novo Cliente Lda',
      address: 'Rua Empresarial, 654, Luanda, Angola',
      nif: '9988776655',
      email: 'novo@cliente.ao',
      phone: '+244 944 555 666'
    },
    lines: [
      {
        sku: 'SERV002',
        description: 'Desenvolvimento de Sistema',
        quantity: 20,
        unitPrice: 75000,
        discount: 0,
        vatRate: 14,
        total: 1710000
      },
      {
        sku: 'SERV003',
        description: 'Suporte Técnico',
        quantity: 12,
        unitPrice: 30000,
        discount: 5,
        vatRate: 14,
        total: 389340
      }
    ],
    totals: {
      subtotal: 1840000,
      discount: 18000,
      vatTotal: 255240,
      total: 2077240,
      vatBreakdown: [
        { rate: 14, base: 1822000, amount: 255080 }
      ]
    },
    payment: {
      method: 'bank_transfer',
      status: 'pending',
      dueDate: '2023-06-25'
    },
    status: 'issued',
    createdAt: '2023-05-25T11:45:00Z',
    updatedAt: '2023-05-25T11:45:00Z'
  }
};

import { SignatureService } from '../services/SignatureService';

// Shared document store - this will be used by all API endpoints
export class DocumentStore {
  private documents: { [key: string]: Document } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('documents.json');
    this.loadDocuments();
  }

  // ADMIN: override seller for a document regardless of status (for migration/normalization)
  overrideSeller(id: string, seller: Document['seller']): Document | null {
    const current = this.documents[id];
    if (!current) return null;
    const updated: Document = { ...current, seller, taxableDate: current.taxableDate, issueDate: current.issueDate };
    this.documents[id] = updated;
    this.saveDocuments();
    return updated;
  }

  // Load documents from file or initialize with mock data
  public loadDocuments(): void {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load from file if exists
      if (fs.existsSync(this.dataFilePath)) {
        try {
          const fileContent = fs.readFileSync(this.dataFilePath, 'utf-8');
          // Check for empty file
          if (!fileContent.trim()) {
            this.documents = {};
            this.nextId = 1;
            return;
          }
          
          const data = JSON.parse(fileContent);
          this.documents = data.documents || {};
          this.nextId = data.nextId || 1;
        } catch (parseError) {
          console.error('[DocumentStore] Error parsing documents.json:', parseError);
          // Backup corrupted file
          const corruptedPath = `${this.dataFilePath}.corrupted.${new Date().toISOString().replace(/:/g, '-')}`;
          try {
            fs.copyFileSync(this.dataFilePath, corruptedPath);
            console.log(`[DocumentStore] Backed up corrupted file to: ${corruptedPath}`);
          } catch (backupError) {
            console.error('[DocumentStore] Failed to backup corrupted file:', backupError);
          }
          
          // Initialize empty but DO NOT save immediately to avoid overwriting if it was a transient read error
          this.documents = {};
          this.nextId = 1;
        }
      } else {
        // Initialize with empty data
        this.documents = {};
        this.nextId = 1;
        // DO NOT save immediately on init. Only save when data is actually added/modified.
      }
    } catch (error) {
      console.error('[DocumentStore] Critical error loading documents:', error);
      // Fallback to empty data
      this.documents = {};
      this.nextId = 1;
    }
  }

  // Save documents to file safely using atomic write pattern
  private saveDocuments(): void {
    try {
      const data = {
        documents: this.documents,
        nextId: this.nextId,
        lastUpdated: new Date().toISOString()
      };
      
      const tempPath = `${this.dataFilePath}.tmp`;
      const jsonContent = JSON.stringify(data, null, 2);
      
      // Write to temp file first
      fs.writeFileSync(tempPath, jsonContent);
      
      // Rename temp file to actual file (atomic operation on POSIX)
      fs.renameSync(tempPath, this.dataFilePath);
      
    } catch (error) {
      console.error('[DocumentStore] Error saving documents:', error);
    }
  }

  // AGT Compliance: Rounding helper (Round Half Up)
  private round(value: number, decimals: number = 2): number {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  }

  // Get all documents (sorted by most recent first)
  getAllDocuments(): Document[] {
    // Reload documents to ensure latest state from disk
    this.loadDocuments();
    return Object.values(this.documents).sort((a, b) => {
      // Sort by createdAt date, most recent first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  // Get document by ID
  getDocument(id: string): Document | null {
    // Reload documents to ensure latest state from disk
    this.loadDocuments();
    return this.documents[id] || null;
  }

  // Efficiently get next sequence number without fetching all docs
  getNextSequenceNumber(seriesCode: string, year: number): number {
    const docs = Object.values(this.documents);
    const maxSeq = docs
      .filter(d => d.series === seriesCode)
      .filter(d => new Date(d.issueDate).getFullYear() === Number(year))
      .reduce((max, d) => Math.max(max, Number(d.sequentialNumber) || 0), 0);
    return maxSeq + 1;
  }

  // Get paginated documents with optional filtering
  getPaginatedDocuments(page: number = 1, limit: number = 20, filters?: { 
    type?: string, 
    nif?: string, 
    tradeName?: string, 
    name?: string,
    clientId?: string
  }): { documents: Document[], total: number } {
    let docs = this.getAllDocuments();

    if (filters) {
      const norm = (s: any) => String(s || '').trim().toLowerCase();
      
      if (filters.type && filters.type !== 'all') {
        docs = docs.filter(d => d.documentType === filters.type);
      }
      
      if (filters.clientId) {
        // If clientId provided, filter by exact match on buyer ID (if we stored it) or NIF?
        // Currently we store buyer object. Let's filter by NIF if we can, or just skip if not robust.
        // Actually the current API filters by client ID by fetching ALL and filtering.
        // We need to support the existing API query params.
        // The API currently filters by "active company" fields (nif, name, tradeName)
      }

      if (filters.nif || filters.tradeName || filters.name) {
         docs = docs.filter(d => {
            const s = (d as any).seller || {};
            return (filters.nif && s.nif && norm(s.nif) === norm(filters.nif))
              || (filters.tradeName && s.tradeName && norm(s.tradeName) === norm(filters.tradeName))
              || (filters.name && s.name && norm(s.name) === norm(filters.name));
         });
      }
    }

    // Sort by creation date (newest first)
    docs.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.issueDate).getTime();
      const timeB = new Date(b.createdAt || b.issueDate).getTime();
      return timeB - timeA;
    });

    const total = docs.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    
    return {
      documents: docs.slice(start, end),
      total
    };
  }

  // Helper to validate document content
  private validateDocumentContent(lines: LineItem[], type: string): void {
    if (!lines || lines.length === 0) {
      throw new Error('O documento deve conter pelo menos um produto ou serviço.');
    }

    let totalCheck = 0;
    const isCreditNote = type === 'nota_de_credito' || type === 'NC';

    for (const line of lines) {
      if (!line.description || !line.description.trim()) {
        throw new Error('Todos os itens devem ter uma descrição válida.');
      }
      
      const q = Number(line.quantity);
      const p = Number(line.unitPrice);
      
      if (p < 0) {
        throw new Error(`O item "${line.description}" não pode ter preço unitário negativo.`);
      }

      if (isCreditNote) {
        // For Credit Notes, we expect negative quantities (or at least negative total effect)
        // But usually "quantity" should be non-zero.
        if (q === 0) {
             throw new Error(`O item "${line.description}" deve ter uma quantidade diferente de zero.`);
        }
        // We allow negative quantity for NC
      } else {
        // For other documents, quantity must be positive
        if (q <= 0) {
          throw new Error(`O item "${line.description}" deve ter uma quantidade maior que zero.`);
        }
      }

      const d = Number(line.discount || 0);
      const v = Number(line.vatRate || 0);
      
      const base = q * p;
      
      // Use explicit total if calculated base is zero (handles migrated/manual data)
      const explicitTotal = Number((line as any).total || (line as any).lineTotal || 0);
      
      let val, tax;
      
      if (base === 0 && explicitTotal !== 0) {
          // If we have an explicit total but no unit price/base, assume explicitTotal is the gross value
          // We need to back-calculate val and tax if possible, or just add to totalCheck
          // For simplicity in validation, we just use the explicit total as the contribution
          val = explicitTotal; 
          tax = 0; // We assume total includes tax or we can't easily separate without more logic
          // But wait, totalCheck expects (val + tax). If explicitTotal is gross, that's fine.
      } else {
          val = base - (base * (d / 100));
          tax = val * (v / 100);
      }
      
      totalCheck += (val + tax);
    }

    // Check for zero value document (GT can be zero)
    if (Math.abs(totalCheck) === 0 && type !== 'nota_de_entrega') {
       throw new Error('O documento não pode ter valor total zero.');
    }
    
    if (!isCreditNote && totalCheck < 0) {
        throw new Error('O documento não pode ter valor total negativo (exceto Notas de Crédito).');
    }
  }

  // Create new document
  createDocument(documentData: Partial<Document>): Document {
    // Reload documents to ensure latest state and prevent overwrite
    this.loadDocuments();

    const receiptTypes = ['recibo', 'aviso_cobranca_recibo', 'outros_recibos', 'recibo_estorno'];
    if (receiptTypes.includes(String(documentData.documentType))) {
      const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
      if (lines.length === 0) {
        const paidAmountRaw = (documentData as any)?.payment?.paidAmount ?? (documentData as any)?.totals?.total ?? (documentData as any)?.total ?? 0;
        const paidAmount = Number(paidAmountRaw);
        if (!paidAmount || paidAmount <= 0) {
          throw new Error('O documento deve conter pelo menos um produto ou serviço.');
        }
        documentData.lines = [
          {
            sku: String(documentData.documentType) === 'recibo_estorno' ? 'ESTORNO' : 'PAGAMENTO',
            description: String(documentData.documentType) === 'recibo_estorno' ? 'Estorno' : 'Pagamento',
            quantity: 1,
            unit: 'Un',
            unitPrice: paidAmount,
            discount: 0,
            vatRate: 0,
            total: paidAmount,
            vatExemptionReason: 'M04',
          } as any
        ];
      }
    }

    if (String(documentData.documentType) === 'aviso_cobranca') {
      const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
      if (lines.length === 0) {
        const rel = Array.isArray((documentData as any).relatedDocuments) ? (documentData as any).relatedDocuments : [];
        if (!rel.length) {
          throw new Error('Aviso de cobrança deve referenciar uma Factura/Factura‑Recibo em dívida.');
        }
        const origins = rel
          .map((id: any) => this.getDocument(String(id)))
          .filter(Boolean) as Document[];
        if (!origins.length) {
          throw new Error('Documento de referência não encontrado');
        }
        const outstanding = origins.reduce((sum, d) => {
          const total = Number((d.totals as any)?.total ?? (d.totals as any)?.grandTotal ?? 0);
          const paid = Number((d.payment as any)?.paidAmount ?? 0);
          return sum + Math.max(total - paid, 0);
        }, 0);
        if (outstanding <= 0) {
          throw new Error('O documento de referência não possui valor em dívida.');
        }
        const origin = origins[0];
        documentData.lines = [
          {
            sku: 'SERV-AC',
            description: `Aviso de Cobrança referente ao documento ${origin.series}/${origin.sequentialNumber}`,
            quantity: 1,
            unit: 'Un',
            unitPrice: outstanding,
            discount: 0,
            vatRate: 0,
            vatExemptionReason: 'Operação não sujeita a IVA - Aviso de Cobrança',
            total: outstanding
          } as any
        ];
      }
    }

    // Validate content before creation
    this.validateDocumentContent(
        documentData.lines || [], 
        documentData.documentType || 'factura'
    );

    const newId = this.nextId.toString();
    this.nextId++;

    // Always set issue date to today, unless explicit compliance override is enabled
    let issueDateStr = new Date().toISOString().split('T')[0];
    try {
      const allowOverride = (documentData as any).__complianceAllowIssueDate === true
        || String((documentData as any).__complianceAllowIssueDate || '').toLowerCase() === 'true';
      const provided = String((documentData as any).issueDate || '').trim();
      if (allowOverride && /^\d{4}-\d{2}-\d{2}$/.test(provided)) {
        issueDateStr = provided;
      }
    } catch {}
    // Allow override of createdAt/SystemEntryDate in compliance mode with full ISO-like timestamp
    let createdAtStr = new Date().toISOString();
    try {
      const allowCreatedAt = (documentData as any).__complianceAllowCreatedAt === true
        || String((documentData as any).__complianceAllowCreatedAt || '').toLowerCase() === 'true';
      const providedCreatedAt = String((documentData as any).__complianceCreatedAt || '').trim();
      // Accept YYYY-MM-DDThh:mm:ss format
      if (allowCreatedAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(providedCreatedAt)) {
        createdAtStr = providedCreatedAt;
      }
    } catch {}

    // Calculate totals with AGT rounding rules
    const lines = documentData.lines || [];
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;

    const processedLines = lines.map((line: LineItem) => {
      const qty = Number(line.quantity || 0);
      const unitPrice = Number(line.unitPrice || 0);
      const discountPct = Number((line as any).discount ?? 0);
      const vatRate = Number((line as any).vatRate ?? 0);
      
      // Calculate with full precision then round final line values
      let lineSubtotal = this.round(qty * unitPrice);
      
      // Fallback: Use explicit total if calculated subtotal is zero (handles migrated/manual data)
      const explicitLineTotal = Number((line as any).total || (line as any).lineTotal || 0);
      let lineTotal;
      let lineDiscount;
      let lineVat;
      
      if (lineSubtotal === 0 && explicitLineTotal !== 0) {
          // Assume explicitLineTotal is GROSS (with VAT)
          // We need to reverse calculate net and VAT
          lineTotal = this.round(explicitLineTotal);
          // Assuming VAT is included in total
          const vatFactor = 1 + (vatRate / 100);
          const net = this.round(lineTotal / vatFactor);
          lineVat = this.round(lineTotal - net);
          lineSubtotal = net; // Assuming no discount on this manual entry or it's already net
          lineDiscount = 0;
      } else {
          lineDiscount = this.round(lineSubtotal * (discountPct / 100));
          const lineNetAmount = this.round(lineSubtotal - lineDiscount);
          lineVat = vatRate > 0 ? this.round(lineNetAmount * (vatRate / 100)) : 0;
          lineTotal = this.round(lineNetAmount + lineVat);
      }

      subtotal += lineSubtotal;
      discountTotal += lineDiscount;
      vatTotal += lineVat;

      return {
        ...line,
        discount: discountPct,
        vatRate,
        total: lineTotal
      };
    });

    // Totals are sum of rounded line values
    const total = this.round(subtotal - discountTotal + vatTotal);

    // Default seller from environment, overridden by persistent company settings if available
    let companyDefaults = {
      name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa',
      tradeName: process.env.NEXT_PUBLIC_COMPANY_TRADENAME || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa',
      address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '',
      nif: process.env.NEXT_PUBLIC_COMPANY_NIF || '',
      email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || '',
      phone: process.env.NEXT_PUBLIC_COMPANY_PHONE || ''
    };
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const raw = fs.readFileSync(companyPath, 'utf-8');
        const cfg = raw ? JSON.parse(raw) : {};
        companyDefaults = {
          name: cfg.name || cfg.tradeName || companyDefaults.name,
          tradeName: cfg.tradeName || cfg.name || companyDefaults.tradeName,
          address: cfg.address || companyDefaults.address,
          nif: cfg.nif || companyDefaults.nif,
          email: cfg.email || companyDefaults.email,
          phone: cfg.phone || companyDefaults.phone,
        };
      }
    } catch {}

    // Determine series and next sequential number scoped to active company
    const seriesCode = documentData.series || (
      documentData.documentType === 'factura' ? 'FT' :
      documentData.documentType === 'factura_recibo' ? 'FR' :
      documentData.documentType === 'nota_de_debito' ? 'ND' :
      documentData.documentType === 'orçamento' ? 'OR' :
      documentData.documentType === 'nota_de_entrega' ? 'GR' :
      documentData.documentType === 'nota_de_credito' ? 'NC' :
      documentData.documentType === 'recibo' ? 'RC' :
      documentData.documentType === 'proforma' ? 'PP' :
      documentData.documentType === 'factura_global' ? 'FGL' :
      documentData.documentType === 'factura_generica' ? 'FG' :
      documentData.documentType === 'factura_adiantamento' ? 'FA' :
      documentData.documentType === 'factura_recibo_autofacturacao' ? 'AF' :
      documentData.documentType === 'aviso_cobranca' ? 'AC' :
      documentData.documentType === 'aviso_cobranca_recibo' ? 'AR' :
      documentData.documentType === 'outros_recibos' ? 'RG' :
      documentData.documentType === 'recibo_estorno' ? 'RE' : 'FT'
    );
    const norm = (s: any) => String(s || '').trim().toLowerCase();
    const year = Number(new Date(issueDateStr).getFullYear());
    
    // Use seriesStore to get next number and handle device locking
    let nextSeq = 0;
    if (typeof documentData.sequentialNumber === 'number') {
      nextSeq = documentData.sequentialNumber;
    } else {
      try {
        // Compliance override: allow reconstructing a specific missing number
        const desiredSeqRaw = (documentData as any).__complianceSequentialNumber;
        const desiredSeq = typeof desiredSeqRaw === 'number' ? Number(desiredSeqRaw) : NaN;
        if (!isNaN(desiredSeq) && desiredSeq > 0) {
          const exists = this.getAllDocuments().some(d => String(d.series) === String(seriesCode) && Number(d.sequentialNumber) === desiredSeq && new Date(d.issueDate).getFullYear() === year);
          if (!exists) {
            // If desired seq is ahead of currentNumber, bump the series counter to that number
            const s = seriesStore.getSeries(seriesCode, year);
            if (s && desiredSeq > s.currentNumber) {
              seriesStore.updateSeries(seriesCode, year, { currentNumber: desiredSeq });
            }
            nextSeq = desiredSeq;
          }
        }
        
        if (!nextSeq) {
          nextSeq = seriesStore.assignNextNumber(seriesCode, year);
        }
      } catch (e) {
        // Fallback to manual calculation if series store fails (e.g. series not found)
        // BUT for device locking we strictly want to fail if locked.
        // If the error is about locking, rethrow it.
        if (e instanceof Error && e.message.includes('bloqueada para outro dispositivo')) {
          throw e;
        }
        
        console.warn(`SeriesStore failed for ${seriesCode}/${year}, falling back to manual calc:`, e);
        const maxSeq = this.getAllDocuments()
          .filter(d => {
            const s = (d as any).seller || {};
            return (companyDefaults.nif && s.nif && norm(s.nif) === norm(companyDefaults.nif))
              || (companyDefaults.tradeName && s.tradeName && norm(s.tradeName) === norm(companyDefaults.tradeName))
              || (companyDefaults.name && s.name && norm(s.name) === norm(companyDefaults.name));
          })
          .filter(d => d.series === seriesCode)
          .filter(d => Number(new Date(d.issueDate).getFullYear()) === year)
          .reduce((max: number, d: any) => Math.max(max, Number(d.sequentialNumber) || 0), 0);
        nextSeq = (maxSeq || 0) + 1;
      }
    }

    // Aggregate VAT breakdown per rate using rounded line values
    const breakdownMap = new Map<number, { base: number; amount: number }>();
    for (const ln of processedLines) {
      // Re-calculate line values with same rounding to ensure consistency
      const lineSubtotal = this.round(ln.quantity * ln.unitPrice);
      const lineDiscount = this.round(lineSubtotal * (ln.discount / 100));
      const base = this.round(lineSubtotal - lineDiscount);
      
      // Determine effective VAT rate: use 1% or 2% if company is in Cabinda and rate is standard 14%?
      // Actually, user said "taxas de 1% e 2%". Let's check if we should override.
      let rate = ln.vatRate;
      try {
        const raw = fs.readFileSync(companyJsonPath(), 'utf-8');
        const cfg = JSON.parse(raw);
        if (cfg.isCabinda && rate === 14) {
          // Special Cabinda regime: 14% -> 2% (bens) or 1% (serviços)?
          // For now, let's assume the user selects the rate in UI, but we ensure breakdown is correct.
        }
      } catch {}

      const amount = rate > 0 ? this.round(base * (rate / 100)) : 0;
      
      const entry = breakdownMap.get(rate) || { base: 0, amount: 0 };
      entry.base += base;
      entry.amount += amount;
      breakdownMap.set(rate, entry);
    }
    const computedVatBreakdown = Array.from(breakdownMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rate, v]) => ({ 
        rate, 
        base: this.round(v.base), 
        amount: this.round(v.amount) 
      }));

    const newDocument: Document = {
    id: newId,
    uuid: crypto.randomUUID(),
    series: seriesCode,
    sequentialNumber: nextSeq,
    documentType: documentData.documentType || 'factura',
    issueDate: issueDateStr,
    taxableDate: issueDateStr,
    // Always enforce seller from active company settings
    seller: companyDefaults,
    buyer: documentData.buyer!,
    lines: processedLines,
    headerDiscountAmount: typeof (documentData as any).headerDiscountAmount === 'number'
      ? Number((documentData as any).headerDiscountAmount)
      : (typeof (documentData as any).headerDiscountAmount === 'string'
        ? Number(String((documentData as any).headerDiscountAmount).replace(',', '.'))
        : undefined),
    totals: {
      subtotal,
      discount: discountTotal,
      vatTotal,
      total,
      vatBreakdown: computedVatBreakdown
    },
    payment: {
      method: documentData.payment?.method || 'bank_transfer',
      status: documentData.payment?.status || 'pending',
      dueDate: documentData.payment?.dueDate || new Date(new Date(issueDateStr).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      paidAmount: documentData.payment?.paidAmount,
      paidDate: documentData.payment?.paidDate,
    },
    // Pass-through of debit note metadata for ND documents
    debitNoteReason: (documentData as any).debitNoteReason,
    referenceInvoiceNo: (documentData as any).referenceInvoiceNo,
    referenceInvoiceDate: (documentData as any).referenceInvoiceDate,
    referenceText: (documentData as any).referenceText,
    expenseRepass: (documentData as any).expenseRepass,
    status: 'draft',
    relatedDocuments: (documentData as any).relatedDocuments || [],
      createdAt: createdAtStr,
      updatedAt: createdAtStr
  };

    this.documents[newId] = newDocument;
    this.saveDocuments(); // Save to file after creating
    return newDocument;
  }

  // Update document
  updateDocument(id: string, updateData: Partial<Document>): Document | null {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const document = this.documents[id];
    if (!document) {
      return null;
    }

    // Only allow updates if document is in draft status,
    // except when updating AGT submission metadata
    const keys = Object.keys(updateData || {}).filter(k => (updateData as any)[k] !== undefined);
    const onlyAgtSubmission = keys.length > 0 && keys.every(k => k === 'agtSubmission');
    if (document.status !== 'draft' && !onlyAgtSubmission) {
      throw new Error('Cannot update document that is not in draft status');
    }

    // Recalculate totals if lines are updated
    let updatedDocument = { ...document, ...updateData };

    if (String(updatedDocument.documentType) === 'aviso_cobranca') {
      const lines = Array.isArray(updatedDocument.lines) ? updatedDocument.lines : [];
      if (lines.length === 0) {
        const rel = Array.isArray((updatedDocument as any).relatedDocuments) ? (updatedDocument as any).relatedDocuments : [];
        const origins = rel
          .map((rid: any) => this.getDocument(String(rid)))
          .filter(Boolean) as Document[];
        if (origins.length) {
          const outstanding = origins.reduce((sum, d) => {
            const total = Number((d.totals as any)?.total ?? (d.totals as any)?.grandTotal ?? 0);
            const paid = Number((d.payment as any)?.paidAmount ?? 0);
            return sum + Math.max(total - paid, 0);
          }, 0);
          if (outstanding > 0) {
            const origin = origins[0];
            updatedDocument.lines = [
              {
                sku: 'SERV-AC',
                description: `Aviso de Cobrança referente ao documento ${origin.series}/${origin.sequentialNumber}`,
                quantity: 1,
                unit: 'Un',
                unitPrice: outstanding,
                discount: 0,
                vatRate: 0,
                vatExemptionReason: 'Operação não sujeita a IVA - Aviso de Cobrança',
                total: outstanding
              } as any
            ];
          }
        }
      }
    }

    // Validate content if lines are updated OR if status is changing to issued/paid
    // This ensures no document is finalized without valid content, and prevents saving invalid content updates
    if (updateData.lines || updateData.status === 'issued' || updateData.status === 'paid') {
       this.validateDocumentContent(updatedDocument.lines || [], updatedDocument.documentType);
    }

    // Enforce seller to match active company on every update
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const raw = fs.readFileSync(companyPath, 'utf-8');
        const cfg = raw ? JSON.parse(raw) : {};
        const defaultSeller = {
          name: cfg.name || cfg.tradeName || (process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa'),
          tradeName: cfg.tradeName || cfg.name || (process.env.NEXT_PUBLIC_COMPANY_TRADENAME || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa'),
          address: cfg.address || (process.env.NEXT_PUBLIC_COMPANY_ADDRESS || ''),
          nif: cfg.nif || (process.env.NEXT_PUBLIC_COMPANY_NIF || ''),
          email: cfg.email || (process.env.NEXT_PUBLIC_COMPANY_EMAIL || ''),
          phone: cfg.phone || (process.env.NEXT_PUBLIC_COMPANY_PHONE || ''),
        };
        updatedDocument.seller = defaultSeller as Document['seller'];
      } else {
        // Fallback to environment defaults if company.json not present
        updatedDocument.seller = {
          name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa',
          tradeName: process.env.NEXT_PUBLIC_COMPANY_TRADENAME || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Empresa',
          address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '',
          nif: process.env.NEXT_PUBLIC_COMPANY_NIF || '',
          email: process.env.NEXT_PUBLIC_COMPANY_EMAIL || '',
          phone: process.env.NEXT_PUBLIC_COMPANY_PHONE || '',
        } as Document['seller'];
      }
    } catch {}
    
    if (updateData.lines) {
      const lines = updateData.lines || [];
      let subtotal = 0;
      let discountTotal = 0;
      let vatTotal = 0;

      const processedLines = lines.map((line: LineItem) => {
        const lineSubtotal = this.round(line.quantity * line.unitPrice);
        const lineDiscount = this.round(lineSubtotal * (line.discount / 100));
        const lineNetAmount = this.round(lineSubtotal - lineDiscount);
        const lineVat = line.vatRate > 0 ? this.round(lineNetAmount * (line.vatRate / 100)) : 0;
        const lineTotal = this.round(lineNetAmount + lineVat);

        subtotal += lineSubtotal;
        discountTotal += lineDiscount;
        vatTotal += lineVat;

        return {
          ...line,
          total: lineTotal
        };
      });

      const total = this.round(subtotal - discountTotal + vatTotal);

      // Aggregate VAT breakdown per rate using net base per line
      const breakdownMap = new Map<number, { base: number; amount: number }>();
      for (const ln of processedLines) {
        const lineSubtotal = this.round(ln.quantity * ln.unitPrice);
        const lineDiscount = this.round(lineSubtotal * (ln.discount / 100));
        const base = this.round(lineSubtotal - lineDiscount);
        const amount = ln.vatRate > 0 ? this.round(base * (ln.vatRate / 100)) : 0;
        
        const entry = breakdownMap.get(ln.vatRate) || { base: 0, amount: 0 };
        entry.base += base;
        entry.amount += amount;
        breakdownMap.set(ln.vatRate, entry);
      }
      const computedVatBreakdown = Array.from(breakdownMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([rate, v]) => ({ 
          rate, 
          base: this.round(v.base), 
          amount: this.round(v.amount) 
        }));

      updatedDocument = {
        ...updatedDocument,
        lines: processedLines,
        totals: {
          subtotal,
          discount: discountTotal,
          vatTotal,
          total,
          vatBreakdown: computedVatBreakdown
        }
      };
    }

    // If transitioning to 'issued', generate chained hash
    if (updateData.status === 'issued' && document.status === 'draft') {
      try {
        const sellerNif = updatedDocument.seller?.nif || '';
        const year = new Date(updatedDocument.issueDate).getFullYear();
        const series = updatedDocument.series;

        // Find previous issued in same series and year for this NIF
        const previousIssued = this.getAllDocuments()
          .filter(d => (
            d.seller?.nif === sellerNif &&
            d.series === series &&
            new Date(d.issueDate).getFullYear() === year &&
            (d.status === 'issued' || d.status === 'paid') &&
            d.sequentialNumber < updatedDocument.sequentialNumber
          ))
          .sort((a, b) => b.sequentialNumber - a.sequentialNumber)[0];

        // Use SignatureService for compliant RSA-SHA1 signing
        // If no previous hash (first doc), use empty string as per standard
        const prevHash = previousIssued?.hash || '';

        try {
          const { hash } = SignatureService.signDocument(updatedDocument as any, prevHash);
          
          updatedDocument = {
            ...updatedDocument,
            hash: hash,
            prevHash: prevHash,
            hashAlgorithm: 'RSA-SHA1',
          };
        } catch (error) {
          console.error('AGT Signing failed:', error);
          throw new Error('Failed to sign document: ' + (error as any).message);
        }
      } catch {}
    }

    updatedDocument.updatedAt = new Date().toISOString();
    this.documents[id] = updatedDocument;
    this.saveDocuments(); // Save to file after updating
    return updatedDocument;
  }

  /**
   * Confirm payment for an issued document.
   * Allows updating payment fields and setting status to 'paid' when fully settled.
   */
  confirmPayment(id: string, opts: { paidAmount?: number; paidDate?: string; method?: string; reference?: string }): Document | null {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const document = this.documents[id];
    if (!document) return null;

    // Disallow on cancelled documents
    if (document.status === 'cancelled') {
      throw new Error('Cannot confirm payment for a cancelled document');
    }

    // Only allow confirming payment for issued or draft documents
    if (document.status !== 'issued' && document.status !== 'draft') {
      // If already marked paid, return as is
      if (document.status === 'paid') {
        return document;
      }
      throw new Error('Payment confirmation only allowed for issued or draft documents');
    }

    const totalDue = Number((document.totals as any)?.total ?? (document.totals as any)?.grandTotal ?? 0);
    const prevPaid = document.payment?.paidAmount || 0;
    const outstanding = this.round(Math.max(totalDue - prevPaid, 0));
    const parsedPaidAmount = typeof (opts as any)?.paidAmount === 'number'
      ? Number((opts as any).paidAmount)
      : parseFloat(String((opts as any)?.paidAmount ?? '').replace(',', '.'));
    const incomingAmount = !isNaN(parsedPaidAmount) && parsedPaidAmount >= 0 ? this.round(parsedPaidAmount) : outstanding;
    const amount = incomingAmount; // valor desta transação
    const newPaidAmount = this.round(Math.max(prevPaid + amount, 0));
    const dateStr = opts.paidDate || new Date().toISOString().split('T')[0];

    // Update payment info
    const newPayment = {
      ...document.payment,
      method: opts.method || document.payment.method || 'other',
      paidAmount: newPaidAmount,
      paidDate: dateStr,
      status: newPaidAmount >= totalDue ? 'paid' : 'partial',
      // keep dueDate as-is
    };

    const newStatus = newPaidAmount >= totalDue ? 'paid' : 'issued';

      // Always issue a receipt for the current payment amount and link it
    let issuedReceiptId: string | undefined;
    if (amount > 0) {
      const docNumber = `${document.series} ${(() => { try { const raw = fs.readFileSync(companyJsonPath(), 'utf-8'); const cfg = raw ? JSON.parse(raw) : {}; return (cfg.seriesBase || 'XVE').toUpperCase(); } catch { return 'XVE'; } })()}${new Date(document.issueDate).getFullYear()}/${document.sequentialNumber}`;
      const isTotal = newStatus === 'paid';
      
      const typeMap: Record<string, string> = {
        'factura': 'Factura',
        'factura_recibo': 'Factura-Recibo',
        'recibo': 'Recibo',
        'nota_de_credito': 'Nota de Crédito',
        'nota_de_debito': 'Nota de Débito',
        'nota_de_entrega': 'Nota de Entrega',
        'orçamento': 'Orçamento',
        'proforma': 'Proforma',
        'factura_global': 'Factura Global',
        'factura_generica': 'Factura Genérica',
        'factura_adiantamento': 'Factura de Adiantamento',
        'factura_recibo_autofacturacao': 'Auto-Factura'
      };
      const rawType = String(document.documentType || '').toLowerCase();
      const typeLabel = typeMap[rawType] || 'documento';
      
      const receiptLines: LineItem[] = [{
        sku: 'PAGAMENTO',
        description: `Pagamento ${isTotal ? 'total' : 'parcial'} referente à ${typeLabel} ${docNumber}`,
        quantity: 1,
        unitPrice: amount,
        discount: 0,
        vatRate: 0,
        total: amount,
        vatExemptionReason: 'M04',
      }];

      const receipt = this.createDocument({
        documentType: 'recibo',
        series: 'RC',
        buyer: document.buyer,
        lines: receiptLines,
        // Explicitly set totals to avoid 0 values if calculation fails or is skipped
        totals: {
          subtotal: amount,
          discount: 0,
          vatTotal: 0,
          total: amount,
          vatBreakdown: [{ rate: 0, base: amount, amount: 0 }]
        },
        payment: { method: newPayment.method, status: 'paid', paidAmount: amount, paidDate: dateStr },
        relatedDocuments: [document.id],
      });

      // Mark receipt as paid (recibo representa valores recebidos)
      const updatedReceipt = this.updateDocument(receipt.id, { status: 'paid' });
      issuedReceiptId = updatedReceipt?.id || receipt.id;
    }

    const updated: Document = {
      ...document,
      payment: newPayment,
      status: newStatus,
      relatedDocuments: issuedReceiptId ? [ ...(document.relatedDocuments || []), issuedReceiptId ] : (document.relatedDocuments || []),
      updatedAt: new Date().toISOString(),
    };

    this.documents[id] = updated;
    this.saveDocuments();

    // Cascata inteligente: atualizar notas de entrega relacionadas para refletir estado de pagamento
    try {
      const all = this.getAllDocuments();
      for (const d of all) {
        if (String(d.documentType) === 'nota_de_entrega' && Array.isArray(d.relatedDocuments) && d.relatedDocuments.includes(document.id)) {
          const cascaded: Document = {
            ...d,
            payment: {
              ...(d.payment || {}),
              status: newPayment.status,
              paidAmount: newPaidAmount,
              paidDate: dateStr,
              method: newPayment.method,
            },
            // manter status geral; UI deve ler payment.status
            updatedAt: new Date().toISOString(),
          } as Document;
          this.documents[d.id] = cascaded;
        }
      }
      this.saveDocuments();
    } catch {}
    return updated;
  }

  /**
   * Mark an invoice as settled by a linked Factura-Recibo (FR), without issuing a separate receipt.
   * Updates payment and status, and links the FR ID to the original document.
   */
  settleByFacturaRecibo(id: string, frId: string, opts: { method?: string; paidDate?: string; amount?: number } = {}): Document | null {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const document = this.documents[id];
    if (!document) return null;

    if (document.status === 'cancelled') {
      throw new Error('Cannot settle payment for a cancelled document');
    }

    // Allow settling for issued or draft documents; keep paid as-is
    if (document.status !== 'issued' && document.status !== 'draft') {
      if (document.status === 'paid') {
        // Still link FR for traceability
        const updatedPaid: Document = {
          ...document,
          relatedDocuments: [ ...(document.relatedDocuments || []), frId ],
          updatedAt: new Date().toISOString(),
        };
        this.documents[id] = updatedPaid;
        this.saveDocuments();
        return updatedPaid;
      }
      throw new Error('Settlement only allowed for issued or draft documents');
    }

    const totalDue = document.totals?.total || 0;
    const incomingAmount = typeof opts.amount === 'number' && opts.amount >= 0 ? this.round(opts.amount) : totalDue;
    const prevPaid = document.payment?.paidAmount || 0;
    const newPaidAmount = this.round(Math.max(prevPaid + incomingAmount, 0));
    const dateStr = opts.paidDate || new Date().toISOString().split('T')[0];

    const newPayment = {
      ...document.payment,
      method: opts.method || document.payment.method || 'other',
      paidAmount: newPaidAmount,
      paidDate: dateStr,
      status: newPaidAmount >= totalDue ? 'paid' : 'partial',
    };

    const newStatus = newPaidAmount >= totalDue ? 'paid' : 'issued';

    const updated: Document = {
      ...document,
      payment: newPayment,
      status: newStatus,
      relatedDocuments: [ ...(document.relatedDocuments || []), frId ],
      updatedAt: new Date().toISOString(),
    };

    this.documents[id] = updated;
    this.saveDocuments();
    return updated;
  }

  // Cancel an issued or paid document.
  // Disallow cancelling drafts or already cancelled documents.
  cancelDocument(id: string): Document | null {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const document = this.documents[id];
    if (!document) return null;

    // AGT compliance: credit notes cannot be cancelled
    if (document.documentType === 'nota_de_credito') {
      throw new Error('Não é permitido cancelar nota de crédito segundo AGT');
    }

    if (document.status === 'cancelled') {
      throw new Error('Document is already cancelled');
    }

    if (document.status === 'draft') {
      throw new Error('Cannot cancel document in draft status');
    }

    // Issue a credit note referencing the original document (AGT compliance)
    // Reverse amounts and VAT: negative quantities produce negative bases and VAT
    const docNumber = `${document.series} ${(() => { try { const raw = fs.readFileSync(companyJsonPath(), 'utf-8'); const cfg = raw ? JSON.parse(raw) : {}; return (cfg.seriesBase || 'XVE').toUpperCase(); } catch { return 'XVE'; } })()}${new Date(document.issueDate).getFullYear()}/${document.sequentialNumber}`;
    const creditNoteLines = (document.lines || []).map((ln) => ({
      // Respeitar o código do produto da fatura original (sem prefixo)
      sku: String(ln.sku || ''),
      description: `Nota de crédito referente ${docNumber} — ${ln.description}`,
      quantity: -(ln.quantity || 0),
      unitPrice: ln.unitPrice,
      discount: ln.discount,
      vatRate: ln.vatRate,
      total: -(ln.total || 0),
    }));

    const creditNote = this.createDocument({
      documentType: 'nota_de_credito',
      series: 'NC',
      buyer: document.buyer,
      lines: creditNoteLines,
      payment: { method: 'other', status: 'n/a' },
      relatedDocuments: [document.id],
    });

    // Mark credit note as issued
    const issuedCreditNote = this.updateDocument(creditNote.id, { status: 'issued' });

    const updated: Document = {
      ...document,
      status: 'cancelled',
      cancellation: {
        ...document.cancellation,
        cancelledAt: new Date().toISOString(),
        // reason will be set by API layer when provided
      },
      relatedDocuments: [ ...(document.relatedDocuments || []), (issuedCreditNote?.id || creditNote.id) ],
      updatedAt: new Date().toISOString(),
    };

    // Persist cancelled document
    this.documents[id] = updated;

    // Estorno automático: se cancelar Recibo ou Factura‑Recibo, ajustar pagamento da Factura origem
    try {
      if (document.documentType === 'recibo' || document.documentType === 'factura_recibo') {
        const originId = Array.isArray(document.relatedDocuments) && document.relatedDocuments.length ? String(document.relatedDocuments[0]) : '';
        if (originId && this.documents[originId]) {
          const origin = this.documents[originId];
          const totalDue = Number(origin?.totals?.total || 0);
          const prevPaid = Number(origin?.payment?.paidAmount || 0);
          const reverseAmount = Number(document?.payment?.paidAmount || document?.totals?.total || 0);
          const newPaidAmount = Math.max(prevPaid - Math.max(reverseAmount, 0), 0);
          const newPaymentStatus = newPaidAmount <= 0 ? 'pending' : (newPaidAmount < totalDue ? 'partial' : 'paid');
          const newStatus = newPaidAmount >= totalDue ? 'paid' : 'issued';

          const originUpdated = this.updateDocument(originId, {
            payment: {
              ...(origin.payment || { method: 'other', status: 'pending' }),
              paidAmount: newPaidAmount,
              status: newPaymentStatus,
            },
            status: newStatus,
            // vincular a NC e ao recibo/FR cancelado para trilha
            relatedDocuments: [ ...(origin.relatedDocuments || []), (issuedCreditNote?.id || creditNote.id), updated.id ],
            updatedAt: new Date().toISOString(),
          });

          // guardar em memória se updateDocument não escrever diretamente
          if (originUpdated) {
            this.documents[originId] = originUpdated;
          }
        }
      }
    } catch (e) {
      console.warn('Falha ao estornar pagamento da factura origem após cancelamento:', e);
    }

    this.saveDocuments();
    return updated;
  }

  // Delete document
  deleteDocument(id: string): boolean {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const document = this.documents[id];
    if (!document) {
      return false;
    }

    // AGT compliance: Proformas e Orçamentos não podem ser apagados
    if (document.documentType === 'proforma' || document.documentType === 'orçamento') {
      throw new Error('Não é permitido apagar Proforma ou Orçamento segundo AGT');
    }

    // Only allow deletion if document is in draft status
    if (document.status !== 'draft') {
      throw new Error('Cannot delete document that is not in draft status');
    }

    delete this.documents[id];
    this.saveDocuments(); // Save to file after deleting
    return true;
  }

  // Check if document exists
  documentExists(id: string): boolean {
    return id in this.documents;
  }

  // Wipe all documents but preserve counters (nextId) and SeriesStore state
  wipePreservingCounters(): any {
    // Reload documents to ensure latest state
    this.loadDocuments();

    const docs = Object.values(this.documents);
    const total = docs.length;
    const unsynced: any[] = [];

    docs.forEach(doc => {
      const agt = doc.agtSubmission || {} as any;
      const isSynced = agt.status === 'success';
      
      if (!isSynced) {
        unsynced.push({
          id: doc.id,
          type: doc.documentType,
          series: doc.series,
          number: doc.sequentialNumber,
          status: doc.status,
          agtStatus: agt.status || 'none',
          agtMessage: agt.message || ''
        });
      }
    });

    // Perform wipe
    this.documents = {};
    // nextId is preserved (not reset)
    this.saveDocuments();

    return {
      totalRemoved: total,
      unsyncedCount: unsynced.length,
      unsyncedDetails: unsynced
    };
  }

  // Clear all documents and reset sequential counter
  clearAllDocuments(): void {
    // Reload not strictly necessary if we are wiping everything, but good practice
    this.documents = {};
    this.nextId = 1;
    this.saveDocuments();
  }

  // Update specific document field without full document object (internal use)
  internalUpdate(id: string, updates: Partial<Document>): Document | null {
    const doc = this.documents[id];
    if (!doc) return null;
    const updated = { ...doc, ...updates, updatedAt: new Date().toISOString() };
    this.documents[id] = updated;
    this.saveDocuments();
    return updated;
  }
}

// Export singleton instance
export const documentStore = new DocumentStore();
