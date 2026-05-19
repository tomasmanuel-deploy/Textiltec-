import { IDocument, DocumentType, DocumentStatus } from '../models/Document';
import fs from 'fs';
import { companyJsonPath } from '@/lib/dataPaths';

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Document Validation Service
 * Validates documents according to AGT Decreto 317.20 and SAFT specifications
 */
class DocumentValidationService {
  /**
   * Validate NIF format (Angola)
   */
  private validateNif(nif: string | undefined): boolean {
    if (!nif) return false;
    const normalized = String(nif).replace(/\s+/g, '').trim();
    // Angola NIF: 9 digits or alphanumeric 6-14 chars
    return /^[0-9]{9}$/.test(normalized) || /^[A-Z0-9]{6,14}$/.test(normalized.toUpperCase());
  }

  /**
   * Validate required fields for SAFT compliance (Decreto 317.20)
   */
  validateDocument(document: IDocument): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Seller validation (required fields)
    if (!document.seller) {
      errors.push({
        field: 'seller',
        message: 'Informação do vendedor é obrigatória',
        code: 'MISSING_SELLER',
        severity: 'error',
      });
    } else {
      if (!document.seller.nif || !this.validateNif(document.seller.nif)) {
        errors.push({
          field: 'seller.nif',
          message: 'NIF do vendedor é obrigatório e deve ter formato válido',
          code: 'INVALID_SELLER_NIF',
          severity: 'error',
        });
      }
      if (!document.seller.name || String(document.seller.name).trim().length === 0) {
        errors.push({
          field: 'seller.name',
          message: 'Nome do vendedor é obrigatório',
          code: 'MISSING_SELLER_NAME',
          severity: 'error',
        });
      }
      if (!document.seller.address || String(document.seller.address).trim().length === 0) {
        errors.push({
          field: 'seller.address',
          message: 'Morada do vendedor é obrigatória',
          code: 'MISSING_SELLER_ADDRESS',
          severity: 'error',
        });
      }
    }

    // 2. Buyer validation
    if (!document.buyer) {
      errors.push({
        field: 'buyer',
        message: 'Informação do comprador é obrigatória',
        code: 'MISSING_BUYER',
        severity: 'error',
      });
    } else {
      // For invoices, buyer NIF is required unless it's "Consumidor final"
      const isConsumerFinal = document.buyer.nif === '999999999' || 
                             String(document.buyer.name || '').toLowerCase().includes('consumidor final');
      
      if (!isConsumerFinal && (!document.buyer.nif || !this.validateNif(document.buyer.nif))) {
        errors.push({
          field: 'buyer.nif',
          message: 'NIF do comprador é obrigatório (exceto para Consumidor final)',
          code: 'INVALID_BUYER_NIF',
          severity: 'error',
        });
      }
      if (!document.buyer.name || String(document.buyer.name).trim().length === 0) {
        errors.push({
          field: 'buyer.name',
          message: 'Nome do comprador é obrigatório',
          code: 'MISSING_BUYER_NAME',
          severity: 'error',
        });
      }
      if (!document.buyer.address || String(document.buyer.address).trim().length === 0) {
        warnings.push({
          field: 'buyer.address',
          message: 'Morada do comprador é recomendada para conformidade SAFT',
          code: 'MISSING_BUYER_ADDRESS',
          severity: 'warning',
        });
      }
    }

    // 3. Document identification validation
    if (!document.series || String(document.series).trim().length === 0) {
      errors.push({
        field: 'series',
        message: 'Série do documento é obrigatória',
        code: 'MISSING_SERIES',
        severity: 'error',
      });
    }

    if (typeof document.sequentialNumber !== 'number' || document.sequentialNumber <= 0) {
      errors.push({
        field: 'sequentialNumber',
        message: 'Número sequencial do documento deve ser um número positivo',
        code: 'INVALID_SEQUENTIAL_NUMBER',
        severity: 'error',
      });
    }

    if (!document.uuid || String(document.uuid).trim().length === 0) {
      errors.push({
        field: 'uuid',
        message: 'UUID do documento é obrigatório',
        code: 'MISSING_UUID',
        severity: 'error',
      });
    }

    // 4. Dates validation
    if (!document.issueDate) {
      errors.push({
        field: 'issueDate',
        message: 'Data de emissão é obrigatória',
        code: 'MISSING_ISSUE_DATE',
        severity: 'error',
      });
    } else {
      const issueDate = new Date(document.issueDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      if (isNaN(issueDate.getTime())) {
        errors.push({
          field: 'issueDate',
          message: 'Data de emissão inválida',
          code: 'INVALID_ISSUE_DATE',
          severity: 'error',
        });
      } else if (issueDate > today) {
        warnings.push({
          field: 'issueDate',
          message: 'Data de emissão não pode ser futura',
          code: 'FUTURE_ISSUE_DATE',
          severity: 'warning',
        });
      }
    }

    if (!document.taxableDate) {
      errors.push({
        field: 'taxableDate',
        message: 'Data de tributação é obrigatória',
        code: 'MISSING_TAXABLE_DATE',
        severity: 'error',
      });
    }

    // 5. Lines validation
    if (!document.lines || document.lines.length === 0) {
      errors.push({
        field: 'lines',
        message: 'Documento deve ter pelo menos uma linha',
        code: 'MISSING_LINES',
        severity: 'error',
      });
    } else {
      document.lines.forEach((line, index) => {
        const linePrefix = `lines[${index}]`;

        // SKU validation
        if (!line.sku || String(line.sku).trim().length === 0) {
          errors.push({
            field: `${linePrefix}.sku`,
            message: 'Código do produto é obrigatório',
            code: 'MISSING_SKU',
            severity: 'error',
          });
        }

        // Description validation
        if (!line.description || String(line.description).trim().length === 0) {
          errors.push({
            field: `${linePrefix}.description`,
            message: 'Descrição do produto é obrigatória',
            code: 'MISSING_DESCRIPTION',
            severity: 'error',
          });
        }

        // Quantity validation
        if (typeof line.quantity !== 'number' || line.quantity <= 0) {
          errors.push({
            field: `${linePrefix}.quantity`,
            message: 'Quantidade deve ser um número maior que zero',
            code: 'INVALID_QUANTITY',
            severity: 'error',
          });
        }

        // Unit validation
        if (!line.unit || String(line.unit).trim().length === 0) {
          errors.push({
            field: `${linePrefix}.unit`,
            message: 'Unidade de medida é obrigatória',
            code: 'MISSING_UNIT',
            severity: 'error',
          });
        }

        // Unit price validation - CRITICAL for invoices
        if (document.documentType === DocumentType.INVOICE || 
            document.documentType === DocumentType.INVOICE_RECEIPT) {
          if (typeof line.unitPrice !== 'number' || line.unitPrice <= 0) {
            errors.push({
              field: `${linePrefix}.unitPrice`,
              message: 'Preço unitário deve ser maior que zero para facturas',
              code: 'INVALID_UNIT_PRICE',
              severity: 'error',
            });
          }
        } else {
          if (typeof line.unitPrice !== 'number' || line.unitPrice < 0) {
            warnings.push({
              field: `${linePrefix}.unitPrice`,
              message: 'Preço unitário negativo pode causar problemas no SAFT',
              code: 'NEGATIVE_UNIT_PRICE',
              severity: 'warning',
            });
          }
        }

        // VAT rate validation
        if (typeof line.vatRate !== 'number' || line.vatRate < 0 || line.vatRate > 100) {
          errors.push({
            field: `${linePrefix}.vatRate`,
            message: 'Taxa de IVA deve estar entre 0 e 100',
            code: 'INVALID_VAT_RATE',
            severity: 'error',
          });
        }

        // VAT exemption validation - if VAT is 0, exemption reason is required
        if (line.vatRate === 0) {
          if (!line.vatExemptionReason && !(line as any).vatExemptionCode) {
            warnings.push({
              field: `${linePrefix}.vatExemptionReason`,
              message: 'Motivo de isenção de IVA é recomendado quando taxa é 0%',
              code: 'MISSING_VAT_EXEMPTION',
              severity: 'warning',
            });
          }
        }
      });
    }

    // 6. Totals validation
    if (!document.totals) {
      errors.push({
        field: 'totals',
        message: 'Totais do documento são obrigatórios',
        code: 'MISSING_TOTALS',
        severity: 'error',
      });
    } else {
      const totals = document.totals as any;
      
      // Validate totals are numbers
      if (typeof totals.subtotal !== 'number' || isNaN(totals.subtotal)) {
        errors.push({
          field: 'totals.subtotal',
          message: 'Subtotal deve ser um número válido',
          code: 'INVALID_SUBTOTAL',
          severity: 'error',
        });
      }

      if (typeof totals.total !== 'number' && typeof totals.grandTotal !== 'number') {
        errors.push({
          field: 'totals.total',
          message: 'Total do documento é obrigatório',
          code: 'MISSING_TOTAL',
          severity: 'error',
        });
      }

      // Validate VAT breakdown
      if (totals.vatBreakdown && Array.isArray(totals.vatBreakdown)) {
        totals.vatBreakdown.forEach((vb: any, index: number) => {
          if (typeof vb.rate !== 'number' || typeof vb.amount !== 'number' || typeof vb.base !== 'number') {
            warnings.push({
              field: `totals.vatBreakdown[${index}]`,
              message: 'Breakdown de IVA deve conter rate, base e amount válidos',
              code: 'INVALID_VAT_BREAKDOWN',
              severity: 'warning',
            });
          }
        });
      }
    }

    // 7. Payment validation
    if (!document.payment) {
      warnings.push({
        field: 'payment',
        message: 'Informação de pagamento é recomendada',
        code: 'MISSING_PAYMENT',
        severity: 'warning',
      });
    }

    // 8. Document type specific validations
    if (document.documentType === DocumentType.CREDIT_NOTE) {
      // Credit notes should reference an original invoice
      if (!document.relatedDocuments || document.relatedDocuments.length === 0) {
        warnings.push({
          field: 'relatedDocuments',
          message: 'Nota de crédito deve referenciar a factura original',
          code: 'MISSING_CREDIT_NOTE_REFERENCE',
          severity: 'warning',
        });
      }
    }

    // 9. Status validation - issued documents should not be in draft
    if (document.status === DocumentStatus.ACCEPTED) {
      // Additional validation for issued documents
      if (errors.length > 0) {
        errors.push({
          field: 'status',
          message: 'Documento emitido não pode conter erros de validação',
          code: 'ISSUED_WITH_ERRORS',
          severity: 'error',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate document before AGT submission
   */
  validateForAgtSubmission(document: IDocument): ValidationResult {
    const baseValidation = this.validateDocument(document);
    
    // Additional AGT-specific validations
    const agtErrors: ValidationError[] = [...baseValidation.errors];
    const agtWarnings: ValidationError[] = [...baseValidation.warnings];

    // Explicitly reject Proforma documents
    const docType = String(document.documentType);
    if (docType === DocumentType.PROFORMA || 
        docType === 'proforma' || 
        docType === 'pp') {
      agtErrors.push({
        field: 'documentType',
        message: 'Documentos do tipo Proforma não são comunicáveis à AGT.',
        code: 'INVALID_DOCUMENT_TYPE_AGT',
        severity: 'error'
      });
      return {
        isValid: false,
        errors: agtErrors,
        warnings: agtWarnings
      };
    }

    try {
      const year = new Date(document.issueDate).getFullYear();
      const type = document.documentType;
      const mapCode = (t: DocumentType | string): string => {
        switch (t) {
          case DocumentType.INVOICE:
          case 'factura': return 'FT';
          case DocumentType.INVOICE_RECEIPT:
          case 'factura_recibo': return 'FR';
          case DocumentType.RECEIPT:
          case 'recibo': return 'RC';
          case DocumentType.CREDIT_NOTE:
          case 'nota_de_credito': return 'NC';
          case DocumentType.DEBIT_NOTE:
          case 'nota_de_debito': return 'ND';
          case DocumentType.OTHER_RECEIPT:
          case 'outros_recibos': 
          case 'rg': 
          case DocumentType.AVISO_COBRANCA:
          case 'aviso_cobranca': 
          case 'ac': return 'RG';
          case DocumentType.DELIVERY_NOTE:
          case 'nota_de_entrega':
          case 'gr': return 'GR';
          case DocumentType.PROFORMA:
          case 'proforma':
          case 'pp': return 'PP';
          case DocumentType.REVERSAL_RECEIPT:
          case 'recibo_estorno':
          case 're': return 'RE';
          case DocumentType.PAYMENT_NOTICE_RECEIPT:
          case 'aviso_cobranca_recibo':
          case 'ar': return 'AR';
          default: return '';
        }
      };
      const code = mapCode(type);
      if (code) {
        let submissionMode = 'online';
        let contingencyOk = false;
        try {
          const path = require('path');
          const agtCfgPath = path.join(process.cwd(), 'data', 'agt_config.json');
          if (fs.existsSync(agtCfgPath)) {
            const agtCfg = JSON.parse(fs.readFileSync(agtCfgPath, 'utf-8') || '{}');
            submissionMode = agtCfg?.submissionMode || 'online';
            const cont = agtCfg?.contingencySeriesCodes?.[code]?.[String(year)];
            contingencyOk = !!(cont && String(cont).trim());
          }
        } catch {}
        try {
          const p = companyJsonPath();
          let authorized = '';
          if (fs.existsSync(p)) {
            const cfg = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}');
            authorized = cfg?.authorizedSeries?.[code]?.[String(year)] || '';
          }
          if (!authorized) {
            if (submissionMode === 'offline') {
              if (!contingencyOk) {
                agtErrors.push({
                  field: 'series',
                  message: `Série de contingência não configurada para ${code}/${year}. Solicite série de contingência.`,
                  code: 'MISSING_CONTINGENCY_SERIES',
                  severity: 'error',
                });
              } else {
                agtWarnings.push({
                  field: 'series',
                  message: `Modo offline: a série de contingência será utilizada para ${code}/${year}.`,
                  code: 'OFFLINE_USING_CONTINGENCY_SERIES',
                  severity: 'warning',
                });
              }
            } else {
              agtErrors.push({
                field: 'series',
                message: `Série AGT não autorizada para ${code}/${year}. Solicite série antes da submissão.`,
                code: 'MISSING_AUTHORIZED_SERIES',
                severity: 'error',
              });
            }
          }
        } catch {}
      }
    } catch {}

    // AGT requires seller to have complete information
    // Optional: city may não existir no modelo; já validamos address anteriormente.

    // AGT requires valid document hash
    if (!(document as any).hash) {
      agtWarnings.push({
        field: 'hash',
        message: 'Hash do documento será gerado automaticamente antes da submissão',
        code: 'MISSING_HASH',
        severity: 'warning',
      });
    }

    return {
      isValid: agtErrors.length === 0,
      errors: agtErrors,
      warnings: agtWarnings,
    };
  }

  /**
   * Quick validation (only critical errors)
   */
  quickValidate(document: Partial<IDocument>): boolean {
    if (!document.seller?.nif || !document.seller?.name) return false;
    if (!document.buyer?.name) return false;
    if (!document.series || !document.sequentialNumber) return false;
    if (!document.lines || document.lines.length === 0) return false;
    if (!document.totals) return false;
    return true;
  }
}

export default new DocumentValidationService();
