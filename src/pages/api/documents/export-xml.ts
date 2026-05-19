import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import fs from 'fs';
import path from 'path';
import { companyJsonPath, companiesJsonPath, systemJsonPath } from '@/lib/dataPaths';
import { generateSaftXmlWithPython } from '@/services/AgtPythonService';
import crypto from 'crypto';
import { supplierStore } from '../../../lib/supplierStore';
import { validateSaftXml } from '@/services/SaftValidationService';

function padSequentialNumber(n: number): string {
  return n.toString().padStart(6, '0');
}

function escapeXml(value: any): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// SAF-T AO: Generic consumer must use NIF 999999999
function isGenericConsumerId(id: string): boolean {
  if (!id) return true; // treat empty as generic
  const norm = String(id).trim().toLowerCase();
  return norm === 'consumidor final' || norm === '999999999';
}

function getGenericConsumerTaxId(): string {
  return '999999999';
}

// Ensure software certificate follows AGT format NNN/AGT/YYYY or is '0'
function normalizeSoftwareCertificateNumber(cert: string): string {
  const c = String(cert || '').trim();
  // Allow varied formats like "FE/162/AGT/2026" or "162/AGT/2026"
  const pattern = /^.+\/AGT\/\d{4}$/;
  if (!c) return '0';
  if (c === '0') return '0';
  return pattern.test(c) ? c : '0';
}

function normalizeSoftwareValidationNumber(val: string): string {
  const c = String(val || '').trim();
  // Allow varied formats like "n31.1/AGT20" or "FE/162/AGT/2026"
  const pattern = /^.+\/AGT\/\d{2,4}$|^0$/;
  if (!c) return '0';
  return pattern.test(c) ? c : '0';
}

function normalizeHashControl(val: any): string {
  return '1';
}

// Sanitize a software/app or producer name to a safe subset
function sanitizeProductName(name: string): string {
  const s = String(name || '').trim();
  if (!s) return '';
  // Remove diacritics and slashes, collapse whitespace, and restrict to safe ASCII subset
  const base = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const noSlash = base.replace(/\//g, ' ');
  const collapsed = noSlash.replace(/\s+/g, ' ').trim();
  const safe = collapsed.replace(/[^A-Za-z0-9 .&'_-]/g, '');
  return safe;
}

// Normalize ProductID with optional forced ASCII sanitization
function normalizeProductId(raw: string, appFallback: string, producerFallback: string, forceAscii: boolean): string {
  let s = String(raw || '').trim();
  // Guardar: alguns configs errados usam número do certificado ("NNN/AGT/YYYY") como ProductID — invalidar nesses casos
  const looksLikeCert = /^\d{1,3}\/AGT\/\d{4}$/.test(s);
  if (looksLikeCert || s === '0/AGT/2020') {
    s = '';
  }
  const pattern = /^[^/]+\/[^/]+$/; // Exactly one slash: App/Producer
  if (!forceAscii && s && s.length <= 255 && pattern.test(s)) {
    // Accept only single-slash format compliant with XSD
    return s;
  }
  const parts = s.includes('/') ? s.split('/', 2) : [];
  const appSan = sanitizeProductName((parts[0] ?? appFallback));
  const prodSan = sanitizeProductName((parts[1] ?? producerFallback));
  const app = appSan || (sanitizeProductName(appFallback) || 'Prakash');
  const producer = prodSan || (sanitizeProductName(producerFallback) || 'Cacimbo Angola');
  let out = `${app}/${producer}`;
  if (out.length > 255) out = out.substring(0, 255);
  return out;
}

// Derive a safe product code when SKU is missing
function deriveProductCode(line: any): string {
  const rawSku = String(line?.sku ?? '').trim();
  if (rawSku) return rawSku;
  const desc = String(line?.description ?? '').trim();
  if (desc) {
    let slug = desc
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 30);
    if (!slug) slug = 'DESC';
    return `DESC_${slug}`;
  }
  return 'SKU_UNKNOWN';
}

// Ensure product description is not empty
function deriveProductDescription(line: any): string {
  const d = String(line?.description ?? '').trim();
  if (d) return d;
  const sku = String(line?.sku ?? '').trim();
  if (sku) return `Produto ${sku}`;
  return 'Produto';
}

function mapVatRateToAgtCode(vatRate: number): string {
  if (vatRate === 14) return 'NOR';
  if (vatRate === 7) return 'RED';
  if (vatRate === 0) return 'ISE';
  return 'NOR';
}

// Determina o código de imposto AGT para a linha, considerando razões de isenção
function getTaxCodeForLine(line: any): string {
  const rateNum = Number(line?.vatRate ?? 0);
  if (rateNum === 0) {
    const ex = String(line?.vatExemptionCode || line?.vatExemptionReason || '').trim().toUpperCase();
    // Se houver código/razão de isenção explícito, tratar como OUT; caso contrário ISE
    return ex ? 'OUT' : 'ISE';
  }
  return mapVatRateToAgtCode(rateNum);
}

// Map de códigos de isenção para descrição
const VAT_EXEMPTION_MAP: Record<string, string> = {
  M00: 'Regime Simplificado',
  M02: 'Transmissão de bens e serviço não sujeita',
  M04: 'Regime de Exclusão',
  M10: 'Bens alimentares (Anexo I do Código do IVA)',
  M11: 'Medicamentos de fins terapêuticos e profilácticos',
  M12: 'Cadeiras de rodas e equipamentos para pessoas com deficiência',
  M13: 'Livros (inclui formato digital)',
  M14: 'Locação de bens imóveis destinados a fins habitacionais',
  M15: 'Operações sujeitas ao imposto de SISA',
  M16: 'Exploração e prática de jogos de fortuna ou azar e diversão',
  M17: 'Transporte colectivo de passageiros',
  M18: 'Intermediação financeira (inclui locação financeira)',
  M19: 'Seguro de saúde e seguros/resseguros do ramo vida',
  M20: 'Transmissões de produtos petrolíferos (Anexo II do Código)',
  M21: 'Serviços de ensino por estabelecimentos reconhecidos',
  M22: 'Serviços médico-sanitários por estabelecimentos de saúde',
  M23: 'Transporte de doentes/feridos por entidades autorizadas',
  M24: 'Equipamentos médicos para actividade de saúde',
  M80: 'Importações definitivas de bens cuja transmissão seja isenta',
  M81: 'Importações de ouro, moedas ou notas pelo BNA',
  M82: 'Importações para atenuar efeitos de calamidades naturais',
  M83: 'Importações para operações petrolíferas e mineiras',
  M84: 'Importação de moeda estrangeira por instituições bancárias',
  M85: 'Tratados e acordos internacionais (nos termos previstos)',
  M86: 'Relações diplomáticas e consulares (tratados/acordos)',
  M30: 'Transmissões com destino ao estrangeiro',
  M31: 'Abastecimento a embarcações em alto mar',
  M32: 'Abastecimento a aeronaves em tráfego internacional',
  M33: 'Abastecimento a salvamento, pesca costeira e guerra (destino exterior)',
  M34: 'Transmissões/serviços para companhias aéreas/marítimas internacionais',
  M35: 'Relações diplomáticas e consulares (acordos internacionais)',
  M36: 'Organismos reconhecidos por Angola (acordos internacionais)',
  M37: 'Tratados e acordos internacionais (isenções decorrentes)',
  M38: 'Transporte de pessoas provenientes/destino ao estrangeiro',
};

// AO validator expects (N,S,A,R)
function mapDocumentStatusToAgt(status: string): string {
  switch (status) {
    case 'draft':
      return 'S';
    case 'accepted':
    case 'issued':
    case 'paid':
    case 'finalized':
      return 'N';
    case 'cancelled':
      return 'A';
    case 'rejected':
      return 'R';
    default:
      return 'N';
  }
}

function mapDocumentTypeToAgt(docType: string): string {
  // Expandable para outros tipos
  switch (docType) {
    case 'factura':
      return 'FT';
    case 'factura_recibo':
      return 'FR';
    case 'nota_de_credito':
      return 'NC';
    case 'nota_de_debito':
      return 'ND';
    case 'recibo':
      return 'RC';
    case 'nota_de_entrega':
      return 'GR';
    case 'orçamento':
      return 'OR';
    case 'proforma':
      return 'PP';
    case 'aviso_cobranca':
      return 'AC';
    case 'outros_recibos':
      return 'RG';
    case 'factura_generica':
      return 'GF';
    case 'factura_global':
      return 'FG';
    case 'factura_recibo_autofacturacao':
      return 'AF';
    case 'recibo_estorno':
      return 'RE';
    case 'factura_adiantamento':
      return 'FA';
    case 'aviso_cobranca_recibo':
      return 'AR';
    default:
      return 'FT';
  }
}

function formatDateOnly(dateLike: string | Date): string {
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  if (isNaN(d.getTime())) return String(dateLike);
  return d.toISOString().split('T')[0];
}

function formatDateTime(dateLike: string | Date): string {
  const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  if (isNaN(d.getTime())) return String(dateLike);
  const [date, time] = d.toISOString().split('T');
  // Ensure hh:mm:ss format without milliseconds and timezone
  return `${date}T${time.substring(0,8)}`;
}

function fmt2(n: number): string { return Number(n || 0).toFixed(2); }
function fmtQty(n: number): string { return Number(Math.abs(n || 0)).toFixed(3); }

// AGT Compliance: Rounding helper (Round Half Up)
function round(value: number, decimals: number = 2): number {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

// Generate a stable document hash to populate the Hash field (AO uses RSA-SHA1)
function generateDocumentHashAO(invoiceNo: string, invoiceDate: string, systemEntryDate: string, grossTotal: number, prevHash: string): string {
  try {
    const keyPath = path.join(process.cwd(), 'data', 'agt_keys', 'private.pem');
    let privateKey = '';
    if (fs.existsSync(keyPath)) {
      privateKey = fs.readFileSync(keyPath, 'utf-8');
    }
    
    if (!privateKey) {
       console.error("Missing Private Key for Signing!");
       // Fallback to SHA1 if no key (invalid for AGT but prevents crash)
       const payload = `${invoiceDate};${systemEntryDate};${invoiceNo};${fmt2(grossTotal)};${prevHash}`;
       return crypto.createHash('sha1').update(payload, 'utf8').digest('base64');
    }

    // Payload: Date;SystemEntryDate;DocNo;GrossTotal;PreviousHash
    const formattedDate = invoiceDate.includes('T') ? invoiceDate.split('T')[0] : invoiceDate;
    
    // Ensure systemEntryDate is in YYYY-MM-DDThh:mm:ss format (no ms, no Z)
    // Assuming input is already formatted by formatDateTime, but just to be safe:
    const sed = systemEntryDate; 

    const payload = `${formattedDate};${sed};${invoiceNo};${fmt2(grossTotal)};${prevHash}`;
    
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey, 'base64');
  } catch (e) {
    console.error("Hash generation failed:", e);
    return '';
  }
}

function mapPaymentMethodToMechanism(method?: string): string {
  const m = String(method || '').toLowerCase();
  if (m.includes('numer') || m.includes('cash')) return 'NU';
  if (m.includes('transf') || m.includes('bank')) return 'TR';
  if (m.includes('card') || m.includes('cart')) return 'CD';
  if (m.includes('cheq')) return 'CH';
  return 'NU'; // Fallback
}

function normalizeNif(nif: string): string {
  const digits = String(nif || '').replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return digits;
  return getGenericConsumerTaxId();
}

// Build SAF-T AO compliant XML (namespace urn:OECD:StandardAuditFile-Tax:AO_1.01_01)
function buildSaftXml(documents: any[], startDate: string, endDate: string, company: any): string {
  // Company info strictly from selected company config
  const companyName = company.name || company.tradeName || '';
  const businessName = company.tradeName || company.name || companyName;
  const companyId = normalizeNif(company.nif || '');
  const companyAddress = company.address || '';
  const companyCity = company.city || '';
  const companyTelephone = company.phone || company.telephone || '000000000';
  const companyFax = company.fax || '0000';
  const companyEmail = company.email || company.contactEmail || 'email@example.com';
  // Namespace per SAF-T AO spec
  const namespace = 'urn:OECD:StandardAuditFile-Tax:AO_1.01_01';
  // Software identification (prefer system config for validated program values)
  const productIdRaw = company.saftProductId || 'Prakash/Textiltec Soluções';
  const productCompanyTaxId = company.saftProductCompanyTaxId || companyId || '';
  const softwareValidationNumber = company.saftSoftwareValidationNumber && company.saftSoftwareValidationNumber !== '0' 
      ? company.saftSoftwareValidationNumber 
      : (company.saftSoftwareCertificateNumber && company.saftSoftwareCertificateNumber !== '0' ? company.saftSoftwareCertificateNumber : '0');
  
  // Validation: ProductID must be 'Product/Version' or 'Product/Company'
  const productId = normalizeProductId(
    productIdRaw,
    'Prakash',
    (company.saftProducerName || company.saftProductCompanyName || businessName || 'Textiltec Solucoes'),
    String(company.saftForceAsciiProductId || '0').trim() === '1'
  );
  
  const productVersion = company.saftProductVersion || '1.0.6';
  const hashControl = normalizeHashControl(company.saftHashControl);

  const header = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:OECD:StandardAuditFile-Tax:AO_1.01_01 SAF-T_AO.xsd">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${escapeXml(companyId)}</CompanyID>
    <TaxRegistrationNumber>${escapeXml(companyId)}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${escapeXml(companyName)}</CompanyName>
    <BusinessName>${escapeXml(businessName)}</BusinessName>
    <CompanyAddress>
      <BuildingNumber>${escapeXml(company.buildingNumber || '0')}</BuildingNumber>
      <StreetName>${escapeXml(companyAddress)}</StreetName>
      <AddressDetail>${escapeXml(companyAddress)}</AddressDetail>
      <City>${escapeXml(companyCity)}</City>
      <PostalCode>${escapeXml(company.postalCode || '0000')}</PostalCode>
      <Country>AO</Country>
    </CompanyAddress>
    <FiscalYear>${new Date(startDate).getFullYear()}</FiscalYear>
    <StartDate>${startDate}</StartDate>
    <EndDate>${endDate}</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${new Date().toISOString().split('T')[0]}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${escapeXml(productCompanyTaxId)}</ProductCompanyTaxID>
    <SoftwareValidationNumber>${escapeXml(softwareValidationNumber)}</SoftwareValidationNumber>
    <ProductID>${escapeXml(productId)}</ProductID>
    <ProductVersion>${escapeXml(productVersion)}</ProductVersion>
    <Telephone>${escapeXml(companyTelephone)}</Telephone>
    <Fax>${escapeXml(companyFax)}</Fax>
    <Email>${escapeXml(companyEmail)}</Email>
    <Website>${escapeXml(company.website || 'www.example.com')}</Website>
  </Header>`;


  // MasterFiles
  const customerMap = new Map<string, any>();
  const productMap = new Map<string, any>();
  const taxCodesUsed = new Set<string>();

  // Helper to collect master data
  const collectMasterData = (doc: any) => {
    const rawCustId = String(doc.buyer?.nif || '').trim();
    const custKey = rawCustId && !isGenericConsumerId(rawCustId) ? normalizeNif(rawCustId) : 'CONSUMIDOR_FINAL';
    if (!customerMap.has(custKey)) {
      customerMap.set(custKey, {
        id: custKey,
        name: doc.buyer?.name || 'Consumidor final',
        address: doc.buyer?.address || 'Desconhecido',
        buildingNumber: doc.buyer?.buildingNumber || 'Desconhecido',
        streetName: doc.buyer?.streetName || 'Desconhecido',
        postalCode: doc.buyer?.postalCode || '0000',
        city: doc.buyer?.city || companyCity || 'Luanda'
      });
    }
    (doc.lines || []).forEach((line: any) => {
      const unit = (line.unit || 'UN').toUpperCase();
      const code = deriveProductCode(line);
      const group = (line.category || 'GERAL').toString();
      if (!productMap.has(code)) {
        productMap.set(code, {
          code,
          description: deriveProductDescription(line),
          unit,
          group,
        });
      }
      taxCodesUsed.add(getTaxCodeForLine(line));
    });
  };

  // Sort function for all documents
  const sortDocs = (a: any, b: any) => {
    const typeA = mapDocumentTypeToAgt(a.documentType);
    const typeB = mapDocumentTypeToAgt(b.documentType);
    const seriesA = String(a.series || '').toUpperCase();
    const seriesB = String(b.series || '').toUpperCase();
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    if (seriesA !== seriesB) return seriesA.localeCompare(seriesB);
    const seqA = Number(a.sequentialNumber || 0);
    const seqB = Number(b.sequentialNumber || 0);
    return seqA - seqB;
  };

  // Split documents into categories
  const salesInvoiceDocs: any[] = [];
  const paymentDocs: any[] = [];
  const movementDocs: any[] = [];
  const workingDocs: any[] = [];

  documents.forEach(doc => {
    collectMasterData(doc);
    const type = mapDocumentTypeToAgt(doc.documentType);
    if (['FT', 'FR', 'NC', 'ND', 'VD', 'TV', 'AF'].includes(type)) {
      salesInvoiceDocs.push(doc);
    } else if (['RC', 'RG', 'RE'].includes(type)) {
      paymentDocs.push(doc);
    } else if (['GR'].includes(type)) {
      movementDocs.push(doc);
    } else if (['PP', 'OR'].includes(type)) {
      workingDocs.push(doc);
    } else {
      // Default to sales invoice if unknown but likely invoice, otherwise ignore
      if (type === 'FT') salesInvoiceDocs.push(doc);
    }
  });

  // Sort each group
  salesInvoiceDocs.sort(sortDocs);
  paymentDocs.sort(sortDocs);
  movementDocs.sort(sortDocs);
  workingDocs.sort(sortDocs);

  // Generate MasterFiles XML
  const customersXml = Array.from(customerMap.values()).map((c) => {
    const taxIdRaw = isGenericConsumerId(c.id) ? getGenericConsumerTaxId() : c.id;
    const taxId = normalizeNif(taxIdRaw);
    return (
      `      <Customer>\n        <CustomerID>${escapeXml(c.id)}</CustomerID>\n        <AccountID>${escapeXml(c.id)}</AccountID>\n        <CustomerTaxID>${escapeXml(taxId)}</CustomerTaxID>\n        <CompanyName>${escapeXml(c.name)}</CompanyName>\n        <BillingAddress>\n          <BuildingNumber>${escapeXml(c.buildingNumber)}</BuildingNumber>\n          <StreetName>${escapeXml(c.streetName)}</StreetName>\n          <AddressDetail>${escapeXml(c.address)}</AddressDetail>\n          <City>${escapeXml(c.city || 'Luanda')}</City>\n          <PostalCode>${escapeXml(c.postalCode || '0000')}</PostalCode>\n          <Country>AO</Country>\n        </BillingAddress>\n        <SelfBillingIndicator>0</SelfBillingIndicator>\n      </Customer>`
    );
  }).join('\n');

  const productsXml = Array.from(productMap.values()).map((p) => (
    `      <Product>\n        <ProductType>P</ProductType>\n        <ProductCode>${escapeXml(p.code)}</ProductCode>\n        <ProductGroup>${escapeXml(p.group)}</ProductGroup>\n        <ProductDescription>${escapeXml(p.description)}</ProductDescription>\n        <ProductNumberCode>${escapeXml(p.code)}</ProductNumberCode>\n      </Product>`
  )).join('\n');

  const suppliersXml = supplierStore.getAllSuppliers().map(s => (
    `      <Supplier>\n        <SupplierID>${escapeXml(s.id)}</SupplierID>\n        <AccountID>${escapeXml(s.id)}</AccountID>\n        <SupplierTaxID>${escapeXml(normalizeNif(s.nif))}</SupplierTaxID>\n        <CompanyName>${escapeXml(s.name)}</CompanyName>\n        <BillingAddress>\n          <AddressDetail>${escapeXml(s.address || 'Desconhecido')}</AddressDetail>\n          <City>${escapeXml((s as any).city || 'Luanda')}</City>\n          <Country>AO</Country>\n        </BillingAddress>\n        <SelfBillingIndicator>0</SelfBillingIndicator>\n      </Supplier>`
  )).join('\n');

  const taxTableXmlFinal = Array.from(taxCodesUsed.values()).sort().map((code) => {
    const amount = code === 'NOR' ? 14 : code === 'RED' ? 7 : 0;
    const desc = code === 'NOR' ? 'Normal' : code === 'RED' ? 'Reduzida' : (code === 'OUT' ? 'IVA - Regime de Exclusão' : 'Transmissão de bens e serviços não sujeita');
    return `      <TaxTableEntry>\n        <TaxType>IVA</TaxType>\n        <TaxCode>${code}</TaxCode>\n        <Description>${desc}</Description>\n        <TaxAmount>${Number(amount).toFixed(4)}</TaxAmount>\n      </TaxTableEntry>`;
  }).join('\n') || [
    '      <TaxTableEntry>\n        <TaxType>IVA</TaxType>\n        <TaxCode>NOR</TaxCode>\n        <Description>Normal</Description>\n        <TaxAmount>14.0000</TaxAmount>\n      </TaxTableEntry>',
    '      <TaxTableEntry>\n        <TaxType>IVA</TaxType>\n        <TaxCode>RED</TaxCode>\n        <Description>Reduzida</Description>\n        <TaxAmount>7.0000</TaxAmount>\n      </TaxTableEntry>',
    '      <TaxTableEntry>\n        <TaxType>IVA</TaxType>\n        <TaxCode>OUT</TaxCode>\n        <Description>IVA - Regime de Exclusão</Description>\n        <TaxAmount>0.0000</TaxAmount>\n      </TaxTableEntry>',
  ].join('\n');

  const masterFiles = `\n  <MasterFiles>\n${customersXml ? customersXml + '\n' : ''}${suppliersXml ? suppliersXml + '\n' : ''}${productsXml ? productsXml + '\n' : ''}    <TaxTable>\n${taxTableXmlFinal}\n    </TaxTable>\n  </MasterFiles>`;

  // Reference map
  const byId = new Map<string, any>();
  documents.forEach(d => { if (d?.id) byId.set(String(d.id), d); });

  // Shared Hash Map
  const prevHashMap = new Map<string, string>();

  // --- SalesInvoices ---
  let salesInvoicesXml = '';
  let siTotalDebit = 0;
  let siTotalCredit = 0;
  if (salesInvoiceDocs.length > 0) {
    salesInvoicesXml = salesInvoiceDocs.map((doc) => {
      const period = new Date(doc.issueDate).getMonth() + 1;
      const isCreditNote = String(doc.documentType) === 'nota_de_credito';
      
      let referenceText = (doc.originalInvoiceNo || doc.referenceInvoiceNo || doc.reference || (doc.corrects?.invoiceNo) || '') as string;
      if (isCreditNote && !referenceText) {
        const refId = Array.isArray(doc.relatedDocuments) && doc.relatedDocuments.length ? String(doc.relatedDocuments[0]) : '';
        const refDoc = refId ? byId.get(refId) : undefined;
        if (refDoc) {
          const refType = mapDocumentTypeToAgt(refDoc.documentType);
          const refSeries = String(refDoc.series || '').trim().toUpperCase() || 'FT';
          referenceText = `${refType} ${refSeries}/${refDoc.sequentialNumber}`;
        }
      }

      let netTotalNum = 0;
      let taxPayableNum = 0;
      let debitSum = 0;
      let creditSum = 0;

      const linesXml = (doc.lines || []).map((line: any, idx: number) => {
        const settlementAmountNum = line.discount > 0 ? round(line.quantity * line.unitPrice * line.discount / 100) : 0;
        const unit = (line.unit || 'UN').toUpperCase();
        const baseAmount = round((line.quantity * line.unitPrice) - settlementAmountNum);
        const baseAmountAbs = Math.abs(baseAmount);
        const taxAmount = line.vatRate > 0 ? round(baseAmount * (line.vatRate / 100)) : 0;
        
        netTotalNum += baseAmount;
        taxPayableNum += taxAmount;
        if (isCreditNote) debitSum += baseAmountAbs; else creditSum += baseAmountAbs;

        const pCode = deriveProductCode(line);
        const pDesc = deriveProductDescription(line);
        const qtyStr = fmtQty(line.quantity);
        const amountTag = isCreditNote ? 'DebitAmount' : 'CreditAmount'; // NC usually has DebitAmount in lines? Actually usually CreditAmount if it's reducing sales?
        // SAF-T AO: 
        // Invoice: CreditAmount (Sales)
        // NC: DebitAmount (Reduction of Sales) - YES.
        
        const taxXml = `        <Tax>\n          <TaxType>IVA</TaxType>\n          <TaxCountryRegion>AO</TaxCountryRegion>\n          <TaxCode>${getTaxCodeForLine(line)}</TaxCode>\n          <TaxPercentage>${getTaxCodeForLine(line) === 'NOR' ? '14.0000' : (getTaxCodeForLine(line) === 'RED' ? '7.0000' : '0.0000')}</TaxPercentage>\n        </Tax>\n`;
        const exCodeRaw = String(line.vatExemptionCode || line.vatExemptionReason || '').toUpperCase();
        const exCode = /^M\d{2}$/.test(exCodeRaw) ? exCodeRaw : 'M00';
        const exReason = VAT_EXEMPTION_MAP[exCode] || 'Regime Simplificado';
        
        const lineReferencesXml = ((isCreditNote && referenceText))
          ? `        <References>\n          <Reference>${escapeXml(referenceText)}</Reference>\n        </References>\n`
          : '';

        return `      <Line>\n        <LineNumber>${idx + 1}</LineNumber>\n        <ProductCode>${escapeXml(pCode)}</ProductCode>\n        <ProductDescription>${escapeXml(pDesc)}</ProductDescription>\n        <Quantity>${qtyStr}</Quantity>\n        <UnitOfMeasure>${escapeXml(unit)}</UnitOfMeasure>\n        <UnitPrice>${fmt2(line.unitPrice)}</UnitPrice>\n        <TaxPointDate>${escapeXml(formatDateOnly(doc.taxableDate || doc.issueDate))}</TaxPointDate>\n${lineReferencesXml}        <Description>${escapeXml(pDesc)}</Description>\n        <${amountTag}>${fmt2(baseAmountAbs)}</${amountTag}>\n${taxXml}${(['OUT','ISE'].includes(getTaxCodeForLine(line)) ? `        <TaxExemptionReason>${escapeXml(exReason || 'Regime Simplificado')}</TaxExemptionReason>\n        <TaxExemptionCode>${escapeXml(exCode || 'M00')}</TaxExemptionCode>\n` : '')}\n      </Line>`;
      }).join('\n');

      let dtNet = isCreditNote ? Math.abs(netTotalNum) : netTotalNum;
      let dtTax = isCreditNote ? Math.abs(taxPayableNum) : taxPayableNum;
      let dtGross = round(dtNet + dtTax);

      // OVERRIDE with stored totals to ensure consistency with Hash generation (repair-saft.js)
      if (doc.totals) {
          const tNet = Number(doc.totals.subtotal || doc.totals.net || dtNet);
          const tTax = Number(doc.totals.vatTotal || doc.totals.tax || dtTax);
          const tGross = Number(doc.totals.total || doc.totals.grandTotal || dtGross);

          // Ensure positive values for NC (SAF-T requires positive amounts for Debit/Credit fields)
          dtNet = isCreditNote ? Math.abs(tNet) : tNet;
          dtTax = isCreditNote ? Math.abs(tTax) : tTax;
          dtGross = isCreditNote ? Math.abs(tGross) : tGross;
      }

      const statusAgt = mapDocumentStatusToAgt(doc.status || 'draft');
      const isCancelledOrRejected = statusAgt === 'A' || statusAgt === 'F';
      
      if (!isCancelledOrRejected) {
        if (isCreditNote) {
           // NC implies Debit (Reduction of debt/sales)
           siTotalDebit = Number((siTotalDebit + dtGross).toFixed(2));
        } else {
           // FT implies Credit (Increase of debt/sales)
           siTotalCredit = Number((siTotalCredit + dtGross).toFixed(2));
        }
      }

      const rawBuyerId = String(doc.buyer?.nif || '').trim();
      const invoiceCustomerId = rawBuyerId && !isGenericConsumerId(rawBuyerId) ? normalizeNif(rawBuyerId) : 'CONSUMIDOR_FINAL';
      const isSelfBilling = (doc as any).selfBillingIndicator === 1;
      let invoiceType = mapDocumentTypeToAgt(doc.documentType);
      if (isSelfBilling && (invoiceType === 'FR' || invoiceType === 'FT')) invoiceType = 'AF';

      const seriesCode = String(doc.series || '').trim().toUpperCase() || 'FT';
      const invoiceNo = `${invoiceType} ${seriesCode}/${doc.sequentialNumber}`;
      const year = new Date(doc.issueDate).getFullYear();
      const chainKey = `${invoiceType}-${year}-${seriesCode}`;
      
      const prevHash = prevHashMap.get(chainKey) || '';
      const hash = doc.hash || generateDocumentHashAO(invoiceNo, formatDateOnly(doc.issueDate), formatDateTime(doc.createdAt || doc.issueDate), dtGross, prevHash);
      prevHashMap.set(chainKey, hash);

      const shipToAddress = escapeXml(doc.buyer?.address || 'Desconhecido');
      const shipToCity = escapeXml(doc.buyer?.city || companyCity || 'Luanda');
      const shipFromAddress = escapeXml(doc.seller?.address || companyAddress || 'Desconhecido');
      const shipFromCity = escapeXml(doc.seller?.city || companyCity || 'Luanda');

      const headerDisc = Number((doc as any).headerDiscountAmount || 0);
      const settlementXml = headerDisc > 0
        ? `\n        <Settlement>\n          <SettlementAmount>${fmt2(headerDisc)}</SettlementAmount>\n        </Settlement>`
        : '';
      const sourceBilling = (doc as any).isManual ? 'M' : 'P';
      const manualRef = (doc as any).manualBlockReference ? ` [Bloco: ${(doc as any).manualBlockReference}]` : '';

      return `    <Invoice>\n      <InvoiceNo>${invoiceNo}</InvoiceNo>\n      <DocumentStatus>\n        <InvoiceStatus>${escapeXml(statusAgt)}</InvoiceStatus>\n        <InvoiceStatusDate>${escapeXml(formatDateTime(doc.createdAt))}</InvoiceStatusDate>\n        <SourceID>SYSTEM</SourceID>\n        <SourceBilling>${sourceBilling}</SourceBilling>\n      </DocumentStatus>\n      <Hash>${escapeXml(hash)}</Hash>\n      <HashControl>${escapeXml(hashControl)}</HashControl>\n      <Period>${period}</Period>\n      <InvoiceDate>${escapeXml(formatDateOnly(doc.issueDate))}</InvoiceDate>\n      <InvoiceType>${escapeXml(invoiceType)}</InvoiceType>\n      <SpecialRegimes>\n        <SelfBillingIndicator>${isSelfBilling ? 1 : 0}</SelfBillingIndicator>\n        <CashVATSchemeIndicator>0</CashVATSchemeIndicator>\n        <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>\n      </SpecialRegimes>\n      <SourceID>SYSTEM</SourceID>\n      <SystemEntryDate>${escapeXml(formatDateTime(doc.createdAt))}</SystemEntryDate>\n      <CustomerID>${escapeXml(invoiceCustomerId)}</CustomerID>\n      <ShipTo>\n        <Address>\n          <AddressDetail>${shipToAddress}</AddressDetail>\n          <City>${shipToCity}</City>\n          <Country>AO</Country>\n        </Address>\n      </ShipTo>\n      <ShipFrom>\n        <Address>\n          <AddressDetail>${shipFromAddress}</AddressDetail>\n          <City>${shipFromCity}</City>\n          <Country>AO</Country>\n        </Address>\n      </ShipFrom>\n${linesXml}\n      <DocumentTotals>\n        <TaxPayable>${fmt2(dtTax)}</TaxPayable>\n        <NetTotal>${fmt2(dtNet)}</NetTotal>\n        <GrossTotal>${fmt2(dtGross)}</GrossTotal>${settlementXml}\n      </DocumentTotals>\n    </Invoice>`;
    }).join('\n');
  }

  // --- Payments ---
  let paymentsXml = '';
  let payTotalDebit = 0;
  let payTotalCredit = 0;
  if (paymentDocs.length > 0) {
    // Deduplicate payments based on generated PaymentRefNo
    const uniquePaymentDocs = [];
    const seenPayRefs = new Set();
    
    for (const doc of paymentDocs) {
        const type = mapDocumentTypeToAgt(doc.documentType);
        const seriesCode = String(doc.series || '').trim().toUpperCase() || 'RC';
        const payNo = `${type} ${seriesCode}/${doc.sequentialNumber}`;
        if (!seenPayRefs.has(payNo)) {
            seenPayRefs.add(payNo);
            uniquePaymentDocs.push(doc);
        }
    }

    paymentsXml = uniquePaymentDocs.map((doc) => {
      const period = new Date(doc.issueDate).getMonth() + 1;
      const type = mapDocumentTypeToAgt(doc.documentType); // RC, RG, RE
      const seriesCode = String(doc.series || '').trim().toUpperCase() || 'RC';
      const payNo = `${type} ${seriesCode}/${doc.sequentialNumber}`;
      
      const year = new Date(doc.issueDate).getFullYear();
      const chainKey = `${type}-${year}-${seriesCode}`;
      
      // Calculate total from totals or lines?
      // Receipts in this system usually have no lines, but have 'totals'
      const docTotal = (doc.totals?.total || doc.totals?.grandTotal || 0);
      const grossTotal = Number(docTotal);
      
      const prevHash = prevHashMap.get(chainKey) || '';
      const hash = doc.hash || generateDocumentHashAO(payNo, formatDateOnly(doc.issueDate), formatDateTime(doc.createdAt || doc.issueDate), grossTotal, prevHash);
      prevHashMap.set(chainKey, hash);

      const statusAgt = mapDocumentStatusToAgt(doc.status || 'draft');
      const isCancelled = statusAgt === 'A';

      if (!isCancelled) {
          // Receipts (RC) use CreditAmount (Reducing customer debt) -> Add to TotalCredit
          // Estornos (RE) use DebitAmount (Increasing customer debt/reversal) -> Add to TotalDebit
          if (type === 'RE') payTotalDebit += grossTotal;
          else payTotalCredit += grossTotal;
      }

      const rawBuyerId = String(doc.buyer?.nif || '').trim();
      const customerId = rawBuyerId && !isGenericConsumerId(rawBuyerId) ? normalizeNif(rawBuyerId) : 'CONSUMIDOR_FINAL';
      
      const method = mapPaymentMethodToMechanism(doc.paymentMethod);
      
      // Build Lines for Payment
      let linesXml = '';
      if (doc.lines && doc.lines.length > 0) {
         linesXml = doc.lines.map((line: any, idx: number) => {
             const relId = line.relatedDocumentId || (doc.relatedDocuments && doc.relatedDocuments[0]);
             const relDoc = relId ? byId.get(relId) : undefined;
             const relNo = relDoc ? `${mapDocumentTypeToAgt(relDoc.documentType)} ${relDoc.series}/${relDoc.sequentialNumber}` : (relId || payNo);
             const relDate = relDoc ? formatDateOnly(relDoc.issueDate) : formatDateOnly(doc.issueDate);
             const lineAmount = line.total || line.amount || 0;
             return `      <Line>\n        <LineNumber>${idx + 1}</LineNumber>\n        <SourceDocumentID>\n          <OriginatingON>${escapeXml(relNo)}</OriginatingON>\n          <InvoiceDate>${escapeXml(relDate)}</InvoiceDate>\n        </SourceDocumentID>\n        <SettlementAmount>${fmt2(0)}</SettlementAmount>\n        <${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>${fmt2(lineAmount)}</${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>\n      </Line>`;
         }).join('\n');
      } else if (doc.relatedDocuments && doc.relatedDocuments.length > 0) {
        // Only create ONE line for the total amount, referencing the first document
        // to avoid duplicating the amount for each related document.
        const relId = doc.relatedDocuments[0];
        const relDoc = byId.get(relId);
        const relNo = relDoc ? `${mapDocumentTypeToAgt(relDoc.documentType)} ${relDoc.series}/${relDoc.sequentialNumber}` : relId;
        const relDate = relDoc ? formatDateOnly(relDoc.issueDate) : formatDateOnly(doc.issueDate);
        linesXml = `      <Line>\n        <LineNumber>1</LineNumber>\n        <SourceDocumentID>\n          <OriginatingON>${escapeXml(relNo)}</OriginatingON>\n          <InvoiceDate>${escapeXml(relDate)}</InvoiceDate>\n        </SourceDocumentID>\n        <SettlementAmount>${fmt2(0)}</SettlementAmount>\n        <${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>${fmt2(grossTotal)}</${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>\n      </Line>`;
      } else {
        // Fallback line
        linesXml = `      <Line>\n        <LineNumber>1</LineNumber>\n        <SourceDocumentID>\n          <OriginatingON>${escapeXml(payNo)}</OriginatingON>\n          <InvoiceDate>${escapeXml(formatDateOnly(doc.issueDate))}</InvoiceDate>\n        </SourceDocumentID>\n        <SettlementAmount>0.00</SettlementAmount>\n        <${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>${fmt2(grossTotal)}</${type === 'RE' ? 'DebitAmount' : 'CreditAmount'}>\n      </Line>`;
      }

      return `    <Payment>\n      <PaymentRefNo>${payNo}</PaymentRefNo>\n      <Period>${period}</Period>\n      <TransactionDate>${escapeXml(formatDateOnly(doc.issueDate))}</TransactionDate>\n      <PaymentType>${type}</PaymentType>\n      <Description>${type === 'RE' ? 'Estorno' : 'Pagamento'}</Description>\n      <SystemID>${escapeXml(doc.id)}</SystemID>\n      <DocumentStatus>\n        <PaymentStatus>${statusAgt}</PaymentStatus>\n        <PaymentStatusDate>${escapeXml(formatDateTime(doc.createdAt))}</PaymentStatusDate>\n        <SourceID>SYSTEM</SourceID>\n        <SourcePayment>P</SourcePayment>\n      </DocumentStatus>\n      <PaymentMethod>\n        <PaymentMechanism>${method}</PaymentMechanism>\n        <PaymentAmount>${fmt2(grossTotal)}</PaymentAmount>\n        <PaymentDate>${escapeXml(formatDateOnly(doc.issueDate))}</PaymentDate>\n      </PaymentMethod>\n      <SourceID>SYSTEM</SourceID>\n      <SystemEntryDate>${escapeXml(formatDateTime(doc.createdAt))}</SystemEntryDate>\n      <CustomerID>${escapeXml(customerId)}</CustomerID>\n${linesXml}\n      <DocumentTotals>\n        <TaxPayable>0.00</TaxPayable>\n        <NetTotal>${fmt2(grossTotal)}</NetTotal>\n        <GrossTotal>${fmt2(grossTotal)}</GrossTotal>\n      </DocumentTotals>\n    </Payment>`;
    }).join('\n');
  }

  // Construct SourceDocuments
  let sourceDocuments = '\n  <SourceDocuments>';
  
  if (salesInvoicesXml) {
    sourceDocuments += `\n    <SalesInvoices>\n      <NumberOfEntries>${salesInvoiceDocs.length}</NumberOfEntries>\n      <TotalDebit>${fmt2(siTotalDebit)}</TotalDebit>\n      <TotalCredit>${fmt2(siTotalCredit)}</TotalCredit>\n${salesInvoicesXml}\n    </SalesInvoices>`;
  }
  
  // --- MovementOfGoods ---
  let movementOfGoodsXml = '';
  let movementTotalQty = 0;
  let movementTotalLines = 0;
  if (movementDocs.length > 0) {
    movementOfGoodsXml = movementDocs.map((doc) => {
      const period = new Date(doc.issueDate).getMonth() + 1;
      const type = mapDocumentTypeToAgt(doc.documentType); // GR
      const seriesCode = String(doc.series || '').trim().toUpperCase() || 'GR';
      const docNo = `${type} ${seriesCode}/${doc.sequentialNumber}`;
      
      const year = new Date(doc.issueDate).getFullYear();
      const chainKey = `${type}-${year}-${seriesCode}`;
      
      // For GR, we usually hash with total 0 if no value, but SAF-T says Hash calculation depends on data.
      // GR usually has no value in SAF-T context (it's qty based), but Hash requires a value?
      // SAFT AO: Hash input includes "GrossTotal". For GR, GrossTotal is 0.00 usually?
      // Let's assume GrossTotal from doc if available, else 0.
      const docTotal = (doc.totals?.total || doc.totals?.grandTotal || 0);
      const grossTotal = Number(docTotal);

      const prevHash = prevHashMap.get(chainKey) || '';
      const hash = doc.hash || generateDocumentHashAO(docNo, formatDateOnly(doc.issueDate), formatDateTime(doc.createdAt || doc.issueDate), grossTotal, prevHash);
      prevHashMap.set(chainKey, hash);

      const statusAgt = mapDocumentStatusToAgt(doc.status || 'draft');
      const isCancelled = statusAgt === 'A';

      const rawBuyerId = String(doc.buyer?.nif || '').trim();
      const customerId = rawBuyerId && !isGenericConsumerId(rawBuyerId) ? normalizeNif(rawBuyerId) : 'CONSUMIDOR_FINAL';

      const linesXml = (doc.lines || []).map((line: any, idx: number) => {
        const qty = Number(line.quantity || 0);
        if (!isCancelled) movementTotalQty += qty;
        movementTotalLines++;
        
        const pCode = deriveProductCode(line);
        const pDesc = deriveProductDescription(line);
        const unit = (line.unit || 'UN').toUpperCase();
        
        return `      <Line>\n        <LineNumber>${idx + 1}</LineNumber>\n        <ProductCode>${escapeXml(pCode)}</ProductCode>\n        <ProductDescription>${escapeXml(pDesc)}</ProductDescription>\n        <Quantity>${fmtQty(qty)}</Quantity>\n        <UnitOfMeasure>${escapeXml(unit)}</UnitOfMeasure>\n        <UnitPrice>${fmt2(line.unitPrice)}</UnitPrice>\n        <Description>${escapeXml(pDesc)}</Description>\n        <CreditAmount>${fmt2(line.total || 0)}</CreditAmount>\n      </Line>`;
      }).join('\n');

      const shipToAddress = escapeXml(doc.buyer?.address || 'Desconhecido');
      const shipToCity = escapeXml(doc.buyer?.city || companyCity || 'Luanda');
      const shipFromAddress = escapeXml(doc.seller?.address || companyAddress || 'Desconhecido');
      const shipFromCity = escapeXml(doc.seller?.city || companyCity || 'Luanda');
      const movementTime = formatDateTime(doc.issueDate); // Approximation

      return `    <StockMovement>\n      <DocumentNumber>${docNo}</DocumentNumber>\n      <DocumentStatus>\n        <MovementStatus>${statusAgt}</MovementStatus>\n        <MovementStatusDate>${escapeXml(formatDateTime(doc.createdAt))}</MovementStatusDate>\n        <SourceID>SYSTEM</SourceID>\n        <SourceBilling>P</SourceBilling>\n      </DocumentStatus>\n      <Hash>${escapeXml(hash)}</Hash>\n      <HashControl>${escapeXml(normalizeHashControl(company.saftHashControl))}</HashControl>\n      <Period>${period}</Period>\n      <MovementDate>${escapeXml(formatDateOnly(doc.issueDate))}</MovementDate>\n      <MovementType>${type}</MovementType>\n      <SystemEntryDate>${escapeXml(formatDateTime(doc.createdAt))}</SystemEntryDate>\n      <CustomerID>${escapeXml(customerId)}</CustomerID>\n      <SourceID>SYSTEM</SourceID>\n      <EACCode>${escapeXml(doc.eacCode || '')}</EACCode>\n      <MovementComments>${escapeXml(doc.notes || '')}</MovementComments>\n      <ShipTo>\n        <Address>\n          <AddressDetail>${shipToAddress}</AddressDetail>\n          <City>${shipToCity}</City>\n          <Country>AO</Country>\n        </Address>\n      </ShipTo>\n      <ShipFrom>\n        <Address>\n          <AddressDetail>${shipFromAddress}</AddressDetail>\n          <City>${shipFromCity}</City>\n          <Country>AO</Country>\n        </Address>\n      </ShipFrom>\n      <MovementStartTime>${movementTime}</MovementStartTime>\n${linesXml}\n      <DocumentTotals>\n        <TaxPayable>0.00</TaxPayable>\n        <NetTotal>${fmt2(grossTotal)}</NetTotal>\n        <GrossTotal>${fmt2(grossTotal)}</GrossTotal>\n      </DocumentTotals>\n    </StockMovement>`;
    }).join('\n');
  }
  
  // --- WorkingDocuments ---
  let workingDocumentsXml = '';
  let wdTotalDebit = 0;
  let wdTotalCredit = 0;
  if (workingDocs.length > 0) {
    workingDocumentsXml = workingDocs.map((doc) => {
      const period = new Date(doc.issueDate).getMonth() + 1;
      const type = mapDocumentTypeToAgt(doc.documentType); // PP, OR
      const seriesCode = String(doc.series || '').trim().toUpperCase() || 'WD';
      const docNo = `${type} ${seriesCode}/${doc.sequentialNumber}`;
      
      const year = new Date(doc.issueDate).getFullYear();
      const chainKey = `${type}-${year}-${seriesCode}`;
      
      const docTotal = (doc.totals?.total || doc.totals?.grandTotal || 0);
      const grossTotal = Number(docTotal);

      const prevHash = prevHashMap.get(chainKey) || '';
      const hash = doc.hash || generateDocumentHashAO(docNo, formatDateOnly(doc.issueDate), formatDateTime(doc.createdAt || doc.issueDate), grossTotal, prevHash);
      prevHashMap.set(chainKey, hash);

      const statusAgt = mapDocumentStatusToAgt(doc.status || 'draft');
      const isCancelled = statusAgt === 'A';
      
      if (!isCancelled) {
          // Working documents usually considered Credit (Sales intent)
          wdTotalCredit += grossTotal;
      }

      const rawBuyerId = String(doc.buyer?.nif || '').trim();
      const customerId = rawBuyerId && !isGenericConsumerId(rawBuyerId) ? normalizeNif(rawBuyerId) : 'CONSUMIDOR_FINAL';

      const linesXml = (doc.lines || []).map((line: any, idx: number) => {
        const qty = Number(line.quantity || 0);
        const pCode = deriveProductCode(line);
        const pDesc = deriveProductDescription(line);
        const unit = (line.unit || 'UN').toUpperCase();
        const baseAmount = (line.quantity * line.unitPrice);
        const taxAmount = line.vatRate > 0 ? baseAmount * (line.vatRate / 100) : 0;
        
        const taxXml = `        <Tax>\n          <TaxType>IVA</TaxType>\n          <TaxCountryRegion>AO</TaxCountryRegion>\n          <TaxCode>${getTaxCodeForLine(line)}</TaxCode>\n          <TaxPercentage>${getTaxCodeForLine(line) === 'NOR' ? '14.0000' : (getTaxCodeForLine(line) === 'RED' ? '7.0000' : '0.0000')}</TaxPercentage>\n        </Tax>\n`;
        
        return `      <Line>\n        <LineNumber>${idx + 1}</LineNumber>\n        <ProductCode>${escapeXml(pCode)}</ProductCode>\n        <ProductDescription>${escapeXml(pDesc)}</ProductDescription>\n        <Quantity>${fmtQty(qty)}</Quantity>\n        <UnitOfMeasure>${escapeXml(unit)}</UnitOfMeasure>\n        <UnitPrice>${fmt2(line.unitPrice)}</UnitPrice>\n        <TaxPointDate>${escapeXml(formatDateOnly(doc.taxableDate || doc.issueDate))}</TaxPointDate>\n        <Description>${escapeXml(pDesc)}</Description>\n        <CreditAmount>${fmt2(baseAmount)}</CreditAmount>\n${taxXml}      </Line>`;
      }).join('\n');

      return `    <WorkDocument>\n      <DocumentNumber>${docNo}</DocumentNumber>\n      <DocumentStatus>\n        <WorkStatus>${statusAgt}</WorkStatus>\n        <WorkStatusDate>${escapeXml(formatDateTime(doc.createdAt))}</WorkStatusDate>\n        <SourceID>SYSTEM</SourceID>\n        <SourceBilling>P</SourceBilling>\n      </DocumentStatus>\n      <Hash>${escapeXml(hash)}</Hash>\n      <HashControl>${escapeXml(normalizeHashControl(company.saftHashControl))}</HashControl>\n      <Period>${period}</Period>\n      <WorkDate>${escapeXml(formatDateOnly(doc.issueDate))}</WorkDate>\n      <WorkType>${type}</WorkType>\n      <SourceID>SYSTEM</SourceID>\n      <SystemEntryDate>${escapeXml(formatDateTime(doc.createdAt))}</SystemEntryDate>\n      <CustomerID>${escapeXml(customerId)}</CustomerID>\n${linesXml}\n      <DocumentTotals>\n        <TaxPayable>${fmt2(grossTotal - (grossTotal / 1.14)) /* Rough approx if tax not calculated separately */}</TaxPayable>\n        <NetTotal>${fmt2(grossTotal)}</NetTotal>\n        <GrossTotal>${fmt2(grossTotal)}</GrossTotal>\n      </DocumentTotals>\n    </WorkDocument>`;
    }).join('\n');
  }

  if (movementOfGoodsXml) {
    sourceDocuments += `\n    <MovementOfGoods>\n      <NumberOfMovementLines>${movementTotalLines}</NumberOfMovementLines>\n      <TotalQuantityIssued>${fmtQty(movementTotalQty)}</TotalQuantityIssued>\n${movementOfGoodsXml}\n    </MovementOfGoods>`;
  }
  
  if (workingDocumentsXml) {
    sourceDocuments += `\n    <WorkingDocuments>\n      <NumberOfEntries>${workingDocs.length}</NumberOfEntries>\n      <TotalDebit>${fmt2(wdTotalDebit)}</TotalDebit>\n      <TotalCredit>${fmt2(wdTotalCredit)}</TotalCredit>\n${workingDocumentsXml}\n    </WorkingDocuments>`;
  }
  
  if (paymentsXml) {
    sourceDocuments += `\n    <Payments>\n      <NumberOfEntries>${paymentDocs.length}</NumberOfEntries>\n      <TotalDebit>${fmt2(payTotalDebit)}</TotalDebit>\n      <TotalCredit>${fmt2(payTotalCredit)}</TotalCredit>\n${paymentsXml}\n    </Payments>`;
  }

  sourceDocuments += '\n  </SourceDocuments>';

  return `${header}${masterFiles}${sourceDocuments}\n</AuditFile>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { startDate, endDate, companyId: companyIdParam } = req.query as { startDate?: string; endDate?: string; companyId?: string };

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing startDate or endDate' });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Get all documents
    const allDocuments = documentStore.getAllDocuments();
    
    // Filter by date
    let filteredDocs = allDocuments.filter(doc => {
      const d = new Date(doc.issueDate);
      return d >= start && d <= end;
    });

    // Remove duplicates based on ID
    const seenIds = new Set();
    filteredDocs = filteredDocs.filter(doc => {
      if (seenIds.has(doc.id)) return false;
      seenIds.add(doc.id);
      return true;
    });

    // Sort documents by Type, Series, Number to ensure Hash chaining and Sequential checks
    filteredDocs.sort((a, b) => {
        if (a.documentType !== b.documentType) return a.documentType.localeCompare(b.documentType);
        if (a.series !== b.series) return (a.series || '').localeCompare(b.series || '');
        return (a.sequentialNumber || 0) - (b.sequentialNumber || 0);
    });

    // Get company config
    let cfg: any = {};
    const companiesPath = companiesJsonPath();
    if (companyIdParam && fs.existsSync(companiesPath)) {
        const raw = fs.readFileSync(companiesPath, 'utf-8');
        const list = JSON.parse(raw);
        cfg = list.find((c: any) => c.id === companyIdParam) || {};
    }
    if (!cfg.nif) {
        const activePath = companyJsonPath();
        if (fs.existsSync(activePath)) {
            cfg = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
        }
    }

    const xml = buildSaftXml(filteredDocs, startDate, endDate, cfg);
    
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="SAFT_AO_${startDate}_${endDate}.xml"`);
    res.status(200).send(xml);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to generate XML' });
  }
}
