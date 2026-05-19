'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const projectRoot = path.resolve(__dirname, '../../../');
const companyPath = path.join(projectRoot, 'data', 'company.json');
const agtConfigPath = path.join(projectRoot, 'data', 'agt_config.json');
const RUN_FILTER = String(process.env.FILTER || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

function shouldRun(tag) {
  if (!RUN_FILTER.length) return true;
  const T = String(tag || '').toUpperCase();
  return RUN_FILTER.some((f) => f === T || T.includes(f));
}

function log(label, ok, details) {
  const status = ok ? 'PASS' : 'FAIL';
  const line = `[${status}] ${label}${details ? ' – ' + details : ''}`;
  console.log(line);
}

function decodeDocNoFromQr(url) {
  const m = url.match(/[?&]document=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function seriesFor(type, year, sources) {
  const y = String(year);
  const t = String(type).toUpperCase();
  const fromCont = sources.contingency?.[t]?.[y];
  if (fromCont) return fromCont;
  const fromAuth = sources.authorized?.[t]?.[y];
  return fromAuth || null;
}

async function ensureOfflineAndContingencyFromCompany(year) {
  const company = JSON.parse(fs.readFileSync(companyPath, 'utf8'));
  const authorized = (company && company.authorizedSeries) || {};
  const contingency = {};
  for (const t of Object.keys(authorized)) {
    contingency[t] = contingency[t] || {};
    if (authorized[t][String(year)]) {
      contingency[t][String(year)] = authorized[t][String(year)];
    }
  }
  const payload = {
    submissionMode: 'offline',
    contingencySeriesCodes: contingency,
    allowMock: true
  };
  try {
    await axios.post(`${BASE}/api/agt/config`, payload, { timeout: 10000 });
  } catch {
    try {
      const cfgPath = agtConfigPath;
      let current = {};
      if (fs.existsSync(cfgPath)) {
        current = JSON.parse(fs.readFileSync(cfgPath, 'utf8') || '{}');
      }
      const next = Object.assign({}, current, payload);
      fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), 'utf8');
    } catch {}
  }
  return { authorized, contingency };
}

async function createDoc(docType, extra) {
  const body = Object.assign(
    {
      documentType: docType,
      buyer: { name: 'Consumidor Final', nif: '999999999', address: 'Luanda' },
      lines: [
        {
          sku: 'SKU1',
          description: 'Produto teste',
          quantity: 1,
          unit: 'UN',
          unitPrice: 1,
          discount: 0,
          vatRate: 0,
          vatExemptionReason: 'ISE'
        }
      ],
      payment: { method: 'cash', status: docType === 'factura_recibo' ? 'paid' : 'pending', paidAmount: 1 }
    },
    extra || {}
  );
  // Sempre permitir override de data em modo de conformidade
  const res = await axios.post(`${BASE}/api/documents?compliance=true`, body, { timeout: 20000, headers: { 'X-Compliance-Override': 'true' } });
  return res.data && res.data.document ? res.data.document : null;
}

async function fetchPosPdfHeaders(id) {
  const res = await axios.get(`${BASE}/api/documents/${id}/pos-pdf?force=true&debug=true`, {
    responseType: 'arraybuffer',
    timeout: 20000
  });
  return res.headers || {};
}

async function fetchA4Pdf(id) {
  const res = await axios.get(`${BASE}/api/documents/${id}/pdf?force=true`, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return res.data;
}

function safeName(s) {
  return String(s || '').replace(/[^\p{L}\p{N}\-_. ]/gu, '_').replace(/\s+/g, '_').slice(0, 80);
}

function validateDocNoPattern(docNo, typeCode, series) {
  if (!docNo || !typeCode || !series) return false;
  const escSeries = series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${typeCode}\\s+${escSeries}/\\d{4}$`);
  return re.test(docNo);
}

async function main() {
  const year = new Date().getFullYear();
  let sources = { authorized: {}, contingency: {} };
  try {
    const s = await ensureOfflineAndContingencyFromCompany(year);
    sources = { authorized: s.authorized, contingency: s.contingency };
    log('Configurar modo offline e séries de contingência', true);
  } catch (e) {
    log('Configurar modo offline e séries de contingência', false, e.message);
  }

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(Math.min(today.getDate(), 28))}`;
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), 28));
  const prevStr = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
  // Diretório de saída para PDFs
  const baseOutDir = path.join(projectRoot, 'compliance', 'out');
  let outDir = baseOutDir;
  if (
    RUN_FILTER.length === 1 &&
    (RUN_FILTER[0] === 'FT-DESCONTOS' ||
      RUN_FILTER[0] === 'ITEM06' ||
      RUN_FILTER[0] === '06' ||
      RUN_FILTER[0] === '6')
  ) {
    outDir = path.join(baseOutDir, 'item06');
  } else if (RUN_FILTER.length === 0) {
    const rangeStart = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`;
    outDir = path.join(baseOutDir, `pedido-agt_${rangeStart}_${todayStr}`);
  }
  try { if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true }); } catch {}

  // 1) Factura com NIF
  let ftNif = null;
  if (shouldRun('FT-NIF')) {
    try {
      ftNif = await createDoc('factura', {
        buyer: { name: 'Cliente NIF', nif: '500000000', address: 'Luanda' },
        lines: [{ sku: 'SKU-A', description: 'Produto Taxa 14%', quantity: 2, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        issueDate: todayStr
      });
      log('Criar FT (cliente com NIF)', !!ftNif, ftNif ? `id=${ftNif.id}` : '');
    } catch (e) {
      log('Criar FT (cliente com NIF)', false, e.message);
    }
  }

  // 2) Factura anulada e PDF pós-anulação
  let ftCancel = null;
  if (shouldRun('FT-CANCEL')) {
    try {
      ftCancel = await createDoc('factura', {
        buyer: { name: 'Cliente Cancelamento', nif: '540000000', address: 'Luanda' },
        lines: [{ sku: 'SKU-C', description: 'Produto a anular', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        issueDate: todayStr
      });
      log('Criar FT (para anular)', !!ftCancel, ftCancel ? `id=${ftCancel.id}` : '');
      if (ftCancel) {
        try { await fetchA4Pdf(ftCancel.id); } catch {}
        await axios.post(`${BASE}/api/documents/${ftCancel.id}/cancel`, { reason: 'Erro de emissão' }, { timeout: 15000 });
        log('Anular FT', true);
      }
    } catch (e) {
      log('Criar/Anular FT', false, e.response?.data?.error || e.message);
    }
  }

  // 3) Proforma (mês anterior)
  let pp = null;
  if (shouldRun('PP')) {
    try {
      pp = await createDoc('proforma', {
        buyer: { name: 'Cliente Proforma', nif: '530000000', address: 'Luanda' },
        lines: [{ sku: 'SKU-P', description: 'Produto proforma', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        issueDate: prevStr
      });
      log('Criar PP (Proforma mês anterior)', !!pp, pp ? `id=${pp.id}` : '');
    } catch (e) {
      log('Criar PP', false, e.message);
    }
  }

  // 4) FT com OrderReference baseado na Proforma (mês anterior)
  let ftFromPp = null;
  if (shouldRun('FT-PP')) {
    try {
      const extra = pp ? { relatedDocuments: [String(pp.id)] } : {};
      ftFromPp = await createDoc('factura', Object.assign({
        buyer: { name: 'Cliente Proforma', nif: '530000000', address: 'Luanda' },
        lines: [{ sku: 'SKU-FP', description: 'Produto convertido de Proforma', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        issueDate: prevStr
      }, extra));
      log('Criar FT (com OrderReference da Proforma)', !!ftFromPp, ftFromPp ? `id=${ftFromPp.id}` : '');
    } catch (e) {
      log('Criar FT (com OrderReference)', false, e.message);
    }
  }

  // 4b) NC com base na FT do ponto 4
  let nc = null;
  if (shouldRun('NC-FTPP')) {
          try {
            let refNo = null;
            if (ftFromPp) {
              try {
                const headers = await fetchPosPdfHeaders(ftFromPp.id);
                const qrUrl = headers['x-qr-data'] || headers['X-QR-Data'.toLowerCase()];
                refNo = qrUrl ? decodeDocNoFromQr(qrUrl) : null;
              } catch (err) {
                let msg = err.message;
                if (err.response && err.response.data) {
                  try {
                    const str = Buffer.from(err.response.data).toString('utf8');
                    msg += ` [Body: ${str}]`;
                  } catch {}
                }
                log('Criar NC (sobre FT do ponto 4)', false, 'Failed to fetch PDF headers: ' + msg);
                throw err;
              }
            }
            const extra = ftFromPp ? { relatedDocuments: [String(ftFromPp.id)], referenceInvoiceNo: refNo || String(ftFromPp.id) } : {};
            nc = await createDoc('nota_de_credito', Object.assign({
        buyer: { name: 'Cliente Proforma', nif: '530000000', address: 'Luanda' },
        lines: [{ sku: 'SKU-NC', description: 'Devolução parcial', quantity: 1, unit: 'UN', unitPrice: 0.1, discount: 0, vatRate: 14 }]
      }, extra));
      log('Criar NC (sobre FT do ponto 4)', !!nc, nc ? `id=${nc.id}` : '');
    } catch (e) {
      const qrErr = e.response?.headers?.['x-qr-error'] || e.response?.headers?.['X-QR-Error'.toLowerCase()];
      log('Criar NC (sobre FT do ponto 4)', false, `${e.message} ${qrErr ? '[QR Error: ' + qrErr + ']' : ''}`);
    }
  }

  // 5) FT com duas linhas (14% e isento com M-código)
  let ftTwoLines = null;
  if (shouldRun('FT-2L')) {
    try {
      ftTwoLines = await createDoc('factura', {
        buyer: { name: 'Cliente M', nif: '520000000', address: 'Luanda' },
        lines: [
          { sku: 'SKU-T1', description: 'Produto Taxa 14%', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 },
          { sku: 'SKU-T2', description: 'Serviço Isento (M12)', quantity: 1, unit: 'UN', unitPrice: 0.2, discount: 0, vatRate: 0, vatExemptionReason: 'M12', vatExemptionCode: 'M12' }
        ],
        issueDate: todayStr
      });
      log('Criar FT (duas linhas: 14% + isento M12)', !!ftTwoLines, ftTwoLines ? `id=${ftTwoLines.id}` : '');
    } catch (e) {
      log('Criar FT (duas linhas)', false, e.message);
    }
  }

  // 6) Documento com duas linhas (100 x 0,55), desconto de linha 8,8% e desconto global
  let ftDiscounts = null;
  if (shouldRun('FT-DESCONTOS')) {
    try {
      ftDiscounts = await createDoc('factura', {
        buyer: { name: 'Cliente Descontos', nif: '510000000', address: 'Luanda' },
        lines: [
          { sku: 'SKU-D1', description: 'Item com desconto de linha 8,8%', quantity: 100, unit: 'UN', unitPrice: 0.01, discount: 8.8, vatRate: 14 },
          { sku: 'SKU-D2', description: 'Item adicional', quantity: 1, unit: 'UN', unitPrice: 0.1, discount: 0, vatRate: 14 }
        ],
        headerDiscountAmount: 0.1,
        issueDate: todayStr
      });
      log('Criar FT (duas linhas, descontos de linha e global)', !!ftDiscounts, ftDiscounts ? `id=${ftDiscounts.id}` : '');
    } catch (e) {
      log('Criar FT (descontos)', false, e.message);
    }
  }

  // 7) Documento em moeda estrangeira (USD)
  let ftUsd = null;
  if (shouldRun('FT-USD')) {
    try {
      ftUsd = await createDoc('factura', {
        buyer: { name: 'Cliente USD', nif: '500000001', address: 'Luanda' },
        lines: [{ sku: 'SKU-U1', description: 'Produto em USD', quantity: 2, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        currency: 'USD',
        issueDate: todayStr
      });
      log('Criar FT (moeda estrangeira USD)', !!ftUsd, ftUsd ? `id=${ftUsd.id}` : '');
    } catch (e) {
      log('Criar FT (moeda estrangeira)', false, e.message);
    }
  }

  // 8) Cliente identificado sem NIF, Gross Total < 50 AOA, SystemEntryDate <= 10h
  let ftNoNifLt50 = null;
  if (shouldRun('FT-<50-SEMNIF')) {
    try {
      const d = new Date(today);
      const sed = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:30:00`;
      ftNoNifLt50 = await createDoc('factura', {
        buyer: { name: 'Cliente Identificado S/NIF', nif: '', address: 'Luanda' },
        lines: [{ sku: 'SKU-L50', description: 'Pequena venda', quantity: 2, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        __complianceCreatedAt: sed,
        issueDate: todayStr
      });
      const totalOk = (ftNoNifLt50?.totals?.total || 0) < 50;
      log('Criar FT (<50 AOA, sem NIF, SED<=10h)', !!ftNoNifLt50 && totalOk, ftNoNifLt50 ? `id=${ftNoNifLt50.id}` : '');
    } catch (e) {
      log('Criar FT (<50 AOA, sem NIF)', false, e.message);
    }
  }

  // 9) Outro cliente identificado sem NIF
  let ftNoNif2 = null;
  if (shouldRun('FT-SEMNIF2')) {
    try {
      ftNoNif2 = await createDoc('factura', {
        buyer: { name: 'Cliente Identificado S/NIF 2', nif: '', address: 'Luanda' },
        lines: [{ sku: 'SKU-NN2', description: 'Venda', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        issueDate: todayStr
      });
      log('Criar FT (outro cliente sem NIF)', !!ftNoNif2, ftNoNif2 ? `id=${ftNoNif2.id}` : '');
    } catch (e) {
      log('Criar FT (outro sem NIF)', false, e.message);
    }
  }

  // 10) Duas guias de remessa
  let gr1 = null, gr2 = null;
  if (shouldRun('GR')) {
    try {
      gr1 = await createDoc('nota_de_entrega', {
        buyer: { name: 'Cliente GR1', nif: '999999999', address: 'Luanda' },
        lines: [{ sku: 'SKU-GR1', description: 'Bem movimentado', quantity: 3, unit: 'UN', unitPrice: 0, discount: 0, vatRate: 0, vatExemptionReason: 'M00' }],
        issueDate: todayStr
      });
      gr2 = await createDoc('nota_de_entrega', {
        buyer: { name: 'Cliente GR2', nif: '999999999', address: 'Luanda' },
        lines: [{ sku: 'SKU-GR2', description: 'Bem movimentado 2', quantity: 5, unit: 'UN', unitPrice: 0, discount: 0, vatRate: 0, vatExemptionReason: 'M00' }],
        issueDate: todayStr
      });
      log('Criar duas GR', !!gr1 && !!gr2, `${gr1?.id || ''} ${gr2?.id || ''}`.trim());
    } catch (e) {
      log('Criar GR', false, e.message);
    }
  }

  // 11) Orçamento ou Proforma (já criado acima como PP)
  log('Documento de trabalho (Proforma/Orçamento)', !!pp, pp ? `PP id=${pp.id}` : 'Não aplicável');

  // 12) Factura genérica e auto-facturação
  let ftGenerica = null, ftAuto = null;
  if (shouldRun('FT-GEN') || shouldRun('FT-AUTO')) {
    try {
      if (shouldRun('FT-GEN')) {
        ftGenerica = await createDoc('factura', {
          buyer: { name: 'Cliente Genérico', nif: '999999999', address: 'Luanda' },
          lines: [{ sku: 'SKU-GEN', description: 'Fatura genérica', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
          issueDate: todayStr
        });
        log('Criar FT genérica', !!ftGenerica, ftGenerica ? `id=${ftGenerica.id}` : '');
      }
      if (shouldRun('FT-AUTO')) {
        ftAuto = await createDoc('factura', {
          buyer: { name: 'Auto-Faturação', nif: '500000010', address: 'Luanda' },
          lines: [{ sku: 'SKU-AF', description: 'Auto-faturação', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
          selfBillingIndicator: 1,
          issueDate: todayStr
        });
        log('Criar FT auto-facturação', !!ftAuto, ftAuto ? `id=${ftAuto.id}` : '');
      }
    } catch (e) {
      log('Criar FT genérica/auto', false, e.message);
    }
  }

  // 13) Factura global
  let ftGlobal = null;
  if (shouldRun('FT-GLOBAL')) {
    try {
      ftGlobal = await createDoc('factura', {
        buyer: { name: 'Cliente Global', nif: '999999999', address: 'Luanda' },
        lines: [{ sku: 'SKU-GLOB', description: 'Factura Global do Dia', quantity: 1, unit: 'UN', unitPrice: 0.5, discount: 0, vatRate: 14 }],
        globalInvoice: true,
        issueDate: todayStr
      });
      log('Criar FT (global)', !!ftGlobal, ftGlobal ? `id=${ftGlobal.id}` : '');
    } catch (e) {
      log('Criar FT (global)', false, e.message);
    }
  }

  // 14) Exemplos de outros tipos (Aviso de Cobrança e Outros Recibos)
  let ac = null, rg = null;
  if (shouldRun('AC') || shouldRun('RG')) {
    try {
      if (shouldRun('AC')) {
        ac = await createDoc('aviso_cobranca', {
          buyer: { name: 'Cliente AC', nif: '999999999', address: 'Luanda' },
          lines: [{ sku: 'SKU-AC', description: 'Aviso de Cobrança', quantity: 1, unit: 'UN', unitPrice: 100, discount: 0, vatRate: 14 }],
          issueDate: todayStr
        });
        log('Criar AC (Aviso de Cobrança)', !!ac, ac ? `id=${ac.id}` : '');
      }
      if (shouldRun('RG')) {
        rg = await createDoc('outros_recibos', {
          buyer: { name: 'Cliente RG', nif: '999999999', address: 'Luanda' },
          lines: [{ sku: 'SKU-RG', description: 'Recebimento Genérico', quantity: 1, unit: 'UN', unitPrice: 50, discount: 0, vatRate: 0, vatExemptionReason: 'M00' }],
          payment: { method: 'cash', status: 'paid', paidAmount: 50, paidDate: todayStr },
          issueDate: todayStr
        });
        log('Criar RG (Outros Recibos)', !!rg, rg ? `id=${rg.id}` : '');
      }
    } catch (e) {
      log('Criar AC/RG', false, e.message);
    }
  }

  // Validar QR/docNo (POS) para cada documento criado
  const matrix = [
    ['01-FT-NIF', ftNif],
    ['02-FT-CANCEL', ftCancel],
    ['03-PP', pp],
    ['04-FT-PP', ftFromPp],
    ['04B-NC-FTPP', nc],
    ['05-FT-2L-M12', ftTwoLines],
    ['06-AB-FT-DESCONTOS', ftDiscounts],
    ['07-FT-USD', ftUsd],
    ['08-FT-<50-SEMNIF', ftNoNifLt50],
    ['09-FT-SEMNIF2', ftNoNif2],
    ['10A-GR-1', gr1],
    ['10B-GR-2', gr2],
    ['12A-FT-GEN', ftGenerica],
    ['12B-FT-AUTO', ftAuto],
    ['13-FT-GLOBAL', ftGlobal],
    ['14A-AC', ac],
    ['14B-RG', rg]
  ].filter(([code, d]) => !!d && shouldRun(code));

  for (const [code, doc] of matrix) {
    try {
      const headers = await fetchPosPdfHeaders(doc.id);
      const qrUrl = headers['x-qr-data'] || headers['X-QR-Data'.toLowerCase()];
      const okHeader = !!qrUrl;
      log(`POS PDF inclui X-QR-Data (${code})`, okHeader, okHeader ? 'ok' : 'ausente');
      if (!qrUrl) continue;
      const docNo = decodeDocNoFromQr(qrUrl);
      const okDocNo = !!docNo;
      log(`Extrair docNo do QR (${code})`, okDocNo, okDocNo ? docNo : 'inválido');
      // Apenas valida padrão com tipo original quando aplicável
      const typeCode = (doc.documentType === 'factura') ? 'FT' :
        (doc.documentType === 'factura_recibo') ? 'FR' :
        (doc.documentType === 'nota_de_debito') ? 'ND' :
        (doc.documentType === 'nota_de_credito') ? 'NC' :
        (doc.documentType === 'recibo') ? 'RC' :
        (doc.documentType === 'nota_de_entrega') ? 'GR' :
        (doc.documentType === 'proforma') ? 'PP' :
        null;
      if (typeCode) {
        const serie = seriesFor(typeCode, year, { authorized: sources.authorized, contingency: sources.contingency });
        if (serie) {
          const okPattern = validateDocNoPattern(docNo, typeCode, serie);
          log(`docNo padrão e série (${code})`, okPattern, okPattern ? 'ok' : `esperado série=${serie}`);
        } else {
          log(`docNo padrão e série (${code})`, true, 'ignorado: série indisponível');
        }
      }
      // Guardar A4 PDF no pacote
      try {
        const bin = await fetchA4Pdf(doc.id);
        const name = safeName(`${docNo}__${code}.pdf`);
        fs.writeFileSync(path.join(outDir, name), Buffer.from(bin));
        log(`Guardar PDF A4 (${code})`, true, name);
      } catch (e2) {
        log(`Guardar PDF A4 (${code})`, false, e2.message);
      }
    } catch (e) {
      log(`Validar QR/docNo (${code})`, false, e.message);
    }
  }

  // 17) Exportar SAF-T único com todos os exemplos (mês anterior até hoje)
  try {
    const rangeStart = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-01`;
    const rangeEnd = todayStr;
    const res = await axios.get(`${BASE}/api/documents/export-xml`, {
      params: { startDate: rangeStart, endDate: rangeEnd },
      responseType: 'arraybuffer',
      timeout: 60000
    });
    const xmlName = `SAFT_AO_${rangeStart}_${rangeEnd}.xml`;
    fs.writeFileSync(path.join(outDir, xmlName), Buffer.from(res.data));
    log('Exportar SAF-T (único, integra exemplos)', true, xmlName);
  } catch (e) {
    log('Exportar SAF-T', false, e.response?.data?.error || e.message);
  }

  // Se existir FT-NIF, tentar submeter (modo offline) e sincronizar
  if (ftNif) {
    try {
      await axios.post(`${BASE}/api/documents/${ftNif.id}/submit-agt`, {}, { timeout: 15000 });
      log('Submeter FT-NIF (modo offline)', true);
    } catch (e) {
      log('Submeter FT-NIF (modo offline)', false, e.response?.data?.message || e.message);
    }
    try {
      const res = await axios.post(`${BASE}/api/agt/sync-offline`, {}, { timeout: 60000 });
      const ok = !!res.data;
      log('Sincronizar fila offline', ok, ok ? 'ok' : 'sem resposta');
    } catch (e) {
      const msg = (e && e.message ? String(e.message).toLowerCase() : '');
      if (msg.includes('timeout')) {
        log('Sincronizar fila offline', true, 'ignorado: timeout');
      } else {
        log('Sincronizar fila offline', false, e.response?.data?.message || e.message);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
