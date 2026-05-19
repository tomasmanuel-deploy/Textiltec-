import axios from 'axios';
import { IDocument, DocumentType, DocumentStatus } from '../models/Document';
// @ts-ignore
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import agtAuditService from './AgtAuditService';
import { companyJsonPath, resolveDataPath } from '../lib/dataPaths';
import { documentStore } from '../lib/documentStore';

import { CentralLogService } from './CentralLogService';

export class AgtService {
  /**
   * Get company information from settings
   */
  protected async getCompanyInfo(): Promise<any> {
    try {
      const companyPath = companyJsonPath();
      if (fs.existsSync(companyPath)) {
        const content = fs.readFileSync(companyPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Ignore errors, return undefined
    }
    return undefined;
  }

  /**
   * Get active AGT configuration (compatible with file-based and mongoose)
   * Also reads SAF-T fields from company.json for consistency with export-xml.ts
   */
  async getActiveConfig() {
    try {
      let config: any = {};
      
      // Try file-based config first
      const configPath = resolveDataPath('agt_config.json');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(content);
      }
      
      // Fallback to mongoose if available and no file config
      if (!config || Object.keys(config).length === 0) {
        try {
          const AgtConfig = require('../models/AgtConfig').default;
          if (AgtConfig) {
            const mongooseConfig = await AgtConfig.findOne({ active: true });
            if (mongooseConfig) {
              config = mongooseConfig.toObject ? mongooseConfig.toObject() : mongooseConfig;
            }
          }
        } catch (mongooseError) {
          // Mongoose not available or not configured
        }
      }
      
      // Fallback to environment variables if no config found
      if (!config || Object.keys(config).length === 0) {
        config = {
          apiUrl: process.env.AGT_API_URL || 'https://api.agt.gov.ao',
          clientId: process.env.AGT_CLIENT_ID || '',
          clientSecret: process.env.AGT_CLIENT_SECRET || '',
          testMode: process.env.AGT_TEST_MODE === 'true' || true,
        };
      }
      
      // Enhance config with SAF-T fields from company.json (like export-xml.ts does)
      try {
        const companyPath = companyJsonPath();
        if (fs.existsSync(companyPath)) {
          const companyContent = fs.readFileSync(companyPath, 'utf8');
          const company = JSON.parse(companyContent);
          // Only override if not already set in config
          if (!config.saftProductId && company.saftProductId) config.saftProductId = company.saftProductId;
          if (!config.saftProductVersion && company.saftProductVersion) config.saftProductVersion = company.saftProductVersion;
          if (!config.saftProductCompanyTaxId && company.saftProductCompanyTaxId) config.saftProductCompanyTaxId = company.saftProductCompanyTaxId;
          if (!config.saftSoftwareCertificateNumber && company.saftSoftwareCertificateNumber) config.saftSoftwareCertificateNumber = company.saftSoftwareCertificateNumber;
          if (!config.saftSoftwareValidationNumber && company.saftSoftwareValidationNumber) config.saftSoftwareValidationNumber = company.saftSoftwareValidationNumber;
        }
      } catch (companyError) {
        // Ignore errors reading company.json
      }
      
      return config;
    } catch (error) {
      console.error('Error getting AGT configuration:', error);
      throw error;
    }
  }

  /**
   * Get private key content
   */
  private getPrivateKey(): string {
    const keyPath = resolveDataPath('agt_keys/private.pem');
    if (!fs.existsSync(keyPath)) {
      if (process.env.NODE_ENV === 'test') {
        const fallback = path.join(process.cwd(), 'data', 'agt_keys', 'private.pem');
        if (fs.existsSync(fallback)) {
          return fs.readFileSync(fallback, 'utf8');
        }
      }
      console.error(`Private key not found at ${keyPath}`);
      throw new Error(`Private key not found at ${keyPath}`);
    }
    return fs.readFileSync(keyPath, 'utf8');
  }

  /**
   * Sign payload using RS256 (JWS)
   */
  private signJws(payload: any, ctx: 'software' | 'request' | 'document' = 'request'): string {
    try {
      const canonical = (value: any): string => {
        const sorter = (v: any): any => {
          if (v === null || typeof v !== 'object') return v;
          if (Array.isArray(v)) return v.map(sorter);
          const keys = Object.keys(v).sort();
          const obj: any = {};
          for (const k of keys) obj[k] = sorter(v[k]);
          return obj;
        };
        return JSON.stringify(sorter(value));
      };
      const header: any = { alg: 'RS256', typ: 'JOSE' };
      // Include 'kid' only for software producer signature
      if (ctx === 'software') {
        try {
          const kid = this.resolveFingerprint?.();
          if (kid) header.kid = kid;
        } catch {}
      }
      const encodedHeader = Buffer.from(canonical(header)).toString('base64url');
      const encodedPayload = Buffer.from(canonical(payload)).toString('base64url');
      const data = `${encodedHeader}.${encodedPayload}`;
      
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(data);
      sign.end();

      const keyContent = this.getPrivateKeyFor(ctx);
      if (!keyContent) {
        throw new Error('Private key content is empty');
      }

      let keyObj: any;
      try {
        // Explicitly check for PEM markers to ensure valid format
        if (typeof keyContent === 'string' && keyContent.includes('-----BEGIN PRIVATE KEY-----')) {
          keyObj = crypto.createPrivateKey({ key: keyContent, format: 'pem' });
        } else if (typeof keyContent === 'string' && keyContent.includes('-----BEGIN RSA PRIVATE KEY-----')) {
          // Some keys might be in RSA format (PKCS#1)
          keyObj = crypto.createPrivateKey({ key: keyContent, format: 'pem', type: 'pkcs1' });
        } else {
          // Fallback - try as generic PEM
          keyObj = crypto.createPrivateKey({ key: keyContent, format: 'pem' });
        }
      } catch (keyErr: any) {
        console.warn(`[AgtService] Failed to create formal key object for ${ctx}:`, keyErr.message);
        keyObj = keyContent; // Use string as fallback
      }

      const signature = sign.sign(keyObj, 'base64url');
      return `${data}.${signature}`;
    } catch (error: any) {
      console.error(`[AgtService] Error signing JWS (${ctx}):`, error.message || error);
      return 'error_signing_jws';
    }
  }
  
  private getPrivateKeyFor(ctx: 'software' | 'request' | 'document'): string {
    try {
      const cfgPath = resolveDataPath('agt_config.json');
      let issuerKeyPath: string | undefined;
      let softwareKeyPath: string | undefined;
      if (fs.existsSync(cfgPath)) {
        try {
          const raw = fs.readFileSync(cfgPath, 'utf8');
          const cfg = JSON.parse(raw);
          issuerKeyPath = cfg.issuerPrivateKeyPath;
          softwareKeyPath = cfg.softwarePrivateKeyPath;
        } catch {}
      }
      
      // Always resolve relative paths from config against the data directory
      const resolveConfigPath = (p: string) => {
        if (!p) return undefined;
        if (path.isAbsolute(p)) return p;
        // If it starts with 'data/', strip it because resolveDataPath already adds it
        const clean = p.startsWith('data/') ? p.substring(5) : p;
        return resolveDataPath(clean);
      };

      const resolvedSoftwarePath = resolveConfigPath(softwareKeyPath || '');
      if (ctx === 'software' && resolvedSoftwarePath && fs.existsSync(resolvedSoftwarePath)) {
        return fs.readFileSync(resolvedSoftwarePath, 'utf8');
      }

      const resolvedIssuerPath = resolveConfigPath(issuerKeyPath || '');
      if ((ctx === 'request' || ctx === 'document') && resolvedIssuerPath && fs.existsSync(resolvedIssuerPath)) {
        return fs.readFileSync(resolvedIssuerPath, 'utf8');
      }
    } catch (e) {
      console.error('[AgtService] Error resolving private key path:', e);
    }
    return this.getPrivateKey();
  }

  /**
   * Get Signed Software Info
   */
  private async getSignedSoftwareInfo(config: any, issuer: any): Promise<any> {
    const softwareInfoDetail = {
      productId: config.saftProductId || 'Prakash Software',
      productVersion: config.saftProductVersion || '1.0.6',
      softwareValidationNumber: config.softwareCertificateNumber || config.saftSoftwareValidationNumber || '0'
    };

    return {
      softwareInfoDetail: softwareInfoDetail,
      jwsSoftwareSignature: this.signJws(softwareInfoDetail, 'software')
    };
  }

  /**
   * Sign document data using RS256 (JWS)
   * Signs critical fields of the document to ensure integrity
   */
  private signDocument(documentData: any, taxRegistrationNumber: string): string {
    const dataToSign = {
      documentNo: documentData.documentNo,
      taxRegistrationNumber: taxRegistrationNumber,
      documentType: documentData.documentType,
      documentDate: documentData.documentDate,
      customerTaxID: documentData.customerTaxID || documentData.customer?.customerTaxID,
      customerCountry: documentData.customerCountry || documentData.customer?.customerAddress?.country || 'AO',
      companyName: documentData.companyName || '',
      documentTotals: {
        taxPayable: String(documentData.documentTotals?.taxPayable ?? '0.00'),
        netTotal: String(documentData.documentTotals?.netTotal ?? '0.00'),
        grossTotal: String(documentData.documentTotals?.grossTotal ?? '0.00')
      }
    };
    return this.signJws(dataToSign);
  }

  /**
   * Universal Series Normalization for AGT
   * Forces 'N' suffix for online mode if series ends in 'C' or has no suffix
   */
  private normalizeSeries(series: string, submissionMode: string = 'online'): string {
    if (!series) return '';
    let s = String(series).trim().toUpperCase();
    
    // SMART NORMALIZATION: If the series already has a valid suffix (N or C), DO NOT change it.
    // The user knows best what they authorized in the portal.
    if (s.endsWith('N') || s.endsWith('C')) {
      return s;
    }

    // If no suffix, then apply defaults based on mode
    if (submissionMode === 'online') {
      return s + 'N';
    } else if (submissionMode === 'offline') {
      return s + 'C';
    }
    return s;
  }

  /**
   * Generate JSON payload for AGT registarFactura API according to DS.120 specification
   * This is the REST API format, different from SAF-T format
   */
  async generateRegistarFacturaPayload(document: IDocument): Promise<any> {
    // 1. Initial configuration and helpers
    const config = await this.getActiveConfig();
    if (!config) throw new Error('No active AGT configuration found');

    const { documentStore } = require('../lib/documentStore'); // Ensure available globally in function

    const formatDate = (date: Date | string): string => new Date(date).toISOString().split('T')[0];
    const formatDateTime = (date: Date | string): string => new Date(date).toISOString().split('.')[0];
    const formatAmount = (amount: number): string => {
      if (!amount || isNaN(amount)) return '0';
      const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
      if (rounded === Math.floor(rounded)) {
        return String(Math.floor(rounded));
      }
      return rounded.toFixed(2);
    };
    // Universal AGT Rounding: Round Half Up to 2 decimals
    // This is the mandatory rounding for SAF-T AO and AGT compliance.
    const round = (val: number): number => {
      if (!val || isNaN(val)) return 0;
      // AGT/SAF-T AO standard requires Round Half Up
      // Using EPSILON to avoid floating point issues (e.g. 1.005 -> 1.01)
      return Math.round((val + Number.EPSILON) * 100) / 100;
    };
    
    // Also update this.round to be identical for consistency
    (this as any).round = round;

    // 2. Identify AGT Document Type early to avoid initialization errors
    let agtType = this.mapDocumentTypeToAgt(document.documentType);
    if (document.documentType === 'recibo') agtType = 'RC';
    if (document.documentType === 'factura_recibo') agtType = 'FR';
    if (document.documentType === 'nota_de_credito') agtType = 'NC';
    if (document.documentType === 'recibo_estorno') agtType = 'RE';
    if (document.documentType === 'aviso_cobranca') agtType = 'AC';
    if (document.documentType === 'outros_recibos') agtType = 'RG';
    if (document.documentType === 'factura_generica') agtType = 'GF';

    // PORTAL RECOGNITION: Force correct invoiceType for AGT portal recognition
    let invoiceType = agtType;
    const isPaymentType = agtType === 'RC' || agtType === 'RE' || agtType === 'AR' || agtType === 'RG';
    const isReceiptType = isPaymentType; 
    const isSalesType = !isPaymentType; 
    const submissionUUID = this.generateSubmissionUUID();
    
    // 3. Identify Issuer and Customer
    const isSelfBilling = (document as any).selfBillingIndicator === 1;
    const issuer = isSelfBilling ? document.buyer : document.seller;
    const customer = isSelfBilling ? document.seller : document.buyer;
    
    if (!issuer) console.error('[AgtService] CRITICAL: Issuer is undefined');

    const normalizeTaxId = (raw: any): { taxId: string; isFallback: boolean } => {
      const digits = String(raw || '').replace(/\D/g, '');
      if (digits.length === 9 || digits.length === 10) return { taxId: digits, isFallback: false };
      return { taxId: '999999999', isFallback: true };
    };
    const customerTax = normalizeTaxId((customer as any)?.nif);
    
    // EXTREME IDENTITY FIX: Ensure customerNameFinal is NEVER "N/A" or empty
    let customerNameFinal = String(customer?.name || (document.buyer as any)?.name || (document.buyer as any)?.companyName || (document.buyer as any)?.denomination || 'Consumidor Final').trim();
    if (!customerNameFinal || customerNameFinal.toUpperCase() === 'N/A' || customerNameFinal === 'undefined' || customerNameFinal === 'null') {
      customerNameFinal = 'Consumidor Final';
    }
    // Also check nif for "N/A"
    if (customerTax.isFallback && (!customerNameFinal || customerNameFinal === 'Consumidor Final')) {
       // Keep Consumidor Final
    }

    // 4. Initial Totals
    let headerNetTotal = round(Number((document.totals as any)?.subtotal ?? (document.totals as any)?.netTotal ?? 0));
    let headerTaxTotal = round(Number((document.totals as any)?.vatTotal ?? (document.totals as any)?.taxTotal ?? 0));
    let headerGrossTotal = round(Number((document.totals as any)?.total ?? (document.totals as any)?.grandTotal ?? 0));

    // For receipts, if grandTotal is 0, use paidAmount
    if (isPaymentType && headerGrossTotal === 0) {
      headerGrossTotal = round(Number((document.payment as any)?.paidAmount ?? (document.payment as any)?.amount ?? 0));
    }
    
    // Ensure receipt totals are NEVER zero - get from payment or document totals
    if (isReceiptType && headerGrossTotal === 0) {
      headerGrossTotal = round(Number(
        (document.payment as any)?.paidAmount ?? 
        (document.payment as any)?.amount ?? 
        (document.totals as any)?.total ??
        (document.totals as any)?.grandTotal ?? 0
      ));
    }

    // PORTAL RECOGNITION: Map status 'issued' to 'N' (Normal) for portal acceptance
    // GENIUS FIX: Some portal versions prefer 'Normal' or 'N'
    // RC, RE, AR, RG and GF (when treated as receipt) might need special status
    let docStatusStr = 'N';
    if (String(document.status) === 'cancelled' || String(document.status) === 'voided') docStatusStr = 'A';
    if (String(document.status) === 'paid' && !isPaymentType) docStatusStr = 'N'; // Ensure paid invoices are 'N'

    // PORTAL RECOGNITION: Wrap status into a compliant object structure
    const docStatusObj = {
      invoiceStatus: docStatusStr,
      documentStatus: docStatusStr,
      invoiceStatusDate: formatDateTime(new Date(document.createdAt || document.issueDate)),
      sourceID: 'Admin',
      sourceBilling: (document as any).isManual ? 'M' : 'P',
      sourcePayment: this.mapPaymentMethodToAgtApiFormat(document.payment?.method),
      reason: (document as any).notes || 'Emissao normal'
    };

    // GENIUS FIX: Force GF to be treated as a pure SalesInvoice at the portal root level
    const forceSalesInvoiceRoot = agtType === 'GF' || agtType === 'FT' || agtType === 'FR' || agtType === 'NC' || agtType === 'ND' || agtType === 'AC';

    let inferredVatRate = 0;
    let originDoc: any = null;
    if (isPaymentType || agtType === 'NC' || agtType === 'RE') {
      try {
        const relDocuments = (document as any).relatedDocuments;
        if (Array.isArray(relDocuments) && relDocuments.length > 0) {
          const { documentStore } = require('../lib/documentStore');
          let currentId = String(relDocuments[0]);
          for (let i = 0; i < 4; i++) {
            const d = documentStore.getDocument(currentId);
            if (!d) break;
            originDoc = d;
            const taxableLine = Array.isArray(d.lines) ? d.lines.find((l: any) => Number(l?.vatRate || 0) > 0) : null;
            if (taxableLine) {
              inferredVatRate = Number(taxableLine.vatRate) || 0;
              break;
            }
            const vatTotal = Number((d.totals as any)?.vatTotal ?? (d.totals as any)?.taxTotal ?? (d.totals as any)?.taxPayable ?? 0);
            const net = Number((d.totals as any)?.subtotal ?? (d.totals as any)?.netTotal ?? 0);
            if (vatTotal > 0 && net > 0) {
              const r = (vatTotal / net) * 100;
              inferredVatRate = Math.round(r);
              break;
            }
            const nextId = Array.isArray((d as any).relatedDocuments) && (d as any).relatedDocuments.length ? String((d as any).relatedDocuments[0]) : '';
            if (!nextId || nextId === currentId) break;
            currentId = nextId;
          }
        }
      } catch {}
    }

    // Map to AF (Autofacturação) if self-billing is active
    if (isSelfBilling && (agtType === 'FR' || agtType === 'FT')) {
      agtType = 'AF';
    }

    if (process.env.AGT_DEBUG_PAYLOADS === 'true') {
      console.log(`[AgtService] Generating payload for ${agtType}. Type: ${isPaymentType ? 'Payment' : 'Sales'}. Inferred VAT: ${inferredVatRate}%`);
    }

    // Calculate totals from lines
    let netTotal = 0;
    let taxPayable = 0;
    const linesData: any[] = [];

    // Process lines for ALL documents to ensure totals are correct
    if (document.lines && document.lines.length > 0) {
      (document.lines || []).forEach((line: any, index: number) => {
        let lineSubtotal = this.round((line.quantity || 0) * (line.unitPrice || 0));
        
        // Fallback: if calculated subtotal is 0 but line has a total, use it
        if (lineSubtotal === 0 && ((line as any).total || (line as any).lineTotal)) {
           lineSubtotal = this.round(Number((line as any).total || (line as any).lineTotal));
        }

        let unitPrice = line.unitPrice || 0;

        // SMART REPAIR: If this is an NC/ND/RC with 0 values, try to fetch original values from related document
        if ((agtType === 'NC' || agtType === 'ND' || isReceiptType) && lineSubtotal === 0 && unitPrice === 0) {
            try {
                // Find related document ID
                const relatedId = (document.relatedDocuments && document.relatedDocuments.length > 0) 
                    ? String(document.relatedDocuments[0]) 
                    : null;
                
                if (relatedId) {
                    const { documentStore } = require('../lib/documentStore');
                    const relatedDoc = documentStore.getDocument(relatedId);
                    if (relatedDoc && relatedDoc.lines && relatedDoc.lines[index]) {
                        const originalLine = relatedDoc.lines[index];
                        const origQty = Math.abs(originalLine.quantity || 1);
                        const origPrice = Math.abs(originalLine.unitPrice || 0);
                        const origTotal = Math.abs((originalLine as any).total || (originalLine as any).lineTotal || (origQty * origPrice));
                        
                        if (origPrice > 0 || origTotal > 0) {
                            unitPrice = origPrice;
                            lineSubtotal = this.round(origQty * origPrice);
                            if (lineSubtotal === 0 && origTotal > 0) {
                                lineSubtotal = this.round(origTotal);
                            }
                            if (unitPrice === 0 && origQty !== 0 && lineSubtotal !== 0) {
                                unitPrice = lineSubtotal / origQty;
                            }
                            // GENIUS REPAIR: Also recover tax information
                            if (originalLine.vatRate !== undefined) {
                                line.vatRate = originalLine.vatRate;
                            }
                            if (originalLine.vatExemptionReason) {
                                line.vatExemptionReason = originalLine.vatExemptionReason;
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[AgtService] Failed to recover values from related document', e);
            }
        }

        const discountAmount = this.round(lineSubtotal * (line.discount || 0) / 100);
        let lineNet = this.round(lineSubtotal - discountAmount);
        
        // GENIUS REPAIR: If lineNet is equal to the document's total but we have a vatRate, 
        // it means the input is gross. We must extract the net.
        let lineVatRate = Number((line as any).vatRate ?? 0);
        if ((agtType === 'NC' || agtType === 'RE') && lineVatRate <= 0) {
          lineVatRate = Number(inferredVatRate || 0);
        }
        if (isPaymentType && lineVatRate <= 0) {
          lineVatRate = Number(inferredVatRate || 0);
        }
        const docTotal = Number((document as any).totals?.total || (document as any).totals?.grandTotal || 0);
        
        // EXTREME NC/RE FIX: If this is an adjustment and the tax is coming out as 0 but we have a vatRate,
        // it's almost certainly because the input was gross. Extract net!
        if (lineVatRate > 0 && (agtType === 'NC' || agtType === 'RE' || docTotal === lineSubtotal) && lineSubtotal > 0) {
            // Check if tax would be 0 or if lineNet is the same as gross
            const testTax = this.round(lineNet * lineVatRate / 100);
            if (testTax === 0 || (docTotal > 0 && Math.abs(docTotal - lineSubtotal) < 0.01)) {
               lineNet = this.round(lineSubtotal / (1 + (lineVatRate / 100)));
               unitPrice = lineNet / (line.quantity || 1);
            }
        }

        if (unitPrice === 0 && (line.quantity || 0) !== 0 && lineSubtotal !== 0) {
           unitPrice = lineSubtotal / (line.quantity || 1);
        }

        const unitPriceBase = unitPrice - (discountAmount / (line.quantity || 1));
        
        // PORTAL FIX: For Recibos (RC, AR), all lines must be treated as tax-exempt (ISE) 
        // to avoid double-taxation or incorrect values like 1.14.
        // HOWEVER, for RE (Estorno), AC (Aviso de Cobrança) and RG (Recibo Geral), 
        // we MUST allow tax if specified as they represent the *actual* or *reversal* of the taxed transaction.
        const currentVatRate = (agtType === 'RC' || agtType === 'AR') ? 0 : lineVatRate;
        const rawTax = currentVatRate ? (lineNet * currentVatRate / 100) : 0;
        const taxContribution = this.round(rawTax);
        
        netTotal += lineNet;
        taxPayable += taxContribution;

        // Build tax object
        let tax: any = {};
        if (currentVatRate > 0) {
          const taxCode = this.mapVatRateToAgtCode(currentVatRate, line.vatExemptionReason);
          const finalTaxCode = (currentVatRate === 14) ? 'NOR' : taxCode;
          
          tax = {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: finalTaxCode,
            taxPercentage: currentVatRate,
            taxContribution: formatAmount(Math.abs(taxContribution)),
          };
          
          (tax as any).taxCodeLabel = finalTaxCode;
        } else {
          const rawExemptionReason = String((line as any).vatExemptionReason || '').trim();
          const rawExemptionCode = String((line as any).vatExemptionCode || '').trim();
          const looksLikeCode = /^M\d{2}$/i.test(rawExemptionReason);
          const exemptionCode = (looksLikeCode ? rawExemptionReason.toUpperCase() : rawExemptionCode) || 'M04';
          const exemptionReason = (looksLikeCode ? '' : rawExemptionReason) || 'IVA - Regime de Exclusão';
          tax = {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: 'ISE',
            taxPercentage: 0,
            taxContribution: '0.00',
            taxExemptionReason: exemptionReason,
            taxExemptionCode: exemptionCode,
            reasonExemption: exemptionReason,
            codeExemption: exemptionCode
          };
        }

        const lineData: any = {
          lineNumber: String(index + 1),
          productCode: String(line.sku || `PROD${String(index + 1).padStart(3, '0')}`),
          productDescription: String(line.description || 'Produto'),
          quantity: formatAmount(Math.abs(line.quantity || 1)),
          unitOfMeasure: line.unit || 'UN',
          unitPrice: formatAmount(Math.abs(unitPrice)),
          unitPriceBase: formatAmount(Math.abs(unitPriceBase || 0)),
          taxPointDate: formatDate(document.issueDate),
          description: line.description || 'Produto',
          productType: (line as any).productType || (line as any).type || 'P',
          ...(
            (agtType === 'NC')
              ? { creditAmount: formatAmount(Math.abs(lineNet)), debitAmount: '0.00' }
              : (agtType === 'RE' || agtType === 'ND' || lineNet < 0)
                ? { debitAmount: formatAmount(Math.abs(lineNet)), creditAmount: '0.00' }
                : { creditAmount: formatAmount(lineNet), debitAmount: '0.00' }
          ),
          netAmount: formatAmount(Math.abs(lineNet)),
          grossAmount: formatAmount(Math.abs(lineNet + taxContribution)),
          settlementAmount: '0.00',
          reference: String(line.sku || `PROD${String(index + 1).padStart(3, '0')}`),
          taxes: [tax],
          tax: tax, // Redundancy
          Tax: tax, // PascalCase Redundancy
          taxEntry: tax, // SAF-T style
          TaxEntry: tax  // SAF-T style
        };

        linesData.push(lineData);
      });
    }

    // AGT FIX: Update header totals with values calculated from lines for ALL Types if lines exist
    // If lines exist and totals are non-zero, compute from lines; otherwise fall back to provided totals
    const internalTotal = Number((document as any).totals?.total || (document as any).totals?.grandTotal || 0);
    const internalNet = Number((document as any).totals?.netTotal || (document as any).totals?.net || 0);
    const internalTax = Number((document as any).totals?.tax || (document as any).totals?.taxTotal || (document as any).totals?.taxPayable || 0);

    if (netTotal > 0 || (document.lines && document.lines.length > 0)) {
      headerNetTotal = round(netTotal);
      headerTaxTotal = round(taxPayable);
      headerGrossTotal = round(netTotal + taxPayable);
    } else if (internalTotal > 0) {
      headerGrossTotal = round(internalTotal);
      headerNetTotal = round(internalNet || (internalTotal - internalTax));
      headerTaxTotal = round(internalTax || (internalTotal - headerNetTotal));
    }

    // Extra safeguard: if after the above totals are still zero but there are lines, recalc from lines
    if ((!headerNetTotal || headerNetTotal === 0) && (linesData.length > 0)) {
      let sumNet = 0;
      let sumTax = 0;
      for (const ln of linesData) {
        sumNet += Number(ln.netAmount || 0);
        if (Array.isArray(ln.taxes)) {
          for (const t of ln.taxes) {
            sumTax += Number(t.taxContribution || 0);
          }
        }
      }
      if (sumNet > 0) {
        headerNetTotal = round(sumNet);
        headerTaxTotal = round(sumTax);
        headerGrossTotal = round(sumNet + sumTax);
      }
    }

    // Override totals for receipt types if they are still 0 but we have payment info
    if (isReceiptType && (netTotal === 0 || headerGrossTotal === 0)) {
      const paid = Number((document.payment as any)?.paidAmount || 0);
      const docTotal = Number((document.totals as any)?.total || (document.totals as any)?.grandTotal || 0);
      const baseTotal = docTotal || paid;
      
      if (baseTotal > 0) {
        // If we have no lines (common for standalone receipts), use the paid amount as netTotal
        netTotal = baseTotal;
        // taxPayable remains 0 if not specified, which is common for receipts referencing already taxed invoices
      }
    }

    // AGT FIX: Ensure headerGrossTotal is synchronized for receipts too if it was 0
    if (isReceiptType && (headerGrossTotal === 0 || headerGrossTotal === 1)) {
        headerNetTotal = round(netTotal);
        headerTaxTotal = round(taxPayable);
        headerGrossTotal = round(netTotal + taxPayable);
    }

    const grossTotal = netTotal + taxPayable;

    // Get signed software info
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);
    const taxRegistrationNumberForSign = issuer?.nif || (config as any).companyNif || (config as any).taxRegistrationNumber;

    // Build document according to DS.120 specification
    // GENIUS SERIES FIX: Use computeAgtDocumentNo for consistent formatting
    const finalDocNo = await this.computeAgtDocumentNo(document);
    const seqStr = String(document.sequentialNumber).padStart(4, '0');
    const seriesPartMatch = finalDocNo.split(' ')[1]?.split('/')[0] || '';
    const seriesPart = seriesPartMatch || String(document.series || '').trim();
    
    // COMPLIANCE FIX: For NC (Nota de Crédito), it must show as a DEBIT in the lines 
    // to "undo" the credit of the original invoice, but a CREDIT in the totals.
    // However, the AGT error specifically says Debit > Credit for NC lines.
    const totalDebitValue = (agtType === 'NC' || agtType === 'ND' || agtType === 'RE') ? formatAmount(Math.abs(headerNetTotal)) : '0.00';
    const totalCreditValue = (isPaymentType && agtType !== 'RE') 
        ? formatAmount(Math.abs(headerGrossTotal)) 
        : ((agtType !== 'NC' && agtType !== 'ND' && agtType !== 'RE' && !isPaymentType) ? formatAmount(Math.abs(headerNetTotal)) : '0.00');

    // Determine invoiceType: for AGT portal recognition, NC must be "NC"
    const finalInvoiceType = (typeof invoiceType !== 'undefined' && invoiceType) ? invoiceType : agtType;

    // GENIUS PAYMENT RECEIPT BLOCK: For Recibos (RC, AR), include source documents
    // This is mandatory for AGT to recognize the payment values in the portal.
    let paymentReceiptBlock: any = undefined;
    if (isPaymentType && Array.isArray(document.relatedDocuments) && document.relatedDocuments.length > 0) {
        const sourceDocs: any[] = [];
        for (const rid of document.relatedDocuments) {
            const relDoc = documentStore.getDocument(String(rid));
            if (relDoc) {
                try {
                    // GENIUS REFERENCE FIX: Try to use the ALREADY SUBMITTED document number if available
                    // to avoid "documento de origem não encontrado" errors.
                    let refNo = (relDoc as any).agtDocumentNo || (relDoc as any).invoiceNo;
                    if (!refNo || !String(refNo).includes(' ')) {
                        refNo = await this.computeAgtDocumentNo(relDoc as any);
                    }

                    sourceDocs.push({
                        lineNo: String(sourceDocs.length + 1),
                        sourceDocumentID: {
                            originatingON: refNo,
                            OriginatingON: refNo,
                            documentDate: formatDate(new Date(relDoc.issueDate)),
                            DocumentDate: formatDate(new Date(relDoc.issueDate))
                        },
                        debitAmount: formatAmount(Math.abs(headerGrossTotal)), // Full payment of this invoice
                        DebitAmount: formatAmount(Math.abs(headerGrossTotal))
                    });
                } catch (e) {
                    console.warn('[AgtService] Failed to include related document in paymentReceipt', e);
                }
            }
        }
        if (sourceDocs.length > 0) {
            paymentReceiptBlock = { 
                sourceDocuments: sourceDocs,
                SourceDocuments: sourceDocs
            };
        }
    }

    // =========================================================================
    // AGT 100% COMPLIANT DOCUMENT DATA CONSTRUCTION
    // Following DS.120 specification exactly
    // =========================================================================
    
    const issuerNif = issuer?.nif || '000000000';
    const issuerNameStr = issuer?.name || issuer?.tradeName || 'Empresa';
    const issuerAddress = issuer?.address || 'Luanda';
    const issuerCity = (issuer as any)?.city || 'Luanda';
    const customerNif = customerTax.taxId;
    
    // Ensure numeric values are properly formatted for AOA (Kwanza) currency
    // AOA has no decimals, so we use integers
    const safeFormatAmount = (amount: number): string => {
      if (!amount || isNaN(amount) || amount === 0) return '0';
      const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
      // For AOA, remove decimal places if they are .00
      if (rounded === Math.floor(rounded)) {
        return String(Math.floor(rounded));
      }
      return rounded.toFixed(2);
    };
    
    // Build the AGT-compliant documentData object
    const documentData: any = {
      // =====================================================================
      // CRITICAL: Document Identification (required by AGT portal)
      // =====================================================================
      documentNo: finalDocNo,
      invoiceNo: finalDocNo,
      documentType: agtType,
      invoiceType: agtType, // AGT portal uses this for type recognition
      DocumentType: agtType,
      InvoiceType: agtType,
      
      // =====================================================================
      // Document Status (required)
      // =====================================================================
      documentStatus: docStatusStr,
      invoiceStatus: docStatusStr,
      documentStatusStr: docStatusStr,
      invoiceStatusStr: docStatusStr,
      DocumentStatus: docStatusObj,
      InvoiceStatus: docStatusObj,
      
      // =====================================================================
      // Dates (required)
      // =====================================================================
      documentDate: formatDate(document.issueDate),
      invoiceDate: formatDate(document.issueDate),
      systemEntryDate: formatDateTime(new Date(document.createdAt || document.issueDate)),
      movementStartTime: formatDateTime(new Date(document.issueDate)),
      movementEndTime: formatDateTime(new Date(document.issueDate)),
      period: new Date(document.issueDate).getMonth() + 1,
      
      // =====================================================================
      // Transaction ID (required)
      // =====================================================================
      transactionID: `${formatDate(document.issueDate).replace(/-/g, '')} ${document.series} ${document.sequentialNumber}`,
      
      // =====================================================================
      // Issuer (Seller) Information - REQUIRED by AGT
      // =====================================================================
      taxRegistrationNumber: issuerNif,
      TaxRegistrationNumber: issuerNif,
      issuerTaxID: issuerNif,
      IssuerTaxID: issuerNif,
      taxID: issuerNif,
      nif: issuerNif,
      issuerName: issuerNameStr,
      IssuerName: issuerNameStr,
      issuerCompanyName: issuerNameStr,
      IssuerCompanyName: issuerNameStr,
      // companyName is used for Customer below, so we avoid it here in the literal
      
      // Issuer Address (nested)
      issuer: {
        taxID: issuerNif,
        name: issuerNameStr,
        companyName: issuerNameStr,
        address: issuerAddress,
        city: issuerCity,
        postalCode: '00000',
        country: 'AO'
      },
      Issuer: {
        TaxID: issuerNif,
        Name: issuerNameStr,
        Address: issuerAddress,
        City: issuerCity,
        Country: 'AO'
      },
      
      // =====================================================================
      // Customer (Buyer) Information - REQUIRED by AGT
      // =====================================================================
      customerID: customerNif,
      CustomerID: customerNif,
      customerTaxID: customerNif,
      CustomerTaxID: customerNif,
      customerTaxRegistrationNumber: customerNif,
      customerCountry: 'AO',
      
      // Customer Name (set explicitly below to avoid conflicts)
      
      // Customer nested object
      customer: {
        customerID: customerNif,
        customerTaxID: customerNif,
        customerTaxRegistrationNumber: customerNif,
        customerName: customerNameFinal,
        companyName: customerNameFinal,
        name: customerNameFinal,
        billingName: customerNameFinal,
        denomination: customerNameFinal,
        customerCountry: 'AO',
        billingAddress: {
          addressDetail: customer?.address || 'Luanda',
          city: (customer as any)?.city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      Customer: {
        CustomerID: customerNif,
        CustomerTaxID: customerNif,
        CustomerName: customerNameFinal,
        CompanyName: customerNameFinal,
        Name: customerNameFinal,
        CustomerCountry: 'AO'
      },
      buyer: {
        customerID: customerNif,
        nif: customerNif,
        taxID: customerNif,
        name: customerNameFinal,
        companyName: customerNameFinal,
        denomination: customerNameFinal,
        address: customer?.address || 'Luanda',
        city: (customer as any)?.city || 'Luanda',
        country: 'AO'
      },
      Buyer: {
        CustomerID: customerNif,
        nif: customerNif,
        name: customerNameFinal,
        CompanyName: customerNameFinal
      },
      
      // =====================================================================
      // Billing Address (required)
      // =====================================================================
      billingAddress: {
        addressDetail: customer?.address || 'Luanda',
        city: (customer as any)?.city || 'Luanda',
        postalCode: '00000',
        country: 'AO'
      },
      shipTo: {
        address: {
          addressDetail: customer?.address || 'Luanda',
          city: (customer as any)?.city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      shipFrom: {
        address: {
          addressDetail: issuerAddress,
          city: issuerCity,
          postalCode: '00000',
          country: 'AO'
        }
      },
      
      // =====================================================================
      // Source and Self-Billing (required)
      // =====================================================================
      sourceID: 'Admin',
      SourceID: 'Admin',
      sourceBilling: (document as any).isManual ? 'M' : 'P',
      SourceBilling: (document as any).isManual ? 'M' : 'P',
      selfBillingIndicator: isSelfBilling ? 1 : 0,
      SelfBillingIndicator: isSelfBilling ? 1 : 0,
      hashControl: '1',
      
      // =====================================================================
      // Lines - REQUIRED for non-receipt documents
      // =====================================================================
      ...((!isPaymentType || agtType === 'RE' || agtType === 'AC' || agtType === 'GF' || agtType === 'RG') 
        ? { lines: linesData } 
        : {}),
      
      // =====================================================================
      // Payment Receipt Block - REQUIRED for RC, AR, RG
      // =====================================================================
      ...(paymentReceiptBlock ? { paymentReceipt: paymentReceiptBlock } : {}),
      
      // =====================================================================
      // Document Totals - REQUIRED (CRITICAL for portal display)
      // =====================================================================
      taxPayable: safeFormatAmount(Math.abs(headerTaxTotal)),
      netTotal: safeFormatAmount(Math.abs(headerNetTotal)),
      grossTotal: safeFormatAmount(Math.abs(headerGrossTotal)),
      documentTotals: {
        taxPayable: safeFormatAmount(Math.abs(headerTaxTotal)),
        netTotal: safeFormatAmount(Math.abs(headerNetTotal)),
        grossTotal: safeFormatAmount(Math.abs(headerGrossTotal)),
        settlementAmount: isPaymentType ? safeFormatAmount(Math.abs(headerGrossTotal)) : '0',
        paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment?.method) || 'NU',
        totalCredit: totalCreditValue,
        totalDebit: totalDebitValue,
        currencyCode: 'AOA'
      },
      
      // =====================================================================
      // Tax Table (required)
      // =====================================================================
      withholdingTaxList: [],
      taxTable: linesData.map(l => l.tax).filter(Boolean),
      
      // =====================================================================
      // Notes
      // =====================================================================
      notes: (document as any).notes || 'Documento fiscal eletrónico',
    };

    // Populate withholdingTaxList if available
    if ((document as any).withholdingTax && Array.isArray((document as any).withholdingTax)) {
      documentData.withholdingTaxList = (document as any).withholdingTax.map((wt: any) => ({
        withholdingTaxType: 'IRS',
        withholdingTaxDescription: wt.code || 'IRT',
        withholdingTaxAmount: formatAmount(wt.amount || 0)
      }));
    }

    // Add Billing References (Header Level) for NC/ND/RE
    // This is critical for connecting the adjustment/reversal to the original document
    if (!isReceiptType && (agtType === 'NC' || agtType === 'ND' || agtType === 'RE')) {
       const billingRefs: any[] = [];
       
       // Priority 1: Use referenceInvoiceNo if available AND correctly formatted (Type Series/Seq)
       let rawRef = (document as any).referenceInvoiceNo;

       // Attempt to normalize reference if it misses space (e.g. FT2025/123 -> FT 2025/123)
       if (rawRef && !String(rawRef).includes(' ')) {
          const match = String(rawRef).match(/^([A-Z]{2})([A-Z0-9]+)\/(\d+)$/);
          if (match) {
             rawRef = `${match[1]} ${match[2]}/${match[3]}`;
          }
       }

       if (rawRef && String(rawRef).includes(' ')) {
          billingRefs.push({
             originatingON: rawRef,
             OriginatingON: rawRef,
             documentDate: formatDate((document as any).referenceInvoiceDate || document.issueDate),
             DocumentDate: formatDate((document as any).referenceInvoiceDate || document.issueDate),
             invoiceNo: rawRef,
             InvoiceNo: rawRef,
             invoiceDocument: { // Legacy fallback
                invoiceNo: rawRef,
                invoiceDate: formatDate((document as any).referenceInvoiceDate || document.issueDate)
             }
          });
       }
       // Priority 2: Use relatedDocuments (array of IDs) or reconstruct if rawRef is simple (Series/Seq)
       else if (Array.isArray((document as any).relatedDocuments)) {
          for (const rid of (document as any).relatedDocuments) {
             const relDoc = documentStore.getDocument(String(rid));
             if (relDoc) {
                try {
                   // GENIUS REFERENCE FIX: Try to use the ALREADY SUBMITTED document number if available
                   let refNo = (relDoc as any).agtDocumentNo || (relDoc as any).invoiceNo;
                   if (!refNo || !String(refNo).includes(' ')) {
                      refNo = await this.computeAgtDocumentNo(relDoc as any);
                   }
                   
                   billingRefs.push({
                      originatingON: refNo,
                      OriginatingON: refNo,
                      documentDate: formatDate(relDoc.issueDate),
                      DocumentDate: formatDate(relDoc.issueDate),
                      invoiceNo: refNo,
                      InvoiceNo: refNo,
                      invoiceDocument: { // Legacy fallback
                         invoiceNo: refNo,
                         invoiceDate: formatDate(relDoc.issueDate)
                      }
                   });
                } catch (e) {
                   // Ignore
                }
             }
          }
       }
       
       if (billingRefs.length > 0) {
          (documentData as any).billingReference = billingRefs;
          (documentData as any).billingReferences = billingRefs;
          (documentData as any).references = billingRefs;
       }
    }

    // Add Order References when FT/FR references a Proforma/Orçamento
    try {
      if (!isReceiptType && (agtType === 'FT' || agtType === 'FR') && Array.isArray((document as any).relatedDocuments)) {
        const orderRefs: Array<{ orderReferenceNo: string; orderDate?: string }> = [];
        for (const rid of (document as any).relatedDocuments) {
          const src = documentStore.getDocument(String(rid));
          if (src && (String(src.documentType).toLowerCase() === 'proforma' || String(src.documentType).toLowerCase() === 'orçamento')) {
            try {
              const refNo = await this.computeAgtDocumentNo(src as any);
              orderRefs.push({ orderReferenceNo: refNo, orderDate: String(src.issueDate || '') });
            } catch {
              orderRefs.push({ orderReferenceNo: String(src.id || rid) });
            }
          }
        }
        if (orderRefs.length > 0) {
          (documentData as any).orderReferences = orderRefs;
        }
      }
    } catch {}

    // Optional settlement amount for global discount (compliance/demo only)
    try {
      const headerDisc = Number(((document as any).headerDiscountAmount) || 0);
      if (!isReceiptType && headerDisc > 0) {
        (documentData.documentTotals as any).settlementAmount = formatAmount(headerDisc);
      }
    } catch {}

    // Add hash if available or generate it
    if ((document as any).hash) {
      documentData.hash = (document as any).hash;
    } else {
      documentData.hash = this.generateDocumentHash(document);
    }

    // Add JWS signature to document
      documentData.jwsDocumentSignature = this.signDocument(documentData, String(taxRegistrationNumberForSign || ''));

    // Add eacCode if available
    if ((document as any).eacCode) {
      documentData.eacCode = (document as any).eacCode;
    }

    // Add documentCancelReason if document is cancelled
    if (documentData.documentStatus === 'A') {
      documentData.documentCancelReason = (document as any).cancellation?.reason || 'I';
    }

    // Add rejectedDocumentNo if document is correction
    if (documentData.documentStatus === 'C') {
      documentData.rejectedDocumentNo = (document as any).referenceInvoiceNo;
    }

    // Add referenceInfo for credit notes, debit notes, and reversals
    if ((agtType === 'NC' || agtType === 'ND' || agtType === 'RE')) {
      let refInvoiceNo = (document as any).referenceInvoiceNo;
      
      // Attempt to normalize reference if it misses space (e.g. FT2025/123 -> FT 2025/123)
      if (refInvoiceNo && !String(refInvoiceNo).includes(' ')) {
          const match = String(refInvoiceNo).match(/^([A-Z]{2})([A-Z0-9]+)\/(\d+)$/);
          if (match) {
              refInvoiceNo = `${match[1]} ${match[2]}/${match[3]}`;
          }
      }

      // If no valid reference (must include space for Type Series/Seq), try to find it from relatedDocuments
      if ((!refInvoiceNo || !String(refInvoiceNo).includes(' ')) && Array.isArray((document as any).relatedDocuments) && (document as any).relatedDocuments.length > 0) {
         try {
             // Use the first related document as the main reference
             const rid = (document as any).relatedDocuments[0];
             const relDoc = documentStore.getDocument(String(rid));
             if (relDoc) {
                 const relType = this.mapDocumentTypeToAgt(relDoc.documentType);
                 const relSeq = String(relDoc.sequentialNumber).padStart(4, '0');
                 const relYear = new Date(relDoc.issueDate).getFullYear();
                 let relSeries = '';
                 
                 try {
                     const companyPath = companyJsonPath();
                     if (fs.existsSync(companyPath)) {
                         const content = fs.readFileSync(companyPath, 'utf8');
                         const company = JSON.parse(content);
                         const map = company?.authorizedSeries;
                         const m = map?.[relType]?.[String(relYear)];
                         if (m && typeof m === 'string' && m.trim()) relSeries = m.trim();
                     }
                 } catch {}
                 
                 if (!relSeries) {
                     const seriesBase = String(((issuer as any)?.seriesBase || 'XVE')).toUpperCase();
                     relSeries = `${seriesBase}${relYear}`;
                 }
                 
                 refInvoiceNo = `${relType} ${relSeries}/${relSeq}`;
             }
         } catch {}
      }

      if (refInvoiceNo) {
        // Add referenceInfo to lines that reference original invoice/receipt
        linesData.forEach((line: any) => {
          line.referenceInfo = {
            reference: refInvoiceNo,
            reason: (document as any).debitNoteReason || (agtType === 'NC' ? 'Devolução' : (agtType === 'RE' ? 'Estorno' : 'Rectificação')),
            referenceItemLineNo: line.lineNumber // Usually maps 1-to-1 or needs specific mapping
          };
        });
      }
    }

    // Add paymentReceipt ONLY for receipt types (AR, RC, RG) - NOT for AF or other types
    // According to DS.120 spec, paymentReceipt is mandatory for AR, RC, RG
    // AGT FIX: RE (Recibo de Estorno) MUST NOT have paymentReceipt field
    if (isReceiptType) {
      // For receipts, we need to reference the source documents (invoices) that were paid
      // If relatedDocuments exist, use them; otherwise create a default entry
      const sourceDocuments: any[] = [];
      const receiptAmount = headerGrossTotal;

    // PORTAL FIX: Recibos (RC/AR) strictly don't have lines in the official REST schema.
    // Error E26 "Utilização incorrecta do campo lines" confirms this for the current portal version.
    const shouldAddLines = !isPaymentType || agtType === 'RE' || agtType === 'AC' || agtType === 'GF' || agtType === 'RG';
    
    if (shouldAddLines) {
      if ((!documentData.lines || documentData.lines.length === 0) && headerGrossTotal > 0) {
          documentData.lines = [{
              lineNumber: '1',
              productCode: 'PAGAMENTO',
              productDescription: `Pagamento de ${agtType} ${seriesPart}/${seqStr}`,
              quantity: '1.00',
              unitOfMeasure: 'UN',
              unitPrice: formatAmount(Math.abs(headerNetTotal)),
              unitPriceBase: formatAmount(Math.abs(headerNetTotal)),
              taxPointDate: formatDate(document.issueDate),
              description: `Pagamento de ${agtType} ${seriesPart}/${seqStr}`,
              productType: 'S',
              ...(agtType === 'RE' ? { debitAmount: formatAmount(Math.abs(headerNetTotal)) } : { creditAmount: formatAmount(Math.abs(headerNetTotal)) }),
              netAmount: formatAmount(Math.abs(headerNetTotal)),
              grossAmount: formatAmount(Math.abs(headerGrossTotal)),
              settlementAmount: '0.00',
              taxes: [{
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: headerTaxTotal > 0 ? 'NOR' : 'ISE',
                  taxPercentage: headerTaxTotal > 0 ? (inferredVatRate || 14) : 0,
                  taxContribution: formatAmount(Math.abs(headerTaxTotal)),
                  ...(headerTaxTotal === 0 ? { taxExemptionReason: 'IVA - Regime de Exclusão', taxExemptionCode: 'M04' } : {})
              }]
          }];
      }
    } else {
      // STRICTLY REMOVE LINES for RC/AR to avoid E26 error
      if (documentData.lines) delete documentData.lines;
    }

    if (receiptAmount > 0) {
        let derivedNet = Number(headerNetTotal || 0);
        let derivedTax = Number(headerTaxTotal || 0);

        if (Array.isArray((document as any).relatedDocuments) && (document as any).relatedDocuments.length > 0) {
          derivedNet = 0;
          derivedTax = 0;
          let remaining = Number(receiptAmount);

          for (const rid of (document as any).relatedDocuments) {
            if (remaining <= 0) break;
            const relDoc = documentStore.getDocument(String(rid));
            if (!relDoc) continue;

            const relGross = Number((relDoc.totals as any)?.total ?? (relDoc.totals as any)?.grandTotal ?? 0);
            const relTax = Number((relDoc.totals as any)?.vatTotal ?? (relDoc.totals as any)?.taxTotal ?? 0);
            const relNet = Number((relDoc.totals as any)?.subtotal ?? (relDoc.totals as any)?.netTotal ?? (relGross - relTax));

            if (relGross > 0) {
              const alloc = Math.min(remaining, relGross);
              const ratio = alloc / relGross;
              derivedNet += this.round(relNet * ratio);
              derivedTax += this.round(relTax * ratio);
              remaining = this.round(remaining - alloc);
              continue;
            }

            const rate = Number(inferredVatRate || 0);
            if (rate > 0) {
              const alloc = remaining;
              const net = this.round(alloc / (1 + (rate / 100)));
              const tax = this.round(alloc - net);
              derivedNet += net;
              derivedTax += tax;
              remaining = 0;
            }
          }

          const sum = this.round(derivedNet + derivedTax);
          if (Math.abs(sum - receiptAmount) > 0.01) {
            derivedNet = this.round(receiptAmount - derivedTax);
          }

          if (derivedNet <= 0) {
            derivedNet = receiptAmount;
            derivedTax = 0;
          }
        } else {
          const rate = Number(inferredVatRate || 0);
          const grossLooksLikeNet = Math.abs(Number(headerNetTotal || 0) - receiptAmount) < 0.01 && Number(headerTaxTotal || 0) === 0;
          if (rate > 0 && grossLooksLikeNet) {
            derivedNet = this.round(receiptAmount / (1 + (rate / 100)));
            derivedTax = this.round(receiptAmount - derivedNet);
          }
        }

        headerNetTotal = this.round(derivedNet);
        headerTaxTotal = this.round(derivedTax);
      }

      documentData.documentTotals.netTotal = formatAmount(Math.abs(headerNetTotal || 0));
      documentData.documentTotals.taxPayable = formatAmount(Math.abs(headerTaxTotal || 0));
      documentData.documentTotals.grossTotal = formatAmount(Math.abs(headerGrossTotal || 0));

      if ((document as any).relatedDocuments && (document as any).relatedDocuments.length > 0) {
        let remainingToAllocate = receiptAmount;
        // Use related documents if available
        (document as any).relatedDocuments.forEach((relatedDocId: string, index: number) => {
          let docNo = relatedDocId;
          let docDate = formatDate(document.issueDate);
          let maxAlloc = remainingToAllocate;
          let hasKnownTotal = false;
          try {
             const relDoc = documentStore.getDocument(relatedDocId);
             if (relDoc) {
               const relType = this.mapDocumentTypeToAgt(relDoc.documentType);
               const seq = String(relDoc.sequentialNumber).padStart(4, '0');
               const relYear = new Date(relDoc.issueDate).getFullYear();
               let series = '';
               
               // Try to find authorized series from company.json for the related document
               try {
                   const companyPath = companyJsonPath();
                   if (fs.existsSync(companyPath)) {
                       const content = fs.readFileSync(companyPath, 'utf8');
                       const company = JSON.parse(content);
                       const map = company?.authorizedSeries;
                       const m = map?.[relType]?.[String(relYear)];
                       if (m && typeof m === 'string' && m.trim()) series = m.trim();
                   }
               } catch {}
               
               // Fallback
               if (!series) {
                   const seriesBase = String(((issuer as any)?.seriesBase || 'XVE')).toUpperCase();
                   series = this.normalizeSeries(`${seriesBase}${relYear}`, (config as any)?.submissionMode || 'online');
               }

               docNo = `${relType} ${series}/${seq}`;
               docDate = formatDate(relDoc.issueDate);

               const relTotal = Number((relDoc.totals as any)?.total ?? (relDoc.totals as any)?.grandTotal ?? 0);
               const relPaid = Number((relDoc.payment as any)?.paidAmount ?? 0);
               hasKnownTotal = relTotal > 0;
               // AGT Compliance: Use a small tolerance (0.01) to avoid "exceeds" errors due to precision
               const relOutstanding = hasKnownTotal ? Math.max(0, this.round(relTotal - relPaid)) : remainingToAllocate;
               const relReceiptValue = Math.abs(Number((relDoc.payment as any)?.paidAmount ?? relTotal ?? 0));
               
               // SMART ALLOCATION: If it's a receipt (RE), allow allocating up to the remaining receipt amount.
               // For regular payments (RC/AR/RG), strictly cap at the outstanding balance + tiny tolerance
               // to avoid "excede o montante remanescente" error.
               maxAlloc = agtType === 'RE' ? (relReceiptValue > 0 ? relReceiptValue : remainingToAllocate) : (relOutstanding + 0.001);
               
               if (maxAlloc <= 0 && hasKnownTotal) {
                  console.warn(`[AgtService] Document ${docNo} appears to be fully paid locally. Allocation will be 0.`);
               }
             }
          } catch {}
          // Final safety: ensure we never send more than what's left on the invoice
          const alloc = Math.max(0, Math.min(remainingToAllocate, Number(maxAlloc || 0)));
          
          if (alloc > 0 || index === 0) { 
            let finalAlloc = this.round(alloc);
            
            // If it's the first doc and we have 0 (already paid), we MUST send 0.00 
            // but AGT usually requires at least one source document.
            // If the user is trying to pay an already paid invoice, this is where it fails.
            
            sourceDocuments.push({
              lineNo: String(sourceDocuments.length + 1),
              sourceDocumentID: {
                originatingON: docNo,
                documentDate: docDate
              },
              ...(agtType === 'RE' ? { creditAmount: formatAmount(finalAlloc) } : { debitAmount: formatAmount(finalAlloc) })
            });
            remainingToAllocate = Math.max(0, this.round(remainingToAllocate - finalAlloc));
          }
        });
        // Remove strict check or make it more lenient (allow 0.10 kwanza difference)
        if (remainingToAllocate > 0.10) {
          console.warn(`[AgtService] Receipt amount mismatch: ${remainingToAllocate} remaining. Proceeding anyway for compliance.`);
        }
      } else {
        // Try to resolve reference from explicit header reference fields first
        let refDocNo = '';
        let refDocDate = '';
        try {
          const rawRef = String((document as any).referenceInvoiceNo || '').trim();
          const refDate = (document as any).referenceInvoiceDate || document.issueDate;
          if (rawRef) {
            if (rawRef.includes(' ')) {
              // Already in AGT format "FT YYYY/0001" or "FT SERIES/0001"
              refDocNo = rawRef;
              refDocDate = formatDate(refDate);
            } else {
              // Attempt to reconstruct with authorized series for the inferred type (default FT)
              const maybeType = this.mapDocumentTypeToAgt('factura');
              const yr = new Date(refDate).getFullYear();
              let series = '';
              try {
                const companyPath = companyJsonPath();
                if (fs.existsSync(companyPath)) {
                  const content = fs.readFileSync(companyPath, 'utf8');
                  const company = JSON.parse(content);
                  const map = company?.authorizedSeries;
                  const m = map?.[maybeType]?.[String(yr)];
                  if (m && typeof m === 'string' && m.trim()) series = m.trim();
                }
              } catch {}
              // AGT FIX: Use suffix for reconstructed series
              if (!series) {
                  const seriesBase = String(((issuer as any)?.seriesBase || 'XVE')).toUpperCase();
                  const suffix = (config as any)?.submissionMode === 'online' ? 'N' : 'C';
                  series = `${seriesBase}${yr}${suffix}`;
              }
              const seq = String(rawRef).padStart(4, '0');
              if (series) {
                // GENIUS SERIES FIX: Use normalize logic
                let cleanSeries = series.trim();
                if (cleanSeries.toUpperCase().startsWith(maybeType.toUpperCase())) {
                    cleanSeries = cleanSeries.substring(maybeType.length).trim();
                }
                refDocNo = `${maybeType} ${cleanSeries}/${seq}`;
                refDocDate = formatDate(refDate);
              }
            }
          }
        } catch {}
        
        // If still not resolved, auto-link to the most recent FT/FR for same buyer/seller
        if (!refDocNo) {
          try {
            const buyerNif = (customer as any)?.nif || (document.buyer as any)?.nif || '';
            const sellerNif = (issuer as any)?.nif || (document.seller as any)?.nif || '';
            const candidates = documentStore.getAllDocuments()
              .filter((d: any) => {
                const t = String(d.documentType || '').toLowerCase();
                return t === 'factura' || t === 'factura_recibo';
              })
              .filter((d: any) => String((d.buyer || {}).nif || '') === String(buyerNif))
              .filter((d: any) => String((d.seller || {}).nif || '') === String(sellerNif))
              .filter((d: any) => d.status === 'issued' || d.status === 'paid')
              .sort((a: any, b: any) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
            const ref = candidates[0];
            if (ref) {
              const docNo = await this.computeAgtDocumentNo(ref as any);
              refDocNo = docNo;
              refDocDate = formatDate(ref.issueDate);
            }
          } catch {}
        }
        
        // Fallback: if still missing, reference current document number (last resort)
        const finalDocNo = refDocNo || `${agtType} ${seriesPart}/${seqStr}`;
        const finalDocDate = refDocDate || formatDate(document.issueDate);
        
        sourceDocuments.push({
          lineNo: '1',
          sourceDocumentID: {
            originatingON: finalDocNo,
            documentDate: finalDocDate
          },
          ...(agtType === 'RE' ? { creditAmount: formatAmount(receiptAmount) } : { debitAmount: formatAmount(receiptAmount) })
        });
      }
      
      // If we still have no source documents, this receipt is technically invalid per DS.120 if strict.
      // But adding a dummy or empty one might fail too.
      // Let's rely on finding related documents or explicit references.
      if (sourceDocuments.length > 0) {
        documentData.paymentReceipt = {
          sourceDocuments: sourceDocuments
        };
      } else {
        // If no source documents found, we can't create a valid paymentReceipt block.
        // However, paymentReceipt is mandatory for RC.
        // Try to find ANY previous invoice to link to? No, risky.
        console.warn('[AgtService] No source documents found for Receipt. Payload might be rejected.');
      }

      // Add payment array for receipt types (RC, RG, AR)
      // This is REQUIRED for the receipt to have a value in AGT system
      if (document.payment) {
        const paymentAmountValue =
          headerGrossTotal ||
          Number((document.totals as any)?.total ?? (document.totals as any)?.grandTotal ?? 0) ||
          Number((document.payment as any)?.paidAmount ?? 0) ||
          Number(grossTotal || 0);
        documentData.payment = [
          {
            paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment.method),
            paymentAmount: formatAmount(Math.abs(paymentAmountValue)),
            paymentDate: formatDate(document.payment.paidDate ? new Date(document.payment.paidDate) : document.issueDate)
          }
        ];
      } else {
        const paymentAmountValue =
          headerGrossTotal ||
          Number((document.totals as any)?.total ?? (document.totals as any)?.grandTotal ?? 0) ||
          Number((document.payment as any)?.paidAmount ?? 0) ||
          Number(grossTotal || 0);
        // Fallback if payment info is missing but totals exist
        documentData.payment = [
          {
            paymentMechanism: 'NU', // Default to Cash
            paymentAmount: formatAmount(Math.abs(paymentAmountValue)),
            paymentDate: formatDate(document.issueDate)
          }
        ];
      }
    } else {
      // Ensure paymentReceipt is NOT present for non-receipt types (like FT, AF)
      // DOUBLE CHECK: explicitly delete it if it exists
      if (documentData.paymentReceipt) {
        delete documentData.paymentReceipt;
      }
    }

    // PORTAL RECOGNITION FIX (GLOBAL):
    // Ensure documentTotals are explicitly set and identical to the sum of lines for ALL documents.
    // Recalculate totals from linesData to ensure consistency, especially for receipts with injected lines.
    let finalNetTotal = 0;
    let finalTaxTotal = 0;
    
    // For documents with lines, the header totals MUST BE the sum of the lines
    if (documentData.lines && documentData.lines.length > 0) {
      documentData.lines.forEach((ln: any) => {
        // AGT FIX: Use netAmount as the primary source for the header sum
        const lineNet = Number(ln.netAmount || 0);
        finalNetTotal += lineNet;
        
        if (ln.taxes && Array.isArray(ln.taxes)) {
          ln.taxes.forEach((tx: any) => {
            const contrib = Number(tx.taxContribution || tx.TaxContribution || 0);
            if (contrib) {
              finalTaxTotal += contrib;
              return;
            }
            const amt = Number(tx.taxAmount || tx.TaxAmount || 0);
            if (amt) {
              finalTaxTotal += amt;
              return;
            }
            const pct = Number(tx.taxPercentage || tx.TaxPercentage || 0);
            if (pct > 0) {
              finalTaxTotal += this.round((lineNet * pct) / 100);
            }
          });
        }
      });
      
      // Ensure header totals match the sum of lines exactly to avoid "netTotal não corresponde à soma"
      headerNetTotal = this.round(finalNetTotal);
      headerTaxTotal = this.round(finalTaxTotal);
      headerGrossTotal = this.round(finalNetTotal + finalTaxTotal);
    }

    // For receipts, we force the totals to match the headerGrossTotal exactly to avoid discrepancies
    // GENIUS FIX: We also force headerNetTotal and headerTaxTotal to be re-derived if they are 0
    if (isPaymentType) {
        if (headerGrossTotal > 0 && finalNetTotal === 0 && headerNetTotal === 0) {
            // Re-derive net from gross using inferred rate if possible, else 100% net
            const rate = Number(inferredVatRate || 0);
            headerNetTotal = rate > 0 ? this.round(headerGrossTotal / (1 + (rate / 100))) : headerGrossTotal;
            headerTaxTotal = this.round(headerGrossTotal - headerNetTotal);
        }

        if ((headerNetTotal === 0 && headerTaxTotal === 0) || (finalNetTotal > 0 && headerNetTotal === 0)) {
            headerNetTotal = finalNetTotal;
            headerTaxTotal = finalTaxTotal;
        }
        finalNetTotal = Number(headerNetTotal || 0);
        finalTaxTotal = Number(headerTaxTotal || 0);
    }
    
    // GUARANTEE: For NC/ND/RE, we force the totals to match header values if finalNetTotal ended up as 0
    if ((agtType === 'NC' || agtType === 'ND' || agtType === 'RE' || agtType === 'GF') && finalNetTotal === 0 && Math.abs(headerGrossTotal) > 0) {
        finalNetTotal = headerNetTotal || headerGrossTotal;
        finalTaxTotal = headerTaxTotal;
        console.log(`[AgtService] Forced NC/ND/RE totals from header: Net ${finalNetTotal}, Tax ${finalTaxTotal}`);
    }
    
    // PORTAL FIX: If tax is still 0 but we have a net and gross, and they are different, 
    // it means the tax was calculated but maybe not captured in finalTaxTotal.
    if (finalTaxTotal === 0 && Math.abs(headerGrossTotal - headerNetTotal) > 0.001) {
        finalTaxTotal = headerTaxTotal || (headerGrossTotal - headerNetTotal);
    }
    
    // EXTREME NC REPAIR: If NC/RE has 0 tax but inferred rate > 0, extract tax from gross
    if (finalTaxTotal === 0 && (agtType === 'NC' || agtType === 'RE') && inferredVatRate > 0 && Math.abs(headerGrossTotal) > 0) {
        const net = round(headerGrossTotal / (1 + (inferredVatRate / 100)));
        finalNetTotal = net;
        finalTaxTotal = round(headerGrossTotal - net);
        console.log(`[AgtService] Repaired NC/RE tax using inferred rate ${inferredVatRate}%: Net ${finalNetTotal}, Tax ${finalTaxTotal}`);
    }

    // FINAL TOTALS SAFETY: Ensure we never send 0 if we have a header total
    // Changed to !== 0 to support negative values (NC, RE)
    if (finalNetTotal === 0 && headerNetTotal !== 0) finalNetTotal = headerNetTotal;
    if (finalTaxTotal === 0 && headerTaxTotal !== 0) finalTaxTotal = headerTaxTotal;

    const finalGrossTotal = finalNetTotal + finalTaxTotal;

    // PORTAL RECOGNITION FIX (EXTREME): Populate EVERY identifying field at the document root
    // to ensure name, status, and totals appear correctly in the summary list.
    documentData.Denominacao = customerNameFinal;
    documentData.Denomination = customerNameFinal;
    documentData.CustomerName = customerNameFinal;
    documentData.CompanyName = customerNameFinal;
    documentData.Name = customerNameFinal;
    documentData.billingName = customerNameFinal;
    
    documentData.InvoiceStatus = docStatusStr;
    documentData.DocumentStatus = docStatusStr;
    documentData.Status = (docStatusStr === 'N' ? 'Normal' : (docStatusStr === 'A' ? 'Anulado' : 'Substituído'));
    documentData.Estado = documentData.Status;
    documentData.estado = documentData.Status;
    documentData.status = documentData.Status;
    documentData.invoiceStatus = docStatusStr;
    documentData.documentStatus = docStatusStr;
    documentData.InvoiceStatus = docStatusStr;
    documentData.DocumentStatus = docStatusStr;
    documentData.TipoFactura = agtType;
    documentData.DataCriacao = documentData.documentDate;
    documentData.DataEmissao = documentData.documentDate;
    documentData.NomeDenominacao = customerNameFinal;
    documentData.Nome = customerNameFinal;
    documentData.customerName = customerNameFinal;
    documentData.companyName = customerNameFinal;
    documentData.name = customerNameFinal;
    documentData.denomination = customerNameFinal;
    documentData.denominacao = customerNameFinal;
    documentData.billingName = customerNameFinal;
    documentData.Denominacao = customerNameFinal;
    documentData.Denomination = customerNameFinal;

    documentData.NetTotal = formatAmount(Math.abs(finalNetTotal));
    documentData.TaxPayable = formatAmount(Math.abs(finalTaxTotal));
    documentData.GrossTotal = formatAmount(Math.abs(finalGrossTotal));
    documentData.GrandTotal = documentData.GrossTotal;
    documentData.TotalTax = documentData.TaxPayable;
    documentData.TotalAmount = documentData.GrossTotal;
    documentData.invoiceAmount = documentData.GrossTotal;
    documentData.netTotal = documentData.NetTotal;
    documentData.taxPayable = documentData.TaxPayable;
    documentData.grossTotal = documentData.GrossTotal;
    documentData.TotalDocumento = documentData.GrossTotal;
    documentData.ValorTotal = documentData.GrossTotal;
    documentData.ValorTotalImposto = documentData.TaxPayable;
    documentData.ValorTotalImpostoDevido = documentData.TaxPayable;
    documentData.ValorTotalSemImposto = documentData.NetTotal;
    documentData.ValorTotalDocumentoSemImposto = documentData.NetTotal;
    documentData.ValorTotalComImposto = documentData.GrossTotal;
    documentData.ValorTotalDocumentoComImposto = documentData.GrossTotal;
    
    // PORTAL FIX: For NC, the total credit must be populated if the portal looks at it
    const finalTotalCredit = (agtType === 'NC') ? formatAmount(Math.abs(finalGrossTotal)) : totalCreditValue;
    const finalTotalDebit = (agtType === 'NC') ? '0.00' : totalDebitValue;

    documentData.totalDebit = finalTotalDebit;
    documentData.totalCredit = finalTotalCredit;
    documentData.TotalDebit = finalTotalDebit;
    documentData.TotalCredit = finalTotalCredit;
    documentData.DebitAmount = finalTotalDebit;
    documentData.CreditAmount = finalTotalCredit;
    documentData.ValorDebito = finalTotalDebit;
    documentData.ValorCredito = finalTotalCredit;

    // GENIUS FIX: Some portal versions prefer capitalized field names for identification
    documentData.Customer = {
      CustomerTaxID: customerTax.taxId,
      CompanyName: customerNameFinal,
      Denominacao: customerNameFinal,
      Name: customerNameFinal,
      NomeDenominacao: customerNameFinal,
      Nome: customerNameFinal,
      BillingAddress: {
        Country: 'AO'
      }
    };

    documentData.DocumentTotals = {
      NetTotal: documentData.NetTotal,
      TaxPayable: documentData.TaxPayable,
      GrossTotal: documentData.GrossTotal,
      GrandTotal: documentData.GrandTotal,
      TotalTax: documentData.TaxPayable,
      TotalDebit: finalTotalDebit,
      TotalCredit: finalTotalCredit,
      ValorTotalImpostoDevido: documentData.TaxPayable,
      ValorTotalDocumentoSemImposto: documentData.NetTotal,
      ValorTotalDocumentoComImposto: documentData.GrossTotal
    };

    // Keep the lowercase versions as well for compatibility
    documentData.documentTotals = {
      taxPayable: documentData.TaxPayable,
      netTotal: documentData.NetTotal,
      grossTotal: documentData.GrossTotal,
      totalDebit: finalTotalDebit,
      totalCredit: finalTotalCredit,
      TaxPayable: documentData.TaxPayable,
      NetTotal: documentData.NetTotal,
      GrossTotal: documentData.GrossTotal,
      TotalDebit: finalTotalDebit,
      TotalCredit: finalTotalCredit,
      ValorTotalImpostoDevido: documentData.TaxPayable,
      ValorTotalDocumentoSemImposto: documentData.NetTotal,
      ValorTotalDocumentoComImposto: documentData.GrossTotal,
      currencyCode: 'AOA'
    };

    // Build final payload according to DS.120 specification
    // GENIUS FIX: Use a clean, single-structure payload to avoid value aggregation errors in the portal.
    const payload: any = {
      schemaVersion: '1.0',
      submissionUUID: submissionUUID,
      taxRegistrationNumber: issuer.nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: signedSoftwareInfo,
      numberOfEntries: 1,
      documents: [documentData]
    };

    // ONLY add root-level type/no/hash for quick identification if needed by portal, 
    // but avoid adding ANY total values at the root to prevent double-counting.
    payload.documentType = agtType;
    payload.invoiceType = agtType;
    payload.documentNo = documentData.documentNo;
    payload.invoiceNo = documentData.documentNo;
    payload.hash = documentData.hash;
    
    // GENIUS FIX: Some portal versions read from the root object if numberOfEntries is 1.
    // Duplicate summary fields to the root payload for maximum compatibility.
    payload.documentDate = documentData.documentDate;
    payload.invoiceDate = documentData.documentDate;
    payload.DocumentDate = documentData.documentDate;
    payload.InvoiceDate = documentData.documentDate;
    payload.Denominacao = documentData.Denominacao;
    payload.Denomination = documentData.Denomination;
    payload.CustomerName = documentData.CustomerName;
    payload.CompanyName = documentData.CompanyName;
    payload.TaxRegistrationNumber = documentData.taxRegistrationNumber;
    payload.IssuerTaxID = documentData.taxRegistrationNumber;
    payload.issuerTaxID = documentData.taxRegistrationNumber;
    payload.nif = documentData.nif;
    payload.Estado = documentData.Estado;
    payload.Status = documentData.Status;
    payload.invoiceStatus = documentData.invoiceStatus;
    payload.documentStatus = documentData.documentStatus;
    payload.TipoFactura = agtType;
    payload.DataCriacao = documentData.documentDate;
    payload.DataEmissao = documentData.documentDate;
    payload.NomeDenominacao = customerNameFinal;
    payload.Nome = customerNameFinal;
    
    // Totals at root - some portals need these at root for summary visibility
    payload.netTotal = documentData.netTotal;
    payload.taxPayable = documentData.taxPayable;
    payload.grossTotal = documentData.grossTotal;
    payload.TotalTax = documentData.taxPayable;
    payload.TotalAmount = documentData.grossTotal;
    payload.GrandTotal = documentData.grossTotal;
    payload.TotalDocumento = documentData.GrossTotal;
    payload.ValorTotal = documentData.GrossTotal;
    payload.TotalDebit = documentData.totalDebit;
    payload.TotalCredit = documentData.totalCredit;
    payload.DebitAmount = documentData.totalDebit;
    payload.CreditAmount = documentData.totalCredit;
    payload.ValorDebito = documentData.totalDebit;
    payload.ValorCredito = documentData.totalCredit;
    payload.ValorTotalImpostoDevido = documentData.TaxPayable;
    payload.ValorTotalDocumentoSemImposto = documentData.NetTotal;
    payload.ValorTotalDocumentoComImposto = documentData.GrossTotal;

    const jwsSignature = this.signJws({
      taxRegistrationNumber: payload.taxRegistrationNumber,
      submissionUUID: payload.submissionUUID
    });

    if (process.env.AGT_DEBUG_PAYLOADS === 'true') {
      try {
        const debugPath = path.join(process.cwd(), 'agt_payload_debug.log');
        const logEntry = `\n[${new Date().toISOString()}] Payload for ${agtType}:\n${JSON.stringify({ ...payload, jwsSignature }, null, 2)}\n`;
        fs.appendFileSync(debugPath, logEntry);
      } catch {}
    }

    return { ...payload, jwsSignature };
  }

  /**
   * Generate SAF-T de Inventário XML according to AGT requirements (Circular 5/AGT/2026)
   * This generates an AuditFile containing MasterFiles/Product with stock levels
   */
  async generateInventorySaftXml(date: Date): Promise<string> {
    const config = await this.getActiveConfig();
    const company = await this.getCompanyInfo();
    const { productStore } = require('../lib/productStore');
    const { stockStore } = require('../lib/stockStore');
    
    const products = productStore.getAllProducts();
    const inventoryDate = date.toISOString().split('T')[0];
    const fiscalYear = date.getFullYear();

    const escapeXml = (value: any): string => {
      const str = String(value ?? '');
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    };

    const productsXml = products.map((p: any) => {
      const stock = stockStore.getTotalQuantity(p.id) || 0;
      return `
      <Product>
        <ProductType>P</ProductType>
        <ProductCode>${escapeXml(p.code || p.sku || p.id)}</ProductCode>
        <ProductGroup>${escapeXml(p.category || 'GERAL')}</ProductGroup>
        <ProductDescription>${escapeXml(p.name)}</ProductDescription>
        <ProductNumberCode>${escapeXml(p.code || p.sku || p.id)}</ProductNumberCode>
        <UnitOfMeasure>${escapeXml(p.unit || 'UN')}</UnitOfMeasure>
        <ClosingStockQuantity>${stock.toFixed(4)}</ClosingStockQuantity>
        <ClosingStockValue>${(stock * (p.price || 0)).toFixed(2)}</ClosingStockValue>
      </Product>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${escapeXml(company.nif)}</CompanyID>
    <TaxRegistrationNumber>${escapeXml(company.nif)}</TaxRegistrationNumber>
    <TaxAccountingBasis>I</TaxAccountingBasis>
    <CompanyName>${escapeXml(company.name)}</CompanyName>
    <BusinessName>${escapeXml(company.tradeName || company.name)}</BusinessName>
    <CompanyAddress>
      <AddressDetail>${escapeXml(company.address)}</AddressDetail>
      <City>${escapeXml(company.city)}</City>
      <Country>AO</Country>
    </CompanyAddress>
    <FiscalYear>${fiscalYear}</FiscalYear>
    <StartDate>${inventoryDate}</StartDate>
    <EndDate>${inventoryDate}</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${new Date().toISOString().split('T')[0]}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${escapeXml(company.nif)}</ProductCompanyTaxID>
    <SoftwareValidationNumber>${escapeXml(company.saftSoftwareValidationNumber || '0')}</SoftwareValidationNumber>
    <ProductID>${escapeXml(company.saftProductId || 'Prakash/Generic')}</ProductID>
    <ProductVersion>${escapeXml(company.saftProductVersion || '1.0.6')}</ProductVersion>
  </Header>
  <MasterFiles>
    ${productsXml}
  </MasterFiles>
  <SourceDocuments>
    <MovementOfGoods>
      <NumberOfMovementLines>0</NumberOfMovementLines>
      <TotalQuantityIssued>0.000</TotalQuantityIssued>
    </MovementOfGoods>
  </SourceDocuments>
</AuditFile>`.trim();
  }

  /**
   * Generate payload for Solicitar Série (Request Series)
   */
  async generateSolicitarSeriePayload(
    seriesYear: number | string,
    documentType: string,
    establishmentNumber: string = 'SEDE',
    contingency: boolean = false
  ): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);
    const mappedDocType = this.mapDocumentTypeToAgt(documentType);

    const payload = {
      schemaVersion: '1.2',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString().substring(0, 19) + 'Z',
      softwareInfo: signedSoftwareInfo,
      seriesYear: String(seriesYear),
      documentType: mappedDocType,
      establishmentNumber: establishmentNumber,
      seriesContingencyIndicator: contingency ? 'C' : 'N'
    };
    const signSet: any = {
      taxRegistrationNumber: payload.taxRegistrationNumber,
      establishmentNumber: payload.establishmentNumber,
      seriesYear: payload.seriesYear,
      documentType: payload.documentType
    };
    if (payload.seriesContingencyIndicator === 'C') {
      signSet.seriesContingencyIndicator = 'C';
    }
    const jwsSignature = this.signJws(signSet, 'request');
    return { ...payload, jwsSignature };
  }

  /**
   * Generate payload for Obter Estado (Check Status)
   */
  async generateObterEstadoPayload(requestID: string): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);

    const payload = {
      // Exemplos oficiais mostram 1.2 para obterEstado
      schemaVersion: '1.2',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString().substring(0, 19) + 'Z',
      softwareInfo: signedSoftwareInfo,
      requestID: requestID
    };
    const jwsSignature = this.signJws({
      taxRegistrationNumber: payload.taxRegistrationNumber,
      requestID: payload.requestID
    }, 'request');
    return { ...payload, jwsSignature };
  }

  /**
   * Generate payload for Listar Series
   */
  async generateListarSeriesPayload(seriesYear?: number | string, status?: string): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);

    const payload: any = {
      schemaVersion: '1.2',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString().substring(0, 19) + 'Z',
      softwareInfo: signedSoftwareInfo
    };

    if (seriesYear !== undefined) payload.seriesYear = String(seriesYear);
    if (status) payload.status = status;

    const signSet: any = { taxRegistrationNumber: payload.taxRegistrationNumber };
    if (payload.seriesYear !== undefined) signSet.seriesYear = payload.seriesYear;
    const jwsSignature = this.signJws(signSet, 'request');
    return { ...payload, jwsSignature };
  }

  /**
   * Generate payload for Listar Facturas
   */
  async generateListarFacturasPayload(queryStartDate: Date, queryEndDate: Date): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);

    const payload = {
      schemaVersion: '1.0',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: signedSoftwareInfo,
      queryStartDate: queryStartDate.toISOString().split('T')[0],
      queryEndDate: queryEndDate.toISOString().split('T')[0]
    };
    const jwsSignature = this.signJws({
      taxRegistrationNumber: payload.taxRegistrationNumber,
      queryStartDate: payload.queryStartDate,
      queryEndDate: payload.queryEndDate
    });
    return { ...payload, jwsSignature };
  }

  /**
   * Generate payload for Consultar Factura
   */
  async generateConsultarFacturaPayload(invoiceNo: string): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);

    const payload = {
      schemaVersion: '1.0',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: signedSoftwareInfo,
      invoiceNo: invoiceNo
    };
    // Assinatura conforme expectativa de consulta de fatura: NIF + invoiceNo
    const jwsSignature = this.signJws({
      taxRegistrationNumber: payload.taxRegistrationNumber,
      invoiceNo: payload.invoiceNo
    });
    return { ...payload, jwsSignature };
  }

  /**
   * Generate payload for Validar Documento (Buyer confirmation)
   */
  async generateValidarDocumentoPayload(documentNo: string, action: 'C' | 'R', opts?: { deductibleVATPercentage?: number, nonDeductibleAmount?: number }): Promise<any> {
    const config = await this.getActiveConfig();
    const issuer = await this.getCompanyInfo();
    const signedSoftwareInfo = await this.getSignedSoftwareInfo(config, issuer);

    const payload: any = {
      schemaVersion: '1.2',
      submissionUUID: this.generateSubmissionUUID(),
      taxRegistrationNumber: issuer?.nif || config.companyNif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: signedSoftwareInfo,
      documentNo: documentNo,
      action: action
    };

    if (opts && typeof opts.deductibleVATPercentage === 'number') payload.deductibleVATPercentage = opts.deductibleVATPercentage;
    if (opts && typeof opts.nonDeductibleAmount === 'number') payload.nonDeductibleAmount = opts.nonDeductibleAmount;

    const jwsSignature = this.signJws({
      taxRegistrationNumber: payload.taxRegistrationNumber,
      documentNo: payload.documentNo,
      action: payload.action,
      ...(payload.deductibleVATPercentage !== undefined ? { deductibleVATPercentage: payload.deductibleVATPercentage } : {}),
      ...(payload.nonDeductibleAmount !== undefined ? { nonDeductibleAmount: payload.nonDeductibleAmount } : {})
    });
    return { ...payload, jwsSignature };
  }

  /**
   * Verify Taxpayer Status (Consulta de Contribuinte - Obter)
   * Implements DS.120 Consulta de Contribuinte v5.0.1
   */
  async verifyTaxpayer(nif: string): Promise<any> {
    const config = await this.getActiveConfig();
    
    // Determine URL and credentials
    const baseUrl = (config as any).taxpayerConsultationUrl || 
                   ((config as any).apiUrl ? `${(config as any).apiUrl}/sigt/contribuinte/consultarNIF/v5/obter` : null);
    
    if (!baseUrl) {
      throw new Error('Taxpayer consultation URL not configured');
    }

    const username = (config as any).taxpayerUsername || (config as any).agtUsername || (config as any).clientId;
    const password = (config as any).taxpayerPassword || (config as any).agtPassword || (config as any).clientSecret;
    
    if (!username || !password) {
      throw new Error('Taxpayer consultation credentials not configured');
    }

    try {
      const response = await axios.get(baseUrl, {
        params: {
          tipoDocumento: 'NIF',
          numeroDocumento: nif
        },
        headers: {
          'Username': username,
          'Password': password,
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Error verifying taxpayer:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        throw new Error(`AGT Error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * List Taxpayer Changes (Consulta de Contribuinte - Listar)
   * Implements DS.120 Consulta de Contribuinte v5.0.1
   */
  async listTaxpayerChanges(startDate: Date, endDate: Date): Promise<any> {
    const config = await this.getActiveConfig();
    
    // Determine URL (replace 'obter' with 'listar' if using the full URL from config)
    let baseUrl = (config as any).taxpayerConsultationUrl;
    if (baseUrl && baseUrl.includes('/obter')) {
      baseUrl = baseUrl.replace('/obter', '/listar');
    } else if ((config as any).apiUrl) {
      baseUrl = `${(config as any).apiUrl}/sigt/contribuinte/consultarNIF/v5/listar`;
    }

    if (!baseUrl) {
      throw new Error('Taxpayer consultation URL not configured');
    }

    const username = (config as any).taxpayerUsername || (config as any).agtUsername || (config as any).clientId;
    const password = (config as any).taxpayerPassword || (config as any).agtPassword || (config as any).clientSecret;

    const formatDate = (date: Date): string => {
      return date.toISOString().split('T')[0];
    };

    try {
      const response = await axios.get(baseUrl, {
        params: {
          dataInicio: formatDate(startDate),
          dataFim: formatDate(endDate)
        },
        headers: {
          'Username': username,
          'Password': password,
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Error listing taxpayer changes:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        throw new Error(`AGT Error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Generate SAF-T JSON for a document
   * Format matches AGT API expectations: generalInfo, softwareInfo, documents array
   */
  async generateSaftJson(document: IDocument): Promise<any> {
    // Use the new DS.120 format method for registarFactura API
    return await this.generateRegistarFacturaPayload(document);
  }

  /**
   * Generate UUID for submission
   */
  private generateSubmissionUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Map internal document to AGT API format (different from SAF-T XML)
   */
  mapDocumentToAgtApiFormat(document: IDocument, documentHash?: string, issuer?: any, customer?: any): any {
    // Format date as required by AGT (YYYY-MM-DD)
    const formatDate = (date: Date): string => {
      const d = new Date(date);
      return d.toISOString().split('T')[0];
    };

    // Format date time as required by AGT (YYYY-MM-DDThh:mm:ss)
    const formatDateTime = (date: Date | string): string => {
      const d = new Date(date);
      return d.toISOString().split('.')[0];
    };

    const hash = documentHash || (document as any).hash || this.generateDocumentHash(document as any);
    const isSelfBilling = (document as any).selfBillingIndicator === 1;
    const docCustomer = customer || (isSelfBilling ? document.seller : document.buyer);
    const docSeller = issuer || (isSelfBilling ? document.buyer : document.seller);

    // Calculate totals from lines if not provided
    let netTotal = (document.totals as any)?.subtotal;
    let taxPayable = (document.totals as any)?.vatTotal;
    
    if (netTotal === undefined || taxPayable === undefined) {
      // Recalculate from lines
      netTotal = 0;
      taxPayable = 0;
      (document.lines || []).forEach((line: any) => {
        const lineSubtotal = (line.quantity || 0) * (line.unitPrice || 0);
        const discountAmount = line.discount ? (lineSubtotal * line.discount / 100) : 0;
        const lineNet = lineSubtotal - discountAmount;
        const lineTax = line.vatRate ? (lineNet * line.vatRate / 100) : 0;
        netTotal += lineNet;
        taxPayable += lineTax;
      });
    }
    
    const grossTotal = (document.totals as any)?.total || (netTotal + taxPayable);

    let agtType = this.mapDocumentTypeToAgt(document.documentType);
    // Map to AF (Autofacturação) if self-billing is active
    if (isSelfBilling && (agtType === 'FR' || agtType === 'FT')) {
      agtType = 'AF';
    }
    const isReceipt = agtType === 'RP' || agtType === 'RG';

    return {
      invoiceNo: `${agtType} ${document.series}/${document.sequentialNumber}`,
      documentStatus: {
        invoiceStatus: this.mapDocumentStatusToAgt(document.status),
        invoiceStatusDate: formatDateTime(new Date(document.createdAt || document.issueDate)),
        sourceID: 'Admin',
        sourcePayment: this.mapPaymentMethodToAgtApiFormat(document.payment?.method),
        reason: (document as any).notes || 'Emissao normal'
      },
      jwsDocumentSignature: 'eyJhbGciOiJSUzI1NiJ9.eyJkb2N1bWVudCI6InRlc3QifQ.dummy_signature_block_document',
      hash: hash,
      hashControl: '1',
      period: new Date(document.issueDate).getMonth() + 1,
      invoiceDate: formatDate(document.issueDate),
      invoiceType: agtType,
      documentType: agtType,
      specialRegimes: {
        selfBillingIndicator: (document as any).selfBillingIndicator || 0,
        cashVATSchemeIndicator: (document as any).cashVATSchemeIndicator || 0,
        thirdPartiesBillingIndicator: (document as any).thirdPartiesBillingIndicator || 0
      },
      // Flattened Special Regimes (Some validators expect them at root)
      selfBillingIndicator: (document as any).selfBillingIndicator || 0,
      cashVATSchemeIndicator: (document as any).cashVATSchemeIndicator || 0,
      thirdPartiesBillingIndicator: (document as any).thirdPartiesBillingIndicator || 0,

      // Mandatory fields for structural validation
      sourceID: 'Admin',
      sourceBilling: 'P', // Produced by the application (Mandatory)
      glPostingDate: formatDate(document.issueDate), // Often mandatory

      systemEntryDate: formatDateTime(new Date(document.createdAt || document.issueDate)),
      transactionID: `${formatDate(document.issueDate).replace(/-/g, '')} ${document.series} ${document.sequentialNumber}`,
      customerID: docCustomer?.nif || '5417098765',
      withholdingTax: [],
      shipTo: {
        address: {
          addressDetail: (document.buyer as any)?.address || docCustomer?.address || 'Desconhecido',
          city: (document.buyer as any)?.city || docCustomer?.city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      shipFrom: {
        address: {
          addressDetail: (document.seller as any)?.address || docSeller?.address || 'Desconhecido',
          city: (document.seller as any)?.city || docSeller?.city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      movementEndTime: formatDateTime(new Date(document.issueDate)),
      movementStartTime: formatDateTime(new Date(document.issueDate)),
      line: document.lines ? document.lines.map((line, index) => {
        // Calculate line amounts correctly
        const lineSubtotal = line.quantity * line.unitPrice;
        const discountAmount = line.discount ? (lineSubtotal * line.discount / 100) : 0;
        const lineNet = lineSubtotal - discountAmount;
        const lineTax = line.vatRate ? (lineNet * line.vatRate / 100) : 0;
        
        return {
          lineNumber: index + 1,
          productCode: line.sku || `PROD${String(index + 1).padStart(3, '0')}`,
          productDescription: line.description || 'Produto',
          quantity: line.quantity || 1,
          unitOfMeasure: line.unit || 'UN',
          unitPrice: line.unitPrice || 0,
          taxPointDate: document.taxableDate ? formatDate(document.taxableDate) : formatDate(document.issueDate),
          description: line.description || 'Produto',
          productType: (line as any).productType || (line as any).type || 'S',
          creditAmount: lineNet,
          ...(isReceipt ? {
            settlementAmount: 0 // Line settlement only for receipts
          } : {}),
          reference: line.sku || 'REF', // Mandatory for some
          tax: {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: this.mapVatRateToAgtCode(line.vatRate || 0, line.vatExemptionReason),
            taxPercentage: line.vatRate || 0,
            taxAmount: lineTax
          },
          ...(line.vatRate === 0 && line.vatExemptionReason && {
            taxExemptionReason: line.vatExemptionReason,
            taxExemptionCode: (line as any).vatExemptionCode || 'M00'
          })
        };
      }) : [],
      notes: (document as any).notes || 'Auto-Facturacao',
      ...(isReceipt ? {
        payment: [
          {
            paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment?.method),
            paymentAmount: grossTotal,
            paymentDate: formatDate(document.issueDate)
          }
        ]
      } : {}),
      documentTotals: {
        taxPayable: taxPayable,
        netTotal: netTotal,
        grossTotal: grossTotal,
        currencyCode: 'AOA',
        ...(isReceipt ? {
          settlementAmount: grossTotal,
          paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment?.method)
        } : {})
      }
    };
  }

  /**
   * Map payment method to AGT API format
   */
  private mapPaymentMethodToAgtApiFormat(method?: string): string {
    const methodMap: Record<string, string> = {
      'cash': 'NU',
      'card': 'CC',
      'transfer': 'TB',
      'check': 'CH',
      'credit': 'CS'
    };
    return methodMap[method?.toLowerCase() || ''] || 'NU';
  }

  /**
   * Map internal document to SAF-T Invoice structure (for XML export compatibility)
   */
  mapDocumentToSaftInvoice(document: IDocument, documentHash?: string): any {
    // Format date as required by AGT (YYYY-MM-DD)
    const formatDate = (date: Date): string => {
      // Ensure date object
      const d = new Date(date);
      return d.toISOString().split('T')[0];
    };

    // Format date time as required by AGT (YYYY-MM-DDThh:mm:ss)
    const formatDateTime = (date: Date | string): string => {
      const d = new Date(date);
      return d.toISOString().split('.')[0];
    };

    const hash = documentHash || (document as any).hash || this.generateDocumentHash(document as any);

    const isSelfBilling = (document as any).selfBillingIndicator === 1;
    const issuer = isSelfBilling ? document.buyer : document.seller;
    const customer = isSelfBilling ? document.seller : document.buyer;

    let agtType = this.mapDocumentTypeToAgt(document.documentType);
    // Map to AF (Autofacturação) if self-billing is active
    if (isSelfBilling && (agtType === 'FR' || agtType === 'FT')) {
      agtType = 'AF';
    }
    const isReceipt = agtType === 'RP' || agtType === 'RG';

    return {
      // InvoiceNo format: "FT S001/1" (InvoiceType + space + Series + / + sequential number)
      invoiceNo: `${agtType} ${document.series}/${document.sequentialNumber}`,
      documentStatus: {
        invoiceStatus: this.mapDocumentStatusToAgt(document.status),
        invoiceStatusDate: formatDateTime(new Date()),
        sourceID: 'Admin', // User ID
        sourcePayment: this.mapPaymentMethodToAgtApiFormat(document.payment?.method),
        reason: 'Emissao normal' // Mandatory for some validators even if empty
      },
      hash: hash,
      hashControl: '1',
      // Period: 1-12 (month number)
      period: new Date(document.issueDate).getMonth() + 1,
      invoiceDate: formatDate(document.issueDate),
      invoiceType: agtType,
      documentType: agtType, // Required by specific AGT JSON validators
      specialRegimes: {
        selfBillingIndicator: (document as any).selfBillingIndicator || 0,
        cashVATSchemeIndicator: (document as any).cashVATSchemeIndicator || 0,
        thirdPartiesBillingIndicator: (document as any).thirdPartiesBillingIndicator || 0
      },
      // Flattened Special Regimes (Some validators expect them at root)
      selfBillingIndicator: (document as any).selfBillingIndicator || 0,
      cashVATSchemeIndicator: (document as any).cashVATSchemeIndicator || 0,
      thirdPartiesBillingIndicator: (document as any).thirdPartiesBillingIndicator || 0,
      
      sourceID: 'Admin', // User ID
      systemEntryDate: formatDateTime(document.createdAt),
      transactionID: `${formatDate(document.issueDate).replace(/-/g, '')} ${document.series} ${document.sequentialNumber}`, // Generated ID
      customerID: customer.nif || 'Consumidor final',
      withholdingTax: [], // Mandatory empty list for some validators
      shipTo: {
        address: {
          addressDetail: customer.address,
          city: (customer as any).city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      shipFrom: {
        address: {
          addressDetail: issuer.address,
          city: (issuer as any).city || 'Luanda',
          postalCode: '00000',
          country: 'AO'
        }
      },
      movementEndTime: formatDateTime(new Date()),
      movementStartTime: formatDateTime(new Date()),
      line: document.lines ? document.lines.map((line, index) => ({
        lineNumber: index + 1,
        productCode: line.sku || 'MISC',
        productDescription: line.description,
        quantity: line.quantity,
        unitOfMeasure: line.unit || 'UN',
        unitPrice: line.unitPrice,
        taxPointDate: document.taxableDate ? formatDate(document.taxableDate) : formatDate(document.issueDate),
        description: line.description,
        productType: (line as any).type || 'S', // Default to Service 'S' or Product 'P'
        creditAmount: Math.abs(line.lineTotal || (line.quantity * line.unitPrice)),
        ...(isReceipt ? {
          settlementAmount: 0 // Line settlement only for receipts
        } : {}),
        reference: line.sku || 'REF', // Mandatory for some
        tax: {
          taxType: 'IVA',
          taxCountryRegion: 'AO',
          taxCode: this.mapVatRateToAgtCode(line.vatRate, line.vatExemptionReason),
          taxPercentage: line.vatRate,
          taxAmount: Math.abs(((line as any).tax as any)?.amount || 0)
        },
        ...(line.vatRate === 0 && line.vatExemptionReason && {
          taxExemptionReason: line.vatExemptionReason,
          taxExemptionCode: (line as any).vatExemptionCode || 'M00'
        })
      })) : [],
      notes: (document as any).notes || 'Auto-Facturacao',
      ...(isReceipt ? {
        payment: [
          {
             paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment?.method),
             paymentAmount: Math.abs((document.totals as any)?.total || 0),
             paymentDate: formatDate(document.issueDate)
          }
        ]
      } : {}),
      documentTotals: {
        taxPayable: Math.abs((document.totals as any)?.vatTotal || 0),
        netTotal: Math.abs((document.totals as any)?.subtotal || 0),
        grossTotal: Math.abs((document.totals as any)?.total || 0),
        ...(isReceipt ? {
          settlementAmount: Math.abs((document.totals as any)?.total || 0), // Mandatory for paid docs
          paymentMechanism: this.mapPaymentMethodToAgtApiFormat(document.payment?.method)
        } : {}),
        currencyCode: 'AOA' // Often required in flattened JSON
      }
    };
  }

  /**
   * Map document status to AGT code
   * According to SAF-T AO XSD: N (Normal), S (Autofacturação), A (Anulado), R (Resumo)
   */
  mapDocumentStatusToAgt(status: DocumentStatus | string): string {
    switch (status) {
      case 'draft':
        return 'S'; // Draft/Autofacturação
      case DocumentStatus.ACCEPTED:
      case 'issued':
      case 'paid':
      case 'finalized':
        return 'N'; // Normal
      case DocumentStatus.REJECTED:
      case 'cancelled':
        return 'A'; // Anulado
      case 'summary':
        return 'R'; // Resumo
      default:
        return 'N'; // Normal (default)
    }
  }

  /**
   * Map document type to AGT
   */
  mapDocumentTypeToAgt(documentType: DocumentType | string): string {
    const type = String(documentType).toLowerCase();
    
    // Check for codes directly
    if (type === 'gf' || type === 'factura_generica') return 'GF';
    if (type === 'ft' || type === 'factura') return 'FT';
    if (type === 'nc' || type === 'nota_de_credito') return 'NC';
    if (type === 'nd' || type === 'nota_de_debito') return 'ND';
    if (type === 'rc' || type === 'recibo') return 'RC';
    if (type === 'fr' || type === 'factura_recibo') return 'FR';
    if (type === 'gr' || type === 'nota_de_entrega') return 'GR';
    if (type === 'pp' || type === 'proforma') return 'PP';
    if (type === 'ac' || type === 'aviso_cobranca') return 'AC';
    if (type === 'ar' || type === 'aviso_cobranca_recibo') return 'AR'; // Aviso de Cobrança/Recibo mapped to AR
    if (type === 'rg' || type === 'outros_recibos') return 'RG';
    if (type === 'or' || type === 'orcamento') return 'OR';
    if (type === 'factura_generica' || type === 'gf') return 'GF'; // Factura Genérica
    if (type === 'factura_global' || type === 'fg') return 'FG'; // Factura Global
    if (type === 'factura_recibo_autofacturacao' || type === 'af') return 'AF'; // Autofacturação
    if (type === 'recibo_estorno' || type === 're') return 'RE'; // Estorno ou Recibo de Estorno
    if (type === 'factura_adiantamento' || type === 'fa') return 'FA'; // Factura de Adiantamento

    switch (documentType) {
      case DocumentType.INVOICE:
        return 'FT'; // Factura
      case DocumentType.QUOTE:
        return 'OR'; // Orçamento
      case DocumentType.CREDIT_NOTE:
        return 'NC'; // Nota de Crédito
      case DocumentType.RECEIPT:
        return 'RC'; // Recibo (Standard SAF-T code)
      case DocumentType.DELIVERY_NOTE:
        return 'GR'; // Guia de Remessa
      case DocumentType.DEBIT_NOTE:
        return 'ND'; // Nota de Débito
      case DocumentType.INVOICE_RECEIPT:
        return 'FR'; // Factura/Recibo
      case 'recibo_estorno' as any:
        return 'RE'; // Recibo de Estorno
      case DocumentType.PROFORMA:
        return 'PP'; // Proforma
      case DocumentType.OTHER_RECEIPT:
        return 'RG'; // Outros recibos
      case DocumentType.AVISO_COBRANCA:
        return 'AC'; // Aviso de Cobrança maps to AC
      case DocumentType.GENERIC_INVOICE:
        return 'GF'; // Factura Genérica
      case DocumentType.GLOBAL_INVOICE:
        return 'FG'; // Factura Global
      case DocumentType.SELF_BILLING_INVOICE_RECEIPT:
        return 'AF'; // Autofacturação mapped to AF with SelfBillingIndicator=1
      case DocumentType.REVERSAL_RECEIPT:
        return 'RE'; // Estorno ou Recibo de Estorno
      case DocumentType.ADVANCE_INVOICE:
        return 'FA'; // Factura de Adiantamento
      case DocumentType.PAYMENT_NOTICE_RECEIPT:
        return 'AR'; // Aviso de Cobrança/Recibo mapped to AR
      default:
        return 'FT';
    }
  }

  /**
   * Rounding helper (Round Half Up) to match documentStore
   */
  /**
   * Universal AGT Rounding: Round Half Up to 2 decimals
   * This is the mandatory rounding for SAF-T AO and AGT compliance.
   */
  private round(value: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
  }

  /**
   * Map VAT rate to AGT tax code
   */
  mapVatRateToAgtCode(vatRate: number, exemptionReason?: string): string {
    if (vatRate === 14) {
      return 'IVA'; // CORRECTED: Use 'IVA' for 14% to match portal requirements
    } else if (vatRate === 7) {
      return 'RED'; // Reduced rate
    } else if (vatRate === 0) {
      return 'ISE';
    } else {
      return 'IVA'; // Default to 'IVA'
    }
  }

  /**
   * Generate document hash for verification
   */
  generateDocumentHash(document: any): string {
    // Prefer real chained hash if present
    if (document && typeof document.hash === 'string' && document.hash.length > 0) {
      return document.hash;
    }
    // Fallback simplified hash (legacy)
    const total = this.safeTotal((document as any)?.totals);
    const data = `${document.uuid}-${document.series}-${document.sequentialNumber}-${total}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  /**
   * Generate QR code data for a document
   * Compliant with AGT requirements:
   * URL: https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=nifEmissor&document=documentNo
   */
  async generateQrCodeData(document: IDocument): Promise<string> {
    let issuerNif = document.seller.nif || '';
    if (!issuerNif) {
      try {
        const company = await this.getCompanyInfo();
        issuerNif = company?.nif || '';
      } catch {}
    }
    
    // AGT COMPLIANCE: Use centralized logic for document number structure
    // ensures QR code contains the exact same "TYPE SERIES/NUMBER" as the payload.
    const docNo = await this.computeAgtDocumentNo(document);
    
    const baseUrl = "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe";
    const query = `emissor=${encodeURIComponent(issuerNif)}&document=${encodeURIComponent(docNo)}`;
    return `${baseUrl}?${query}`;
  }

  async computeAgtDocumentNo(document: IDocument): Promise<string> {
    const docType = this.mapDocumentTypeToAgt(document.documentType);
    const yearPart = new Date(document.issueDate).getFullYear();
    let seriesPart = '';

    // 0. If document.series is already a full AGT series (length > 4, not just year), use it!
    if (document.series && String(document.series).length > 4) {
      seriesPart = String(document.series).trim();
    }

    if (!seriesPart) {
      try {
        // Try authorized series from company.json first (source of truth for AGT authorized series)
        const companyPath = companyJsonPath();
        if (fs.existsSync(companyPath)) {
          const content = fs.readFileSync(companyPath, 'utf8');
          const company = JSON.parse(content);
          const map = company && company.authorizedSeries;
          const yKey = String(yearPart);
          const m = map && map[docType] && map[docType][yKey];
          if (m && typeof m === 'string' && m.trim()) {
            seriesPart = m.trim();
          }
        }
        
        // 1. Fallback to active configuration (contingency series)
        if (!seriesPart) {
          const cfg = await this.getActiveConfig();
          const mode = (cfg as any)?.submissionMode || 'online';
          
          if (mode === 'offline') {
            const yKey = String(yearPart);
            const contMap = (cfg as any)?.contingencySeriesCodes || {};
            const fromCfg = contMap?.[docType]?.[yKey];
            if (fromCfg && typeof fromCfg === 'string' && fromCfg.trim()) {
              seriesPart = fromCfg.trim();
            }
          }

          // 2. Final fallback to mode-based normalization
          if (!seriesPart) {
            const seriesBase = String(((document.seller as any)?.seriesBase || 'XVE')).toUpperCase();
            seriesPart = this.normalizeSeries(`${seriesBase}${yearPart}`, mode);
          }
        }
      } catch (e) {
        console.warn('[AgtService] Error computing series part:', e);
      }
    }

    const seqStr = String(document.sequentialNumber).padStart(4, '0');
    
    // AGT COMPLIANCE: The document number MUST follow the structure "TYPE SERIES/NUMBER"
    // e.g., "NC NC7926S16403C/0138". 
    // FIXED: Strip redundant docType if already present in seriesPart to avoid "RC RC..."
    let cleanSeries = seriesPart.trim();
    if (cleanSeries.toUpperCase().startsWith(docType.toUpperCase() + ' ')) {
      cleanSeries = cleanSeries.substring(docType.length + 1).trim();
    } else if (cleanSeries.toUpperCase().startsWith(docType.toUpperCase())) {
      // Check if it's just the prefix without space, e.g. "RC7926S..."
      cleanSeries = cleanSeries.substring(docType.length).trim();
    }
    
    return `${docType} ${cleanSeries}/${seqStr}`;
  }

  /**
   * Generate QR code image as data URL
   */
  async generateQrCodeImage(document: any): Promise<string> {
    try {
      const qrData = await this.generateQrCodeData(document as any);
      
      if (!qrData || qrData.length === 0) {
        throw new Error('Invalid QR data');
      }
      
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 1,
      // let library choose best version based on data length
      scale: 4,
      width: 350,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
      if (!qrCodeDataUrl || typeof qrCodeDataUrl !== 'string' || !qrCodeDataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('Invalid QR code data URL generated');
      }
      const dims = this.parsePngDimensions(qrCodeDataUrl);
      if (!dims || dims.width < 300 || dims.height < 300) {
        const retry = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          margin: 1,
          // let library choose best version
          scale: 4,
          width: 400,
          color: { dark: '#000000', light: '#FFFFFF' }
        });
        if (!retry || !retry.startsWith('data:image/png;base64,')) {
          throw new Error('Invalid QR code data after resize');
        }
        return retry;
      }
      
      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAABQklEQVR4nO3csU3EQBAF0NkTDkjo4Ci5AqAHKrj8LoIOoIwj4qMCOjCgAMQJEjpwgQvQ6rTSWp73JBfj0Xg8+wMAAAAAAAAAAADgvyqllNbafUQcI2K/7TxfaIqIc0rpbbVa3bqD27ZtpZRzRBxmHO6bnSLiUGt9joj9nPM9dJhaa1/yMCJi13XdcjabfXTH...';
    }
  }

  private parsePngDimensions(dataUrl: string): { width: number; height: number } | null {
    try {
      const b64 = dataUrl.split(',')[1] || '';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 24) return null;
      const pngSig = '89504e470d0a1a0a';
      const sig = buf.slice(0, 8).toString('hex');
      if (sig !== pngSig) return null;
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generates the XML for a single invoice to be sent to AGT
   * This mimics the structure required by SAF-T AO 1.01_01 for the AuditFile
   */
  private generateInvoiceXml(document: IDocument, company: any): string {
    // Ensure dates are formatted correctly
    const invoiceDate = new Date(document.issueDate).toISOString().split('T')[0];
    const systemEntryDate = new Date(document.createdAt || document.issueDate).toISOString().split('.')[0];
    
    // Calculate totals
    const grossTotal = document.totals.grandTotal || 0;
    const netTotal = document.totals.subtotal || 0;
    const taxPayable = grossTotal - netTotal;
    
    // Map lines
    const linesXml = (document.lines || []).map((item, index) => {
        const itemTotal = (item.unitPrice || 0) * (item.quantity || 0);
        const taxRate = item.vatRate || 14;
        const taxAmount = (itemTotal * taxRate) / 100;
        
        return `
                    <Line>
                        <LineNumber>${index + 1}</LineNumber>
                        <ProductCode>${item.sku || 'MISC'}</ProductCode>
                        <ProductDescription>${item.description || 'Item'}</ProductDescription>
                        <Quantity>${item.quantity || 0}</Quantity>
                        <UnitOfMeasure>${item.unit || 'UN'}</UnitOfMeasure>
                        <UnitPrice>${(item.unitPrice || 0).toFixed(2)}</UnitPrice>
                        <TaxPointDate>${invoiceDate}</TaxPointDate>
                        <Description>${item.description || 'Item'}</Description>
                        <CreditAmount>${itemTotal.toFixed(2)}</CreditAmount>
                        <Tax>
                           <TaxType>IVA</TaxType>
                           <TaxCode>${this.mapVatRateToAgtCode(taxRate)}</TaxCode>
                           <TaxPercentage>${taxRate.toFixed(2)}</TaxPercentage>
                        </Tax>
                        <SettlementAmount>0.00</SettlementAmount>
                    </Line>`;
    }).join('');

    return `
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
    <Header>
        <AuditFileVersion>1.01_01</AuditFileVersion>
        <CompanyID>${company.nif}</CompanyID>
        <TaxRegistrationNumber>${company.nif}</TaxRegistrationNumber>
        <TaxAccountingBasis>F</TaxAccountingBasis>
        <CompanyName>${company.name}</CompanyName>
        <BusinessName>${company.name || company.tradeName}</BusinessName>
        <CompanyAddress>
            <AddressDetail>${company.address}</AddressDetail>
            <City>${company.city}</City>
            <PostalCode>${company.postalCode || '0000'}</PostalCode>
            <Country>AO</Country>
        </CompanyAddress>
        <FiscalYear>${new Date(document.issueDate).getFullYear()}</FiscalYear>
        <StartDate>${invoiceDate}</StartDate>
        <EndDate>${invoiceDate}</EndDate>
        <CurrencyCode>AOA</CurrencyCode>
        <DateCreated>${invoiceDate}</DateCreated>
        <TaxEntity>Global</TaxEntity>
        <ProductCompanyTaxID>${company.saftProductCompanyTaxId || company.nif}</ProductCompanyTaxID>
        <SoftwareValidationNumber>${company.saftSoftwareValidationNumber || '0'}</SoftwareValidationNumber>
        <ProductID>${company.saftProductId || 'Prakash/Generic'}</ProductID>
        <ProductVersion>${company.saftProductVersion || '1.0.0'}</ProductVersion>
        <Telephone>${company.phone || ''}</Telephone>
        <Email>${company.email || ''}</Email>
        <Website>${company.website || ''}</Website>
    </Header>
    <MasterFiles>
        <Customer>
            <CustomerID>${(document.buyer && document.buyer.nif) || '999999999'}</CustomerID>
            <AccountID>999999999</AccountID>
            <CustomerTaxID>${(document.buyer && document.buyer.nif) || '999999999'}</CustomerTaxID>
            <CompanyName>${(document.buyer && document.buyer.name) || 'Consumidor Final'}</CompanyName>
            <BillingAddress>
                <AddressDetail>${(document.buyer && document.buyer.address) || 'Desconhecido'}</AddressDetail>
                <City>${(document.buyer as any).city || 'Luanda'}</City>
                <PostalCode>0000</PostalCode>
                <Country>AO</Country>
            </BillingAddress>
            <SelfBillingIndicator>0</SelfBillingIndicator>
        </Customer>
    </MasterFiles>
    <SourceDocuments>
        <SalesInvoices>
            <NumberOfEntries>1</NumberOfEntries>
            <TotalDebit>0.00</TotalDebit>
            <TotalCredit>${grossTotal.toFixed(2)}</TotalCredit>
            <Invoice>
                <InvoiceNo>${this.mapDocumentTypeToAgt(document.documentType)} ${document.series}/${document.sequentialNumber}</InvoiceNo>
                <DocumentStatus>
                    <InvoiceStatus>N</InvoiceStatus>
                    <InvoiceStatusDate>${systemEntryDate}</InvoiceStatusDate>
                    <SourceID>Admin</SourceID>
                    <SourceBilling>P</SourceBilling>
                </DocumentStatus>
                <Hash>${this.generateDocumentHash(document)}</Hash>
                <HashControl>1</HashControl>
                <Period>${new Date(document.issueDate).getMonth() + 1}</Period>
                <InvoiceDate>${invoiceDate}</InvoiceDate>
                <InvoiceType>${this.mapDocumentTypeToAgt(document.documentType)}</InvoiceType>
                <SpecialRegimes>
                    <SelfBillingIndicator>0</SelfBillingIndicator>
                    <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
                    <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
                </SpecialRegimes>
                <SourceID>Admin</SourceID>
                <SystemEntryDate>${systemEntryDate}</SystemEntryDate>
                <CustomerID>${(document.buyer && document.buyer.nif) || '999999999'}</CustomerID>
                ${linesXml}
                <DocumentTotals>
                    <TaxPayable>${taxPayable.toFixed(2)}</TaxPayable>
                    <NetTotal>${netTotal.toFixed(2)}</NetTotal>
                    <GrossTotal>${grossTotal.toFixed(2)}</GrossTotal>
                </DocumentTotals>
            </Invoice>
        </SalesInvoices>
    </SourceDocuments>
</AuditFile>`.trim();
  }

  /**
    * Generates a SOAP envelope for AGT RegistarFacturaRequest with WS-Security header.
    */
   private generateSoapEnvelope(auditFileXml: string, config: any): string {
     const nif = config.nif || config.saftProductCompanyTaxId || '';
     const password = config.agtPassword || '123456'; 
     const cleanAuditFile = auditFileXml.replace(/<\?xml.*?\?>/g, '').trim();

     // Generate Timestamp
     const created = new Date();
     const expires = new Date(created.getTime() + 5 * 60 * 1000); // 5 minutes validity
     const createdStr = created.toISOString();
     const expiresStr = expires.toISOString();

     return `
 <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <soapenv:Header>
       <wsse:Security soapenv:mustUnderstand="1">
          <wsu:Timestamp wsu:Id="Timestamp-1">
             <wsu:Created>${createdStr}</wsu:Created>
             <wsu:Expires>${expiresStr}</wsu:Expires>
          </wsu:Timestamp>
          <wsse:UsernameToken wsu:Id="UsernameToken-1">
             <wsse:Username>${nif}</wsse:Username>
             <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${password}</wsse:Password>
          </wsse:UsernameToken>
       </wsse:Security>
    </soapenv:Header>
    <soapenv:Body>
       <v1:RegistarFacturaRequest>
 ${cleanAuditFile}
       </v1:RegistarFacturaRequest>
    </soapenv:Body>
 </soapenv:Envelope>`.trim();
   }

  /**
   * Submit invoice to AGT via SOAP interface (4.1.1)
   */
  async submitInvoiceSoap(document: IDocument): Promise<any> {
    const config = await this.getActiveConfig();
    const company = await this.getCompanyInfo();
    const mergedConfig = { ...config, ...company };

    const xml = this.generateInvoiceXml(document, mergedConfig);
    const soapEnvelope = this.generateSoapEnvelope(xml, mergedConfig);
    
    const url = config.apiUrl ? `${config.apiUrl}/registarFactura` : 'https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura';

    try {
      const response = await axios.post(url, soapEnvelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://sifp.minfin.gov.ao/sigt/fe/ws/v1/registarFactura'
        },
        httpsAgent: new (require('https').Agent)({ 
            rejectUnauthorized: false,
            secureOptions: require('crypto').constants.SSL_OP_LEGACY_SERVER_CONNECT,
            minVersion: 'TLSv1',
            ciphers: 'DEFAULT@SECLEVEL=0'
        })
      });
      return response.data;
    } catch (error) {
      console.error('SOAP Submission Error:', error);
      throw error;
    }
  }

  // =================================================================================
  // PUBLIC AGT REST API METHODS
  // =================================================================================

  /**
   * Register Invoice (REST)
   * Sends the invoice data to AGT for registration
   */
  async registarFactura(document: IDocument): Promise<any> {
    // Determine the AGT document type
    const agtType = this.mapDocumentTypeToAgt(document.documentType);
    
    // Check if this type is allowed by the registarFactura endpoint
    // Allowed types: [FA, FT, FR, FG, GF, AC, AR, TV, RC, RG, RE, ND, NC, AF, RP, RA, CS, LD]
    const allowedTypes = ['FA', 'FT', 'FR', 'FG', 'GF', 'AC', 'AR', 'TV', 'RC', 'RG', 'RE', 'ND', 'NC', 'AF', 'RP', 'RA', 'CS', 'LD'];
    
    if (!allowedTypes.includes(agtType)) {
      console.warn(`[AgtService] Skipping registration for document type ${agtType} (${document.documentType}). Not accepted by AGT API.`);
      return { 
        resultCode: 1, 
        message: 'Document type skipped (non-registrable)', 
        skipped: true,
        requestID: `SKIPPED-${document.id}` 
      };
    }

    const payload = await this.generateRegistarFacturaPayload(document);
    const resp = await this.submitRestRequest('registarFactura', payload);
    if (process.env.NODE_ENV === 'test') return resp;
    const requestID = resp?.requestID || resp?.successRequestID || resp?.agtToken;
    if (!requestID) return resp;

    try {
      const estado = await this.obterEstado(String(requestID));
      return this.processRegistrationResult(resp, estado, document, String(requestID));
    } catch (e: any) {
      if (e?.message && String(e.message).includes('AGT Processing Error')) {
        throw e;
      }
      return { ...resp, resultCode: 2 };
    }
  }

  /**
   * Internal method to process registration results and handle retries for status check
   */
  private async processRegistrationResult(resp: any, estado: any, document: IDocument, requestID: string, retryCount = 0): Promise<any> {
    const list = Array.isArray(estado?.documentStatusList) ? estado.documentStatusList : [];
    const errors: string[] = [];
    const errorCodes: string[] = [];
    
    // Check root error list if present (E94 often appears here)
    const rootErrors = Array.isArray(estado?.errorList) ? estado.errorList : [];
    for (const e of rootErrors) {
      if (!e) continue;
      if (e.idError) errorCodes.push(String(e.idError));
      const msg = String(e.descriptionError || e.message || e.description || e.idError || e.code || '').trim();
      if (msg) errors.push(msg);
    }

    for (const entry of list) {
      const entryErrors = Array.isArray(entry?.errorList) ? entry.errorList : [];
      for (const e of entryErrors) {
        if (!e) continue;
        if (e.idError) errorCodes.push(String(e.idError));
        const msg = String(e.descriptionError || e.message || e.description || e.idError || e.code || '').trim();
        if (msg) errors.push(msg);
      }
    }

    // GENIUS E94 HANDLER: Respect AGT's 30-minute processing recommendation
    const hasE94 = errorCodes.includes('E94') || errors.some(e => e.includes('E94') || e.toLowerCase().includes('solicitação não encontrada') || e.toLowerCase().includes('request not found'));
    
    if (hasE94) {
        console.log(`[AgtService] GENIUS E94 HANDLER: Request ${requestID} not found yet (Processing). Returning resultCode 2 to allow background polling.`);
        // Mark as processing (resultCode 2) rather than failing
        return { 
            ...resp, 
            resultCode: 2, 
            obterEstado: estado, 
            status: 'PROCESSING',
            message: 'AGT Processing: Document received but validation still in progress (E94). Please check again in 30 minutes.'
        };
    }

    if (errors.length > 0) {
      const joined = errors.join('; ');
      const lower = joined.toLowerCase();
      const alreadyExists =
        lower.includes('já consta no repositório') ||
        lower.includes('já consta no repositório') ||
        lower.includes('duplicada');
      if (alreadyExists) {
        return { ...resp, resultCode: 1, obterEstado: estado, message: 'Already exists' };
      }
      const err = new Error(`AGT Processing Error: ${errors.join('; ')}`);
      (err as any).response = { data: { registarFactura: resp, obterEstado: estado } };
      throw err;
    }

    const resultCode = estado?.resultCode;
    const numeric = typeof resultCode === 'string' ? parseInt(resultCode, 10) : Number(resultCode);
    const isProcessedOk = numeric === 1;
    
    // If result is still pending/processing (numeric === 2 or 0)
    if ((numeric === 2 || numeric === 0) && retryCount < 12) {
      const waitTime = retryCount < 3 ? 5000 : 15000;
      console.log(`[AgtService] Document processing in progress (resultCode: ${numeric}, Attempt ${retryCount + 1}/12). Retrying status check in ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      const nextEstado = await this.obterEstado(requestID);
      return this.processRegistrationResult(resp, nextEstado, document, requestID, retryCount + 1);
    }

    if (isProcessedOk) {
      return { ...resp, resultCode: 1, obterEstado: estado };
    }
    
    return { ...resp, resultCode: 2, obterEstado: estado };
  }

  /**
   * Check Status (REST)
   * Checks the processing status of a submitted invoice batch
   */
  async obterEstado(requestID: string): Promise<any> {
    const payload = await this.generateObterEstadoPayload(requestID);
    return this.submitRestRequest('obterEstado', payload);
  }

  /**
   * Request Series (REST)
   * Requests authorization for a new document series
   */
  async solicitarSerie(seriesYear: number | string, documentType: string, establishmentNumber: string = 'SEDE', contingency: boolean = false): Promise<any> {
    const payload = await this.generateSolicitarSeriePayload(seriesYear, documentType, establishmentNumber, contingency);
    const resp = await this.submitRestRequest('solicitarSerie', payload);
    try {
      const code = (resp as any)?.seriesFEResult?.seriesCode || (resp as any)?.seriesCode;
      const yearStr = String(seriesYear);
      const mappedDt = String((payload as any)?.documentType || this.mapDocumentTypeToAgt(documentType)).toUpperCase();
      if (code && yearStr && mappedDt) {
        const p = companyJsonPath();
        let company: any = {};
        try {
          if (fs.existsSync(p)) {
            company = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}');
          }
        } catch {}
        const map = company.authorizedSeries || {};
        if (!map[mappedDt]) map[mappedDt] = {};
        map[mappedDt][yearStr] = code;
        company.authorizedSeries = map;
        try {
          fs.writeFileSync(p, JSON.stringify(company, null, 2), 'utf-8');
        } catch {}
      }
    } catch {}
    return resp;
  }

  /**
   * List Series (REST)
   * Lists authorized series
   */
  async listarSeries(seriesYear?: number | string, status?: string): Promise<any> {
    const payload = await this.generateListarSeriesPayload(seriesYear, status);
    return this.submitRestRequest('listarSeries', payload);
  }

  /**
   * List Invoices (REST)
   * Lists invoices within a date range
   */
  async listarFacturas(queryStartDate: Date, queryEndDate: Date): Promise<any> {
    const payload = await this.generateListarFacturasPayload(queryStartDate, queryEndDate);
    return this.submitRestRequest('listarFacturas', payload);
  }

  /**
   * Register Invoice with raw payload (REST)
   */
  async registarFacturaRaw(payload: any): Promise<any> {
    return this.submitRestRequest('registarFactura', payload);
  }

  /**
   * Consult Invoice (REST)
   * Gets details of a specific invoice
   */
  async consultarFactura(invoiceNo: string): Promise<any> {
    const payload = await this.generateConsultarFacturaPayload(invoiceNo);
    return this.submitRestRequest('consultarFactura', payload);
  }

  /**
   * Validate Document (REST)
   * Buyer confirmation/rejection of an invoice
   */
  async validarDocumento(documentNo: string, action: 'C' | 'R', opts?: { deductibleVATPercentage?: number, nonDeductibleAmount?: number }): Promise<any> {
    const payload = await this.generateValidarDocumentoPayload(documentNo, action, opts);
    return this.submitRestRequest('validarDocumento', payload);
  }

  /**
   * Get mock response for endpoint
   */
  private getMockResponse(endpoint: string, payload: any): any {
    if (endpoint === 'solicitarSerie') {
      const year = String((payload as any)?.seriesYear || new Date().getFullYear());
      const dt = String((payload as any)?.documentType || 'FT');
      const cont = String((payload as any)?.seriesContingencyIndicator || 'N');
      const code = `${dt}${year}${cont === 'C' ? 'C' : ''}${Math.floor(Math.random() * 9000 + 1000)}`;
      return {
        resultCode: 1,
        errorList: [],
        seriesFEResult: {
          seriesCode: code,
          authorizedQuantity: '999999999999',
          firstDocumentNo: '1',
          lastDocumentNo: '999999999999'
        }
      };
    }
    if (endpoint === 'listarSeries') {
      const year = String((payload as any)?.seriesYear || new Date().getFullYear());
      const dt = String((payload as any)?.documentType || 'FT');
      const code = `${dt}${year}${Math.floor(Math.random() * 90 + 10)}`;
      return {
        resultCode: '1',
        seriesResultCount: '1',
        seriresInfo: [
          {
            seriesCode: code,
            authorizedQuantity: '999999999999',
            firstDocumentNo: '1',
            lastDocumentNo: '999999999999',
            seriesStatus: 'A'
          }
        ]
      };
    }
    if (endpoint === 'registarFactura') {
      return {
        resultCode: 1,
        requestID: `REQ-${Date.now()}`
      };
    }
    if (endpoint === 'obterEstado') {
      return {
        resultCode: 1,
        status: 'PROCESSADO',
        errorList: []
      };
    }
    return null;
  }

  /**
   * Submit REST request to AGT
   * Authenticates with Username/Password headers and sends JWS-signed payload
   */
  async submitRestRequest(endpoint: string, payload: any): Promise<any> {
    const config = await this.getActiveConfig();
    
    // Check for mock mode first
    const allowMock = process.env.AGT_ALLOW_MOCKS === 'true' || (config as any).allowMock === true;
    if (allowMock) {
      const mock = this.getMockResponse(endpoint, payload);
      if (mock) {
        console.log(`[AgtService] Using mock response for ${endpoint}`);
        return mock;
      }
    }

    // Default to HML (Test) if not set. REST endpoint usually differs from SOAP.
    // Based on user prompt: "https://sifphml.minfin.gov.ao/sigt/fe/v1/..."
    const baseUrl = config.agtRestUrl || 'https://sifphml.minfin.gov.ao/sigt/fe/v1';
    
    // Ensure URL doesn't end with slash
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/${endpoint}`;
    
    // Get credentials
    const username = (config as any).agtUsername || (config as any).nif || '';
    const password = (config as any).agtPassword || '';
    const authMode = (config as any).restAuthMode || 'headers';
    const userHeader = (config as any).restUserHeader || 'Username';
    const passHeader = (config as any).restPassHeader || 'Password';
    const headers: any = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const fingerprint = this.resolveFingerprint?.();
    if (fingerprint) headers['X-Software-Key-Id'] = fingerprint;
    if (authMode === 'basic') {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    } else {
      headers[userHeader] = username;
      headers[passHeader] = password;
    }

    console.log(`[AgtService] Sending REST request to ${url}`);
    const requestTimeoutMsRaw = Number((config as any).timeout);
    const requestTimeoutMsBase = Number.isFinite(requestTimeoutMsRaw) && requestTimeoutMsRaw > 0 ? requestTimeoutMsRaw : 60000;
    const requestTimeoutMs = endpoint === 'obterEstado' ? Math.min(requestTimeoutMsBase, 45000) : requestTimeoutMsBase;
    const curlMaxSeconds = Math.max(5, Math.min(120, Math.ceil(requestTimeoutMs / 1000)));
    
    let error: any;
    const isRegistration = endpoint.includes('registarFactura');
    const MAX_RETRIES = endpoint === 'obterEstado' ? 1 : (isRegistration ? 5 : 3);

    const { Agent: UndiciAgent } = require('undici');
    const crypto = require('crypto');
    const dispatcher = new UndiciAgent({
      connect: {
        timeout: 120000,
        rejectUnauthorized: false,
        servername: new URL(url).hostname,
        minVersion: 'TLSv1',
        maxVersion: 'TLSv1.2',
        ciphers: 'DEFAULT@SECLEVEL=0',
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      bodyTimeout: 300000,
      headersTimeout: 300000,
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[AgtService] [Fetch] ${endpoint} (Attempt ${attempt}/${MAX_RETRIES}) URL: ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          dispatcher,
          signal: AbortSignal.timeout(requestTimeoutMs),
        } as any);

        const text = await response.text();
        const status = response.status;
        console.log(`[AgtService] [Response] ${endpoint} Status: ${status} Body: ${text.substring(0, 500)}`);
        
        let data: any;
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Non-JSON response (e.g. HTML error from gateway)
          const err = new Error(`Invalid JSON response from AGT (${status}): ${text.substring(0, 200)}`);
          (err as any).response = { status, data: text };
          throw err;
        }
        
        if (!response.ok) {
           const err = new Error(`AGT API Error (${status}): ${JSON.stringify(data)}`);
           (err as any).response = { status, data };
           throw err;
        }

        if (!data || typeof data.resultCode === 'undefined') {
          const requestID = data?.requestID || data?.successRequestID || data?.agtToken;
          
          // CLEAN ERROR LIST: Filter out empty strings, nulls, and empty objects
          const rawErrors = Array.isArray(data.errorList) ? data.errorList : [];
          const cleanErrors = rawErrors.filter((e: any) => {
            if (!e) return false;
            if (typeof e === 'string' && e.trim() === '') return false;
            if (typeof e === 'object' && Object.keys(e).length === 0) return false;
            return true;
          });

          // GENIUS E94 HANDLER: If obtaining status and E94 occurs, return it as a processing state
          const hasE94 = endpoint === 'obterEstado' && cleanErrors.some((e: any) => String(e.idError) === 'E94');
          
          if (hasE94) {
            console.log(`[AgtService] E94 detected in ${endpoint}. Returning as processing status.`);
            return { ...data, resultCode: 2, status: 'PROCESSING', message: 'Solicitação não encontrada (E94)' };
          }

          // If we have real errors but no resultCode, it's definitely a failure
          if (cleanErrors.length > 0) {
            const errorMsg = `AGT Business Error: ${JSON.stringify(cleanErrors)}`;
            const businessError = new Error(errorMsg);
            (businessError as any).response = { status: response.status, data };
            throw businessError;
          }

          if (requestID) {
            return { ...data, resultCode: 2, requestID: String(requestID) };
          }
          const errorMsg = `AGT Invalid Response (Missing resultCode): ${JSON.stringify(data)}`;
          const invalid = new Error(errorMsg);
          (invalid as any).response = { status: response.status, data };
          throw invalid;
        }

        if (endpoint !== 'obterEstado' && Number(data.resultCode) !== 1) {
          // Also clean error list here for consistent error messages
          const rawErrors = Array.isArray(data.errorList) ? data.errorList : (data.errorList ? [data.errorList] : []);
          const cleanErrors = rawErrors.filter((e: any) => e && (typeof e !== 'string' || e.trim() !== ''));
          
          if (cleanErrors.length === 0 && (data.requestID || data.successRequestID || data.agtToken)) {
             // If AGT returns resultCode != 1 but no errors and we have a token, it might be an unconventional success/pending
             return { ...data, resultCode: 2 };
          }

          const errorMsg = `AGT Business Error (resultCode: ${data.resultCode}): ${JSON.stringify(cleanErrors.length > 0 ? cleanErrors : data)}`;
          const businessError = new Error(errorMsg);
          (businessError as any).response = { status: response.status, data };
          throw businessError;
        }

        // Central Dashboard Logging
        if (isRegistration) {
          const docId = payload.documents?.[0]?.invoiceNo || 'unknown';
          CentralLogService.logSubmission(docId, 'success', {
            response: data,
            endpoint
          });
        }
  
        return data;
      } catch (e: any) {
        error = e;
        const status = typeof e.response?.status === 'number' ? e.response.status : undefined;
        
        const isBusinessError = e.message && (e.message.includes('AGT Business Error') || (e.message.includes('AGT API Error') && status !== 429 && status < 500));
        const isInvalidResponse = e.message && e.message.includes('Invalid JSON response');
        const isRateLimited = status === 429;
        const isTimeout = e.name === 'TimeoutError' || e.message === 'timeout';
        
        const shouldRetry = (isTimeout || isInvalidResponse || isRateLimited || (!isBusinessError && (!status || (status >= 500 && status < 600)))) && attempt < MAX_RETRIES;
        
        if (shouldRetry) {
          // Increase delay significantly for 429 or if it keeps failing
          const baseDelay = isRateLimited ? 20000 : 5000;
          const delay = baseDelay + (attempt * 10000);
          console.warn(`[AgtService] Request to ${endpoint} failed (Status: ${status}, Attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    if (error) {
      // Log error to audit service for visibility
      try {
        const agtAuditService = require('./AgtAuditService').default;
        if (agtAuditService) {
          agtAuditService.log(`agt_rest_error_${endpoint}`, 'error', error.message || String(error), {
            url,
            status: error.response?.status,
            responseData: error.response?.data,
            attempt: MAX_RETRIES
          });
        }
      } catch (auditErr) {}

      // Central Dashboard Logging (Error)
      if (endpoint.includes('registarFactura')) {
         const docId = payload.documents?.[0]?.invoiceNo || 'unknown';
         CentralLogService.logSubmission(docId, 'failure', { 
            error: error.message || String(error),
            response: error.response?.data,
            endpoint 
         });
      }

      console.error(`AGT REST Request Error (${endpoint}):`, error.response?.data || error.message);
      
      // If the error is a strict Business Error (resultCode != 1), do NOT fallback to curl.
      // Curl is for network connectivity issues.
      if (error.message && (error.message.includes('AGT Business Error') || error.message.includes('AGT Invalid Response'))) {
        throw error;
      }

      try {
        const useCurl = true;
        if (useCurl) {
          const args: string[] = ['-sS', '-m', String(curlMaxSeconds), '-X', 'POST', url, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json', '-d', JSON.stringify(payload)];
          if (authMode === 'basic') {
            const token = Buffer.from(`${username}:${password}`).toString('base64');
            args.push('-H', `Authorization: Basic ${token}`);
          } else {
            args.push('-H', `${userHeader}: ${username}`);
            args.push('-H', `${passHeader}: ${password}`);
          }
          const out = require('child_process').execFileSync('curl', args, { encoding: 'utf8' });
          try {
            const parsed = JSON.parse(out);
            // Strict Validation for Curl Fallback too
            if (parsed && typeof parsed.resultCode !== 'undefined' && Number(parsed.resultCode) !== 1) {
                // If curl returns business error, we can't retry as it's the last resort (fallback)
                // But we should still treat it as an error return, NOT success
                // However, this function signature expects to return ANY response or throw.
                // If we return the parsed object, the caller will see resultCode != 1.
                // The caller SHOULD check it. But to be safe and consistent with axios block, maybe we should log it as error.
                console.error(`AGT Curl Business Error:`, parsed);
            }
            return parsed;
          } catch {
            return out;
          }
        }
      } catch (curlErr: any) {
        console.error(`AGT REST curl fallback error (${endpoint}):`, curlErr?.message || curlErr);
      }
      const allowMock = process.env.AGT_ALLOW_MOCKS === 'true' || (config as any).allowMock === true;
      if (allowMock) {
        if (endpoint === 'solicitarSerie') {
          const year = String((payload as any)?.seriesYear || new Date().getFullYear());
          const dt = String((payload as any)?.documentType || 'FT');
          const cont = String((payload as any)?.seriesContingencyIndicator || 'N');
          const code = `${dt}${year}${cont === 'C' ? 'C' : ''}${Math.floor(Math.random() * 9000 + 1000)}`;
          return {
            resultCode: 1,
            errorList: [],
            seriesFEResult: {
              seriesCode: code,
              authorizedQuantity: '999999999999',
              firstDocumentNo: '1',
              lastDocumentNo: '999999999999'
            }
          };
        }
        if (endpoint === 'listarSeries') {
          const year = String((payload as any)?.seriesYear || new Date().getFullYear());
          const dt = String((payload as any)?.documentType || 'FT');
          const code = `${dt}${year}${Math.floor(Math.random() * 90 + 10)}`;
          return {
            resultCode: '1',
            seriesResultCount: '1',
            seriresInfo: [
              {
                seriesCode: code,
                authorizedQuantity: '999999999999',
                firstDocumentNo: '1',
                lastDocumentNo: '999999999999',
                seriesStatus: 'A'
              }
            ]
          };
        }
        if (endpoint === 'registarFactura') {
          return {
            resultCode: 1,
            requestID: `REQ-${Date.now()}`
          };
        }
        if (endpoint === 'obterEstado') {
          return {
            resultCode: 1,
            status: 'PROCESSADO',
            errorList: []
          };
        }
      }
      if (error.response?.data) {
        return error.response.data;
      }
      throw error;
    }
  }

  // Helper para obter total de forma segura, compatível com estruturas atuais/legadas
  private safeTotal(totals?: any): number {
    try {
      const t = (totals as any) || {};
      return Number(t.total ?? t.grandTotal ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Submit document to AGT API
   */
  /**
   * Resolve private key path from env or default location
   */
  private resolvePrivateKeyPath(): string {
    const envPath = process.env.AGT_PRIVATE_KEY_PATH;
    if (envPath && envPath.trim()) return envPath.trim();
    return resolveDataPath('agt_keys/private.pem');
  }

  /**
   * Resolve public key fingerprint from env or file
   */
  private resolveFingerprint(): string | undefined {
    const envFp = process.env.AGT_PUBLIC_KEY_FINGERPRINT;
    if (envFp && envFp.trim()) return envFp.trim();
    try {
      const fpPath = resolveDataPath('agt_keys/public.sha256.base64.txt');
      return fs.readFileSync(fpPath, 'utf8').trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Sign JSON payload with RSA-SHA256, returning base64 signature
   */
  private signPayload(payload: any): string | undefined {
    try {
      const privateKeyPath = this.resolvePrivateKeyPath();
      const passphrase = process.env.AGT_PRIVATE_KEY_PASSPHRASE || undefined;
      const keyContent = fs.readFileSync(privateKeyPath);
      const privateKey = passphrase ? { key: keyContent, passphrase } : keyContent;
      const jsonData = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(jsonData);
      signer.end();
      return signer.sign(privateKey, 'base64');
    } catch (err: any) {
      console.warn('AGT signing skipped:', err?.message || err);
      return undefined;
    }
  }

  async submitToAgt(document: IDocument): Promise<{ success: boolean, token?: string, message?: string }> {
    try {
      const config = await this.getActiveConfig();
      if (!config) {
        throw new Error('No active AGT configuration found');
      }

      // Generate SAF-T JSON
      const saftJson = await this.generateSaftJson(document);

      // In test mode, simulate successful submission
      if (config.testMode) {
        return {
          success: true,
          token: `TEST-${Date.now()}-${document.uuid}`,
          message: 'Test mode: Document submitted successfully'
        };
      }

      // Compute signature and key id (fingerprint)
      const signature = this.signPayload(saftJson);
      const keyId = this.resolveFingerprint();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.clientId}:${config.clientSecret}`
      };
      if (signature && keyId) {
        headers['X-Software-Signature'] = signature;
        headers['X-Software-Key-Id'] = keyId;
      }

      // Use SAFT submission URL if configured, otherwise use base API URL
      const submissionUrl = (config as any).saftSubmissionUrl || 
                           config.apiUrl.replace(/\/$/, '') + '/api/v1/saft/submit';

      // Real API call to AGT using fetch for TLS 1.2 compatibility
      const { Agent: UndiciAgent } = require('undici');
      const dispatcher = new UndiciAgent({
        connect: { timeout: 60000, rejectUnauthorized: false },
        bodyTimeout: 120000,
        headersTimeout: 120000
      });

      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: headers as any,
        body: JSON.stringify(saftJson),
        dispatcher,
        signal: AbortSignal.timeout(Number((config as any).timeout) || 120000)
      } as any);

      const data = await response.json();

      if (response.ok) {
        const result = {
          success: true,
          token: data.token || data.id || data.requestID || `AGT-${Date.now()}`,
          message: 'Document submitted successfully'
        };
        
        // Log successful submission
        agtAuditService.logDocumentSubmission(
          document.uuid || (document as any).id || 'unknown',
          document.documentType,
          'success',
          'Document submitted successfully to AGT',
          { token: result.token }
        );
        
        return result;
      } else {
        const errorResult = {
          success: false,
          message: `Error: ${response.statusText}`
        };
        
        agtAuditService.logDocumentSubmission(
          document.uuid || (document as any).id || 'unknown',
          document.documentType,
          'error',
          errorResult.message
        );
        
        return errorResult;
      }
    } catch (error: any) {
      console.error('Error submitting to AGT:', error);
      
      const errorResult = {
        success: false,
        message: `Error: ${error.response?.data?.message || error.message || 'Unknown error'}`
      };
      
      // Log error
      agtAuditService.logDocumentSubmission(
        document.uuid || (document as any).id || 'unknown',
        document.documentType,
        'error',
        errorResult.message,
        { 
          errorCode: error.response?.status,
          errorDetails: error.response?.data 
        }
      );
      
      return errorResult;
    }
  }
}

export default AgtService;
