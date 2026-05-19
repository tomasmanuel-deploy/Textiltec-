import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { IDocument, DocumentType } from '../models/Document';

export class SignatureService {
  private static privateKeyCache: string | null = null;

  /**
   * Resolve private key path
   */
  private static resolvePrivateKeyPath(): string {
    const envPath = process.env.AGT_PRIVATE_KEY_PATH;
    if (envPath && envPath.trim()) return envPath.trim();
    return path.resolve(process.cwd(), 'data/agt_keys/private.pem');
  }

  /**
   * Load private key
   */
  private static getPrivateKey(): string {
    if (this.privateKeyCache) return this.privateKeyCache;

    try {
      const keyPath = this.resolvePrivateKeyPath();
      if (!fs.existsSync(keyPath)) {
        throw new Error(`Private key not found at ${keyPath}`);
      }
      this.privateKeyCache = fs.readFileSync(keyPath, 'utf8');
      return this.privateKeyCache;
    } catch (error) {
      console.error('Error loading private key:', error);
      throw error;
    }
  }

  /**
   * Rounding helper (Round Half Up)
   */
  private static round(value: number, decimals: number = 2): number {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  }

  /**
   * Format document data for signing according to AGT rules
   * Format: Date;SystemEntryDate;DocNo;GrossTotal;PreviousHash
   */
  public static formatInputData(document: IDocument, prevHash: string): string {
    // 1. Date: YYYY-MM-DD
    const date = new Date(document.issueDate).toISOString().split('T')[0];

    // 2. SystemEntryDate: YYYY-MM-DDTHH:mm:ss
    // Use document.createdAt as the SystemEntryDate to match AgtService logic
    const createdAt = new Date(document.createdAt || document.issueDate);
    const systemEntryDate = createdAt.toISOString().split('.')[0]; 

    // 3. Document Number: "FT S01/1"
    let docType = this.mapDocumentTypeToAgt(document.documentType);
    
    // Handle Self-Billing (AF) mapping for Hash consistency
    const isSelfBilling = (document as any).selfBillingIndicator === 1;
    if (isSelfBilling && (docType === 'FR' || docType === 'FT')) {
      docType = 'AF';
    }

    const series = (document.series || '').trim().toUpperCase() || 'FT';
    const seq = document.sequentialNumber;
    // Match export-xml.ts format: Type Series/Number (no padding, exact series)
    const docNo = `${docType} ${series}/${seq}`;

    // 4. Gross Total: 2 decimal places (e.g. "100.00")
    // Ensure total is rounded correctly using Round Half Up before formatting
    const totalNumber = Number((document as any).totals?.grandTotal ?? (document as any).totals?.total ?? 0);
    const roundedTotal = this.round(Math.abs(totalNumber)); // Always use absolute value for hash (even for NC)
    const total = roundedTotal.toFixed(2);

    // 5. Previous Hash: Base64
    // If no previous hash (first doc), use empty string? Or "0"?
    // AGT spec usually says "Hash of previous document". For the first one, it might vary.
    // Common practice: If first document of series, prevHash is usually empty string or special value.
    // But the `documentStore` logic used a "GENESIS" hash.
    // Let's stick to the passed prevHash.
    
    // Concatenate with ";"
    return `${date};${systemEntryDate};${docNo};${total};${prevHash}`;
  }

  /**
   * Map document type to AGT code
   */
  private static mapDocumentTypeToAgt(type: DocumentType | string): string {
    switch (type) {
      case 'factura': return 'FT';
      case 'factura_recibo': return 'FR';
      case 'nota_de_credito': return 'NC';
      case 'nota_de_debito': return 'ND';
      case 'recibo': return 'RC'; // Standard SAFT-AO is RC
      case 'nota_de_entrega': return 'GR';
      case 'orçamento': return 'OR';
      case 'proforma': return 'PP';
      case 'aviso_cobranca': return 'AC';
      case 'outros_recibos': return 'RG';
      case 'factura_generica': return 'GF';
      case 'factura_global': return 'FG';
      case 'factura_recibo_autofacturacao': return 'AF';
      case 'recibo_estorno': return 'RE';
      case 'factura_adiantamento': return 'FA';
      case 'aviso_cobranca_recibo': return 'AR';
      default: return 'FT';
    }
  }

  /**
   * Sign document
   * @param document The document to sign
   * @param prevHash The hash of the previous document (or ""/Genesis if first)
   */
  public static signDocument(document: IDocument, prevHash: string): { hash: string, hashControl: string } {
    try {
      const privateKey = this.getPrivateKey();
      
      // Construct the input string
      // Note: We need to capture the exact string used for signing to store it or debug
      const inputString = this.formatInputData(document, prevHash);
      
      // Sign using RSA-SHA1 (AGT Standard)
      const signer = crypto.createSign('RSA-SHA1');
      signer.update(inputString);
      signer.end();
      
      const signature = signer.sign(privateKey, 'base64');
      
      return {
        hash: signature,
        hashControl: '1' // Version of algorithm
      };
    } catch (error) {
      console.error('Error signing document:', error);
      // Fallback for dev/test without keys?
      // Better to throw error in production.
      throw error;
    }
  }
}
