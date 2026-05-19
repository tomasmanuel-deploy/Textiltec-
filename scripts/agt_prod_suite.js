const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const axios = require('axios');

function b64url(obj) {
  const canonical = (v) => {
    const sort = (x) => {
      if (x === null || typeof x !== 'object') return x;
      if (Array.isArray(x)) return x.map(sort);
      const o = {};
      Object.keys(x).sort().forEach(k => { o[k] = sort(x[k]); });
      return o;
    };
    return JSON.stringify(sort(v));
  };
  const s = typeof obj === 'string' ? obj : canonical(obj);
  return Buffer.from(s).toString('base64url');
}

function signJws(header, payload, key) {
  const data = b64url(header) + '.' + b64url(payload);
  const s = crypto.createSign('RSA-SHA256');
  s.update(data);
  s.end();
  let keyObj = key;
  try {
    if (typeof key === 'string' || Buffer.isBuffer(key)) {
      keyObj = crypto.createPrivateKey({ key, format: 'pem' });
    }
  } catch {}
  const sig = s.sign(keyObj, 'base64url');
  return data + '.' + sig;
}

function decodeJws(jws) {
  try {
    const [h, p] = String(jws).split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return { header, payload };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

function nowIsoZ() {
  return new Date().toISOString().substring(0,19) + 'Z';
}

async function main() {
  const logDir = path.resolve('data/audit_logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `agt_prod_suite_${Date.now()}.jsonl`);
  const log = (obj) => fs.appendFileSync(logPath, JSON.stringify(obj) + '\n', 'utf8');

  const cfgPath = path.resolve('data/agt_config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const argv = process.argv.slice(2);
  const getArg = (k) => {
    const p = argv.find(a => a.startsWith(`--${k}=`));
    return p ? p.split('=').slice(1).join('=') : undefined;
  };
  const only = getArg('only') || '';
  const run = (name) => !only || only === name;
  const docOverride = getArg('doc') || '';
  const reqOverride = getArg('req') || '';
  const startRange = getArg('start') || '';
  const endRange = getArg('end') || '';
  const csvOut = getArg('csv') || '';
  const periodSpec = getArg('period') || '';
  const base = (getArg('url') || process.env.AGT_URL || cfg.agtRestUrl || 'https://sifp.minfin.gov.ao/sigt/fe/v1').replace(/\/$/, '');
  const user = getArg('user') || process.env.AGT_USER || cfg.agtUsername || cfg.nif || '';
  const pass = getArg('pass') || process.env.AGT_PASS || cfg.agtPassword || '';
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const fingerprintPath = path.resolve('data/agt_keys/public.sha256.base64.txt');
  const fingerprint = fs.existsSync(fingerprintPath) ? fs.readFileSync(fingerprintPath, 'utf8').trim() : undefined;
  const issuerKeyPath = (cfg.issuerPrivateKeyPath && fs.existsSync(cfg.issuerPrivateKeyPath))
    ? cfg.issuerPrivateKeyPath
    : path.resolve('data/agt_keys/private.pem');
  const softwareKeyPath = (cfg.softwarePrivateKeyPath && fs.existsSync(cfg.softwarePrivateKeyPath))
    ? cfg.softwarePrivateKeyPath
    : (fs.existsSync(path.resolve('data/agt_keys/software_private.pem')) ? path.resolve('data/agt_keys/software_private.pem') : issuerKeyPath);
  const key = fs.readFileSync(issuerKeyPath);
  const swKey = fs.readFileSync(softwareKeyPath);
  const nif = getArg('nif') || process.env.AGT_NIF || cfg.companyNif || (() => {
    try {
      const company = JSON.parse(fs.readFileSync(path.resolve('data/company.json'), 'utf8'));
      return company.nif;
    } catch { return ''; }
  })();

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    minVersion: 'TLSv1',
    ciphers: 'DEFAULT@SECLEVEL=0'
  });
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${auth}`,
    ...(fingerprint ? {'X-Software-Key-Id': fingerprint} : {})
  };
  const swInfoDetail = {
    productId: 'PRAKASH SOFTWARE',
    productVersion: '1.0.6',
    softwareValidationNumber: cfg.softwareCertificateNumber || '0'
  };
  const jwsSoftwareSignature = signJws({ alg: 'RS256', typ: 'JOSE', ...(fingerprint? { kid: fingerprint } : {}) }, swInfoDetail, swKey);
  const softwareInfo = { softwareInfoDetail: swInfoDetail, jwsSoftwareSignature };

  const year = String(new Date().getFullYear());
  const est = 'SEDE';

  // Helpers
  const { execFileSync } = require('child_process');
  const reqHeader = { alg: 'RS256', typ: 'JOSE' };
  const post = async (endpoint, payload, label) => {
    try {
      // Two quick retries before curl fallback
      const axiosOpts = { headers, httpsAgent, timeout: 8000 };
      let res;
      try {
        res = await axios.post(`${base}/${endpoint}`, payload, axiosOpts);
      } catch (e1) {
        await new Promise(r => setTimeout(r, 500));
        res = await axios.post(`${base}/${endpoint}`, payload, axiosOpts);
      }
      log({ endpoint, label, ok: true, status: res.status, data: res.data });
      console.log(`OK ${endpoint} ${label}:`, JSON.stringify(res.data).slice(0, 500));
      return res.data;
    } catch (e) {
      // Axios falhou: tentar fallback com curl
      try {
        const args = [
          '-sS',
          '-k',
          '-u', `${user}:${pass}`,
          '-H', 'Content-Type: application/json',
          '-H', 'Accept: application/json',
          '-m', '20',
          '-X', 'POST',
          `${base}/${endpoint}`,
          '-d', JSON.stringify(payload)
        ];
        if (fingerprint) {
          args.splice(8, 0, '-H', `X-Software-Key-Id: ${fingerprint}`);
        }
        const out = execFileSync('curl', args, { encoding: 'utf8' });
        let parsed;
        try { parsed = JSON.parse(out); } catch { parsed = out; }
        log({ endpoint, label, ok: typeof parsed === 'object', status: typeof parsed === 'object' ? 200 : 'n/a', data: parsed });
        console.log(`CURL ${endpoint} ${label}:`, String(out).slice(0, 500));
        return typeof parsed === 'object' ? parsed : null;
      } catch (curlErr) {
        const stat = e.response?.status;
        const data = e.response?.data || e.message;
        log({ endpoint, label, ok: false, status: stat, error: data });
        console.log(`ERR ${endpoint} ${label}:`, JSON.stringify(data).slice(0, 500));
        return null;
      }
    }
  };

  // 0a) registarFR (Factura/Recibo) com série ativa
  if (run('registarFR')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarFR');
    let frSeries = undefined;
    try {
      const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
      frSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FR' && (s.seriesStatus || '') === 'A');
    } catch {}
    if (!frSeries) {
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: 'FR',
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      const req = { ...basePayload, jwsSignature: signJws(reqHeader, signSet, key) };
      await post('solicitarSerie', req, 'solicitarSerie-FR');
      const seriesAgain = await post('listarSeries', listarPayload, 'listarSeries-after-solicitar-FR');
      const list = (seriesAgain && (seriesAgain.seriesInfo || seriesAgain.seriresInfo)) || [];
      frSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FR' && (s.seriesStatus || '') === 'A');
    }
    if (!frSeries) {
      log({ endpoint: 'registarFactura', label: 'no-fr-series', ok: false, status: 'n/a', error: 'Nenhuma série FR ativa encontrada' });
    } else {
      const seriesCode = frSeries.seriesCode;
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const docNo = `FR ${seriesCode}/0001`;
      const doc = {
        documentNo: docNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'FR',
        invoiceType: 'FR',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} 1`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Servico Teste',
            productType: 'P',
              debitAmount: 1000,
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ]
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          totalCredit: 1000,
          totalDebit: 0,
          currencyCode: 'AOA'
        },
        withholdingTaxList: [],
        shipTo: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        shipFrom: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        movementEndTime: sysdt,
        movementStartTime: sysdt
      };
      const hashData = `uuid-${seriesCode}-1-1140`;
      doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
      const docSignSet = {
        documentNo: doc.documentNo,
        taxRegistrationNumber: nif,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        customerTaxID: doc.customerTaxID,
        customerCountry: doc.customerCountry,
        companyName: doc.companyName,
        documentTotals: {
          taxPayable: Number(doc.documentTotals.taxPayable),
          netTotal: Number(doc.documentTotals.netTotal),
          grossTotal: Number(doc.documentTotals.grossTotal)
        }
      };
      doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
      const regPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [doc]
      };
      regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
      const regResp = await post('registarFactura', regPayload, `registarFactura-${docNo}`);
      const requestID = regResp && (regResp.requestID || regResp.successRequestID);
      if (requestID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(requestID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
      }
    }
  }

  // 0b) registarNC (Nota de Crédito) a referenciar FT criada
  if (run('registarNC')) {
    // descobrir séries FT e NC ativas e construir docNo‑ref da FT
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarNC');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    let ncSeries = list.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    if (!ncSeries) {
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: 'NC',
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      const req = { ...basePayload, jwsSignature: signJws(reqHeader, signSet, key) };
      await post('solicitarSerie', req, 'solicitarSerie-NC');
      const seriesAgain = await post('listarSeries', listarPayload, 'listarSeries-after-solicitar-NC');
      const list2 = (seriesAgain && (seriesAgain.seriesInfo || seriesAgain.seriresInfo)) || [];
      ncSeries = list2.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    }
    if (!ftSeries || !ncSeries) {
      log({ endpoint: 'registarFactura', label: 'missing-series-for-NC', ok: false, status: 'n/a', error: 'Séries FT/NC ativas não encontradas' });
    } else {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      // Criar FT /0003 fresca para evitar conflitos com NC/recebimentos prévios
      const ftRefSeq = '0003';
      const ftDocRef = `FT ${ftSeries.seriesCode}/${ftRefSeq}`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 3`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 1000,
              unitPriceBase: 1000,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 1000,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 140
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 140,
            netTotal: 1000,
            grossTotal: 1140,
            totalDebit: 1000,
            totalCredit: 0,
            currencyCode: 'AOA'
          },
          withholdingTaxList: [],
          shipTo: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
          shipFrom: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
          movementEndTime: sysdt,
          movementStartTime: sysdt
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-3-1140`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      const ncDocNo = `NC ${ncSeries.seriesCode}/0001`;
      const doc = {
        documentNo: ncDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'NC',
        invoiceType: 'NC',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${ncSeries.seriesCode} 1`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Devolução Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Devolução',
            productType: 'P',
            // Para NC usamos debitAmount para cumprir regra E16/E17
            debitAmount: 1000,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ],
            referenceInfo: {
              reference: ftDocRef,
              reason: 'Devolução',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          totalDebit: 1000,
          totalCredit: 0,
          currencyCode: 'AOA'
        },
        withholdingTaxList: [],
        shipTo: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        shipFrom: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        movementEndTime: sysdt,
        movementStartTime: sysdt
      };
      const hashData = `uuid-${ncSeries.seriesCode}-1-1140`;
      doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
      const docSignSet = {
        documentNo: doc.documentNo,
        taxRegistrationNumber: nif,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        customerTaxID: doc.customerTaxID,
        customerCountry: doc.customerCountry,
        companyName: doc.companyName,
        documentTotals: {
          taxPayable: Number(doc.documentTotals.taxPayable),
          netTotal: Number(doc.documentTotals.netTotal),
          grossTotal: Number(doc.documentTotals.grossTotal)
        }
      };
      doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
      const regPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [doc]
      };
      regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
      const regResp = await post('registarFactura', regPayload, `registarFactura-${ncDocNo}`);
      const requestID = regResp && (regResp.requestID || regResp.successRequestID);
      if (requestID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(requestID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
      }
    }
  }

  // 0c) registarND (Nota de Débito) a referenciar FT criada
  if (run('registarND')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarND');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    let ndSeries = list.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    if (!ndSeries) {
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: 'ND',
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      const req = { ...basePayload, jwsSignature: signJws(reqHeader, signSet, key) };
      await post('solicitarSerie', req, 'solicitarSerie-ND');
      const seriesAgain = await post('listarSeries', listarPayload, 'listarSeries-after-solicitar-ND');
      const list2 = (seriesAgain && (seriesAgain.seriesInfo || seriesAgain.seriresInfo)) || [];
      ndSeries = list2.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    }
    if (!ftSeries || !ndSeries) {
      log({ endpoint: 'registarFactura', label: 'missing-series-for-ND', ok: false, status: 'n/a', error: 'Séries FT/ND ativas não encontradas' });
    } else {
      const seriesCode = ndSeries.seriesCode;
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const ftDocRef = `FT ${ftSeries.seriesCode}/0001`;
      const ndDocNo = `ND ${seriesCode}/0001`;
      const doc = {
        documentNo: ndDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'ND',
        invoiceType: 'ND',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} 1`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Acréscimo Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Acréscimo',
            productType: 'P',
            creditAmount: 1000,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ],
            referenceInfo: {
              reference: ftDocRef,
              reason: 'Acréscimo',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          currencyCode: 'AOA'
        },
        withholdingTaxList: [],
        shipTo: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
        shipFrom: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
        movementEndTime: sysdt,
        movementStartTime: sysdt
      };
      const hashData = `uuid-${seriesCode}-1-1140`;
      doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
      const docSignSet = {
        documentNo: doc.documentNo,
        taxRegistrationNumber: nif,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        customerTaxID: doc.customerTaxID,
        customerCountry: doc.customerCountry,
        companyName: doc.companyName,
        documentTotals: {
          taxPayable: Number(doc.documentTotals.taxPayable),
          netTotal: Number(doc.documentTotals.netTotal),
          grossTotal: Number(doc.documentTotals.grossTotal)
        }
      };
      doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
      const regPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [doc]
      };
      regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
      const regResp = await post('registarFactura', regPayload, `registarFactura-${ndDocNo}`);
      const requestID = regResp && (regResp.requestID || regResp.successRequestID);
      if (requestID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(requestID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
      }
    }
  }

  // 0d) registarRC (Recibo) para a FT criada (sem lines; com paymentReceipt)
  if (run('registarRC')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarRC');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    let rcSeries = list.find(s => (s.documentType || '').toUpperCase() === 'RC' && (s.seriesStatus || '') === 'A');
    if (!rcSeries) {
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: 'RC',
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      const req = { ...basePayload, jwsSignature: signJws(reqHeader, signSet, key) };
      await post('solicitarSerie', req, 'solicitarSerie-RC');
      const seriesAgain = await post('listarSeries', listarPayload, 'listarSeries-after-solicitar-RC');
      const list2 = (seriesAgain && (seriesAgain.seriesInfo || seriesAgain.seriresInfo)) || [];
      rcSeries = list2.find(s => (s.documentType || '').toUpperCase() === 'RC' && (s.seriesStatus || '') === 'A');
    }
    if (!ftSeries || !rcSeries) {
      log({ endpoint: 'registarFactura', label: 'missing-series-for-RC', ok: false, status: 'n/a', error: 'Séries FT/RC ativas não encontradas' });
    } else {
      const seriesCode = rcSeries.seriesCode;
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      // Criar FT /0002 para servir de documento de origem do recibo (evitar E41 caso a /0001 já esteja regularizada por NC)
      const ftRefSeq = '0002';
      const ftDocRef = `FT ${ftSeries.seriesCode}/${ftRefSeq}`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 2`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 1000,
              unitPriceBase: 1000,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 1000,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 140
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 140,
            netTotal: 1000,
            grossTotal: 1140,
            currencyCode: 'AOA'
          },
          withholdingTaxList: [],
          shipTo: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
          shipFrom: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
          movementEndTime: sysdt,
          movementStartTime: sysdt
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-2-1140`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      // Montar recibo: sem lines; com paymentReceipt a referenciar FT
      // Para evitar E41, usar pagamento igual ao net da fatura (ex.: 1000)
      const gross = 1000;
      const rcDocNo = `RC ${seriesCode}/0001`;
      const doc = {
        documentNo: rcDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'RC',
        invoiceType: 'RC',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} 1`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        withholdingTaxList: [],
        shipTo: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
        shipFrom: { address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' } },
        movementEndTime: sysdt,
        movementStartTime: sysdt,
        paymentReceipt: {
          sourceDocuments: [
            {
              lineNo: '1',
              sourceDocumentID: {
                originatingON: ftDocRef,
                documentDate: ymd
              },
              debitAmount: String(gross)
            }
          ]
        },
        documentTotals: {
          taxPayable: 0,
          netTotal: gross,
          grossTotal: gross,
          settlementAmount: String(gross),
          paymentMechanism: 'NU',
          currencyCode: 'AOA'
        }
      };
      const hashData = `uuid-${seriesCode}-1-${gross}`;
      doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
      const docSignSet = {
        documentNo: doc.documentNo,
        taxRegistrationNumber: nif,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        customerTaxID: doc.customerTaxID,
        customerCountry: doc.customerCountry,
        companyName: doc.companyName,
        documentTotals: {
          taxPayable: Number(doc.documentTotals.taxPayable),
          netTotal: Number(doc.documentTotals.netTotal),
          grossTotal: Number(doc.documentTotals.grossTotal)
        }
      };
      doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
      const regPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [doc]
      };
      regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
      const regResp = await post('registarFactura', regPayload, `registarFactura-${rcDocNo}`);
      const requestID = regResp && (regResp.requestID || regResp.successRequestID);
      if (requestID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(requestID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
      }
    }
  }
  // 0) registarFactura (criar FT mínimo com série ativa)
  if (run('registarFactura')) {
    // obter série FT ativa
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registar');
    let ftSeries = undefined;
    try {
      const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
      ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    } catch {}
    if (!ftSeries) {
      // caso não exista, solicitar uma FT
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: 'FT',
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      const req = { ...basePayload, jwsSignature: signJws(reqHeader, signSet, key) };
      const sol = await post('solicitarSerie', req, 'solicitarSerie-FT');
      // tentar listar novamente
      const seriesAgain = await post('listarSeries', listarPayload, 'listarSeries-after-solicitar-FT');
      const list = (seriesAgain && (seriesAgain.seriesInfo || seriesAgain.seriresInfo)) || [];
      ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    }
    if (!ftSeries) {
      log({ endpoint: 'registarFactura', label: 'no-ft-series', ok: false, status: 'n/a', error: 'Nenhuma série FT ativa encontrada' });
    } else {
      const seriesCode = ftSeries.seriesCode;
      // construir documento mínimo
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      // formato do número: "<DT> <SERIE>/NNNN". A série devolvida já inclui o tipo (ex.: FT7926S29030N).
      // Remover o prefixo do tipo para evitar duplicar, deixando "7926S29030N".
      const docNo = `FT ${seriesCode}/0001`;
      const doc = {
        documentNo: docNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'FT',
        invoiceType: 'FT',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} 1`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Servico Teste',
            productType: 'P',
            creditAmount: 1000,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ]
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          currencyCode: 'AOA'
        },
        withholdingTaxList: [],
        shipTo: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        shipFrom: {
          address: { addressDetail: 'Luanda', city: 'Luanda', postalCode: '00000', country: 'AO' }
        },
        movementEndTime: sysdt,
        movementStartTime: sysdt
      };
      // hash simples (compatível com gerador legado)
      const hashData = `uuid-${seriesCode}-1-1140`;
      doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
      // assinatura do documento (sem kid)
      const docSignSet = {
        documentNo: doc.documentNo,
        taxRegistrationNumber: nif,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        customerTaxID: doc.customerTaxID,
        customerCountry: doc.customerCountry,
        companyName: doc.companyName,
        documentTotals: {
          taxPayable: Number(doc.documentTotals.taxPayable),
          netTotal: Number(doc.documentTotals.netTotal),
          grossTotal: Number(doc.documentTotals.grossTotal)
        }
      };
      doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
      // payload de registo
      const regPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [doc]
      };
      regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
      const regResp = await post('registarFactura', regPayload, `registarFactura-${docNo}`);
      // obterEstado se houver requestID
      const requestID = regResp && (regResp.requestID || regResp.successRequestID);
      if (requestID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(requestID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
      }
    }
  }

  // 0e) registarRCParcial (dois RCs parciais para a mesma FT)
  if (run('registarRCParcial')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarRCParcial');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const rcSeries = list.find(s => (s.documentType || '').toUpperCase() === 'RC' && (s.seriesStatus || '') === 'A');
    if (!ftSeries || !rcSeries) {
      log({ endpoint: 'registarFactura', label: 'missing-series-for-RCParcial', ok: false, status: 'n/a', error: 'Séries FT/RC ativas não encontradas' });
    } else {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const ftDocRef = `FT ${ftSeries.seriesCode}/0004`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 4`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 1000,
              unitPriceBase: 1000,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 1000,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 140
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 140,
            netTotal: 1000,
            grossTotal: 1140,
            currencyCode: 'AOA'
          }
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-4-1140`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      const doRC = async (seq, amount) => {
        const seriesCode = rcSeries.seriesCode;
        const rcDocNo = `RC ${seriesCode}/${seq}`;
        const doc = {
          documentNo: rcDocNo,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'RC',
          invoiceType: 'RC',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} ${Number(seq)}`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          withholdingTaxList: [],
          paymentReceipt: {
            sourceDocuments: [
              {
                lineNo: '1',
                sourceDocumentID: {
                  originatingON: ftDocRef,
                  documentDate: ymd
                },
                debitAmount: String(amount)
              }
            ]
          },
          documentTotals: {
            taxPayable: 0,
            netTotal: amount,
            grossTotal: amount,
            settlementAmount: String(amount),
            paymentMechanism: 'NU',
            currencyCode: 'AOA'
          }
        };
        const hashData = `uuid-${seriesCode}-${Number(seq)}-${amount}`;
        doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
        const docSignSet = {
          documentNo: doc.documentNo,
          taxRegistrationNumber: nif,
          documentType: doc.documentType,
          documentDate: doc.documentDate,
          customerTaxID: doc.customerTaxID,
          customerCountry: doc.customerCountry,
          companyName: doc.companyName,
          documentTotals: {
            taxPayable: Number(doc.documentTotals.taxPayable),
            netTotal: Number(doc.documentTotals.netTotal),
            grossTotal: Number(doc.documentTotals.grossTotal)
          }
        };
        doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
        const regPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [doc]
        };
        regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
        const regResp = await post('registarFactura', regPayload, `registarFactura-${rcDocNo}`);
        const requestID = regResp && (regResp.requestID || regResp.successRequestID);
        if (requestID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(requestID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
        }
      };
      await doRC('0002', 400);
      await doRC('0003', 600);
    }
  }

  // 0f) registarNCdeND (emitir ND e depois NC a referenciar a ND)
  if (run('registarNCdeND')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarNCdeND');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const ndSeries = list.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    const ncSeries = list.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    if (!ftSeries || !ndSeries || !ncSeries) {
      log({ endpoint: 'registarFactura', label: 'missing-series-for-NCdeND', ok: false, status: 'n/a', error: 'Séries FT/ND/NC ativas não encontradas' });
    } else {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const ftDocRef = `FT ${ftSeries.seriesCode}/0005`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 5`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 1000,
              unitPriceBase: 1000,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 1000,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 140
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 140,
            netTotal: 1000,
            grossTotal: 1140,
            currencyCode: 'AOA'
          }
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-5-1140`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      const ndDocNo = `ND ${ndSeries.seriesCode}/0002`;
      const ndDoc = {
        documentNo: ndDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'ND',
        invoiceType: 'ND',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${ndSeries.seriesCode} 2`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Acréscimo Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Acréscimo',
            productType: 'P',
            creditAmount: 1000,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ],
            referenceInfo: {
              reference: ftDocRef,
              reason: 'Acréscimo',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          currencyCode: 'AOA'
        }
      };
      const ndHashData = `uuid-${ndSeries.seriesCode}-2-1140`;
      ndDoc.hash = Buffer.from(ndHashData).toString('base64').substring(0, 16);
      const ndDocSignSet = {
        documentNo: ndDoc.documentNo,
        taxRegistrationNumber: nif,
        documentType: ndDoc.documentType,
        documentDate: ndDoc.documentDate,
        customerTaxID: ndDoc.customerTaxID,
        customerCountry: ndDoc.customerCountry,
        companyName: ndDoc.companyName,
        documentTotals: {
          taxPayable: Number(ndDoc.documentTotals.taxPayable),
          netTotal: Number(ndDoc.documentTotals.netTotal),
          grossTotal: Number(ndDoc.documentTotals.grossTotal)
        }
      };
      ndDoc.jwsDocumentSignature = signJws(reqHeader, ndDocSignSet, key);
      const ndRegPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [ndDoc]
      };
      ndRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ndRegPayload.taxRegistrationNumber, submissionUUID: ndRegPayload.submissionUUID }, key);
      const ndRegResp = await post('registarFactura', ndRegPayload, `registarFactura-${ndDocNo}`);
      const ndReqID = ndRegResp && (ndRegResp.requestID || ndRegResp.successRequestID);
      if (ndReqID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(ndReqID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${ndReqID}`);
      }
      const ncDocNo = `NC ${ncSeries.seriesCode}/0002`;
      const ncDoc = {
        documentNo: ncDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'NC',
        invoiceType: 'NC',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${ncSeries.seriesCode} 2`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Estorno ND',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 1000,
            unitPriceBase: 1000,
            taxPointDate: ymd,
            description: 'Estorno ND',
            productType: 'P',
            debitAmount: 1000,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 140
              }
            ],
            referenceInfo: {
              reference: ndDocNo,
              reason: 'Estorno ND',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 140,
          netTotal: 1000,
          grossTotal: 1140,
          currencyCode: 'AOA'
        }
      };
      const ncHashData = `uuid-${ncSeries.seriesCode}-2-1140`;
      ncDoc.hash = Buffer.from(ncHashData).toString('base64').substring(0, 16);
      const ncDocSignSet = {
        documentNo: ncDoc.documentNo,
        taxRegistrationNumber: nif,
        documentType: ncDoc.documentType,
        documentDate: ncDoc.documentDate,
        customerTaxID: ncDoc.customerTaxID,
        customerCountry: ncDoc.customerCountry,
        companyName: ncDoc.companyName,
        documentTotals: {
          taxPayable: Number(ncDoc.documentTotals.taxPayable),
          netTotal: Number(ncDoc.documentTotals.netTotal),
          grossTotal: Number(ncDoc.documentTotals.grossTotal)
        }
      };
      ncDoc.jwsDocumentSignature = signJws(reqHeader, ncDocSignSet, key);
      const ncRegPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [ncDoc]
      };
      ncRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ncRegPayload.taxRegistrationNumber, submissionUUID: ncRegPayload.submissionUUID }, key);
      const ncRegResp = await post('registarFactura', ncRegPayload, `registarFactura-${ncDocNo}`);
      const ncReqID = ncRegResp && (ncRegResp.requestID || ncRegResp.successRequestID);
      if (ncReqID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(ncReqID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${ncReqID}`);
      }
    }
  }
  // 1) listarSeries (year string)
  if (run('listarSeries')) {
    const payload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    // Assinatura de acordo com a especificação: NIF + seriesYear (quando presente)
    payload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: payload.taxRegistrationNumber, seriesYear: payload.seriesYear }, key);
    await post('listarSeries', payload, 'listarSeries');
  }

  if (run('registarRCExcessoCorrigir')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarRCExcessoCorrigir');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const rcSeries = list.find(s => (s.documentType || '').toUpperCase() === 'RC' && (s.seriesStatus || '') === 'A');
    if (ftSeries && rcSeries) {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const ftDocRef = `FT ${ftSeries.seriesCode}/0006`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 6`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 1000,
              unitPriceBase: 1000,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 1000,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 140
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 140,
            netTotal: 1000,
            grossTotal: 1140,
            currencyCode: 'AOA'
          }
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-6-1140`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      const seriesCode = rcSeries.seriesCode;
      const doRC = async (seq, amount) => {
        const rcDocNo = `RC ${seriesCode}/${seq}`;
        const doc = {
          documentNo: rcDocNo,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'RC',
          invoiceType: 'RC',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${seriesCode} ${Number(seq)}`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          withholdingTaxList: [],
          paymentReceipt: {
            sourceDocuments: [
              {
                lineNo: '1',
                sourceDocumentID: {
                  originatingON: ftDocRef,
                  documentDate: ymd
                },
                debitAmount: String(amount)
              }
            ]
          },
          documentTotals: {
            taxPayable: 0,
            netTotal: amount,
            grossTotal: amount,
            settlementAmount: String(amount),
            paymentMechanism: 'NU',
            currencyCode: 'AOA'
          }
        };
        const hashData = `uuid-${seriesCode}-${Number(seq)}-${amount}`;
        doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
        const docSignSet = {
          documentNo: doc.documentNo,
          taxRegistrationNumber: nif,
          documentType: doc.documentType,
          documentDate: doc.documentDate,
          customerTaxID: doc.customerTaxID,
          customerCountry: doc.customerCountry,
          companyName: doc.companyName,
          documentTotals: {
            taxPayable: Number(doc.documentTotals.taxPayable),
            netTotal: Number(doc.documentTotals.netTotal),
            grossTotal: Number(doc.documentTotals.grossTotal)
          }
        };
        doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
        const regPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [doc]
        };
        regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
        const regResp = await post('registarFactura', regPayload, `registarFactura-${rcDocNo}`);
        const requestID = regResp && (regResp.requestID || regResp.successRequestID);
        if (requestID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(requestID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
        }
      };
      await doRC('0004', 900);
      await doRC('0005', 200);
      await doRC('0006', 100);
    }
  }

  if (run('registarNCParcialDeND')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-registarNCParcialDeND');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const ndSeries = list.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    const ncSeries = list.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    if (ftSeries && ndSeries && ncSeries) {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const ftDocRef = `FT ${ftSeries.seriesCode}/0007`;
      {
        const ftDoc = {
          documentNo: ftDocRef,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'FT',
          invoiceType: 'FT',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ftSeries.seriesCode} 7`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Servico Teste',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: 600,
              unitPriceBase: 600,
              taxPointDate: ymd,
              description: 'Servico Teste',
              productType: 'P',
              creditAmount: 600,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: 84
                }
              ]
            }
          ],
          documentTotals: {
            taxPayable: 84,
            netTotal: 600,
            grossTotal: 684,
            currencyCode: 'AOA'
          }
        };
        const ftHashData = `uuid-${ftSeries.seriesCode}-7-684`;
        ftDoc.hash = Buffer.from(ftHashData).toString('base64').substring(0, 16);
        const ftDocSignSet = {
          documentNo: ftDoc.documentNo,
          taxRegistrationNumber: nif,
          documentType: ftDoc.documentType,
          documentDate: ftDoc.documentDate,
          customerTaxID: ftDoc.customerTaxID,
          customerCountry: ftDoc.customerCountry,
          companyName: ftDoc.companyName,
          documentTotals: {
            taxPayable: Number(ftDoc.documentTotals.taxPayable),
            netTotal: Number(ftDoc.documentTotals.netTotal),
            grossTotal: Number(ftDoc.documentTotals.grossTotal)
          }
        };
        ftDoc.jwsDocumentSignature = signJws(reqHeader, ftDocSignSet, key);
        const ftRegPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [ftDoc]
        };
        ftRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ftRegPayload.taxRegistrationNumber, submissionUUID: ftRegPayload.submissionUUID }, key);
        const ftRegResp = await post('registarFactura', ftRegPayload, `registarFactura-${ftDocRef}`);
        const ftReqID = ftRegResp && (ftRegResp.requestID || ftRegResp.successRequestID);
        if (ftReqID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(ftReqID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${ftReqID}`);
        }
      }
      const ndDocNo = `ND ${ndSeries.seriesCode}/0003`;
      const ndDoc = {
        documentNo: ndDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'ND',
        invoiceType: 'ND',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${ndSeries.seriesCode} 3`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Acréscimo Servico Teste',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 600,
            unitPriceBase: 600,
            taxPointDate: ymd,
            description: 'Acréscimo',
            productType: 'P',
            creditAmount: 600,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 84
              }
            ],
            referenceInfo: {
              reference: ftDocRef,
              reason: 'Acréscimo',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 84,
          netTotal: 600,
          grossTotal: 684,
          currencyCode: 'AOA'
        }
      };
      const ndHashData = `uuid-${ndSeries.seriesCode}-3-684`;
      ndDoc.hash = Buffer.from(ndHashData).toString('base64').substring(0, 16);
      const ndDocSignSet = {
        documentNo: ndDoc.documentNo,
        taxRegistrationNumber: nif,
        documentType: ndDoc.documentType,
        documentDate: ndDoc.documentDate,
        customerTaxID: ndDoc.customerTaxID,
        customerCountry: ndDoc.customerCountry,
        companyName: ndDoc.companyName,
        documentTotals: {
          taxPayable: Number(ndDoc.documentTotals.taxPayable),
          netTotal: Number(ndDoc.documentTotals.netTotal),
          grossTotal: Number(ndDoc.documentTotals.grossTotal)
        }
      };
      ndDoc.jwsDocumentSignature = signJws(reqHeader, ndDocSignSet, key);
      const ndRegPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [ndDoc]
      };
      ndRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ndRegPayload.taxRegistrationNumber, submissionUUID: ndRegPayload.submissionUUID }, key);
      const ndRegResp = await post('registarFactura', ndRegPayload, `registarFactura-${ndDocNo}`);
      const ndReqID = ndRegResp && (ndRegResp.requestID || ndRegResp.successRequestID);
      if (ndReqID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(ndReqID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${ndReqID}`);
      }
      const ncDocNo = `NC ${ncSeries.seriesCode}/0003`;
      const ncDoc = {
        documentNo: ncDocNo,
        documentStatus: 'N',
        documentDate: ymd,
        documentType: 'NC',
        invoiceType: 'NC',
        period: today.getMonth() + 1,
        systemEntryDate: sysdt,
        transactionID: `${ymd.replace(/-/g,'')} ${ncSeries.seriesCode} 3`,
        customerTaxID: '999999999',
        customerCountry: 'AO',
        companyName: 'Consumidor Final',
        lines: [
          {
            lineNumber: 1,
            productCode: 'SERV001',
            productDescription: 'Estorno ND parcial',
            quantity: 1,
            unitOfMeasure: 'UN',
            unitPrice: 250,
            unitPriceBase: 250,
            taxPointDate: ymd,
            description: 'Estorno ND parcial',
            productType: 'P',
            debitAmount: 250,
            settlementAmount: '0',
            reference: 'SERV001',
            taxes: [
              {
                taxType: 'IVA',
                taxCountryRegion: 'AO',
                taxCode: 'NOR',
                taxPercentage: 14,
                taxContribution: 35
              }
            ],
            referenceInfo: {
              reference: ndDocNo,
              reason: 'Estorno parcial ND',
              referenceItemLineNo: 1
            }
          }
        ],
        documentTotals: {
          taxPayable: 35,
          netTotal: 250,
          grossTotal: 285,
          currencyCode: 'AOA'
        }
      };
      const ncHashData = `uuid-${ncSeries.seriesCode}-3-285`;
      ncDoc.hash = Buffer.from(ncHashData).toString('base64').substring(0, 16);
      const ncDocSignSet = {
        documentNo: ncDoc.documentNo,
        taxRegistrationNumber: nif,
        documentType: ncDoc.documentType,
        documentDate: ncDoc.documentDate,
        customerTaxID: ncDoc.customerTaxID,
        customerCountry: ncDoc.customerCountry,
        companyName: ncDoc.companyName,
        documentTotals: {
          taxPayable: Number(ncDoc.documentTotals.taxPayable),
          netTotal: Number(ncDoc.documentTotals.netTotal),
          grossTotal: Number(ncDoc.documentTotals.grossTotal)
        }
      };
      ncDoc.jwsDocumentSignature = signJws(reqHeader, ncDocSignSet, key);
      const ncRegPayload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        numberOfEntries: 1,
        documents: [ncDoc]
      };
      ncRegPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: ncRegPayload.taxRegistrationNumber, submissionUUID: ncRegPayload.submissionUUID }, key);
      const ncRegResp = await post('registarFactura', ncRegPayload, `registarFactura-${ncDocNo}`);
      const ncReqID = ncRegResp && (ncRegResp.requestID || ncRegResp.successRequestID);
      if (ncReqID) {
        const obterPayload = {
          schemaVersion: '1.2',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: nowIsoZ(),
          softwareInfo,
          requestID: String(ncReqID)
        };
        obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
        await post('obterEstado', obterPayload, `obterEstado-${ncReqID}`);
      }
    }
  }

  if (run('cancelarTestes')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-cancelarTestes');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const rcSeries = list.find(s => (s.documentType || '').toUpperCase() === 'RC' && (s.seriesStatus || '') === 'A');
    const ndSeries = list.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    const ncSeries = list.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    const docs = [];
    if (ftSeries) {
      docs.push(`FT ${ftSeries.seriesCode}/0002`);
      docs.push(`FT ${ftSeries.seriesCode}/0003`);
      docs.push(`FT ${ftSeries.seriesCode}/0004`);
      docs.push(`FT ${ftSeries.seriesCode}/0005`);
      docs.push(`FT ${ftSeries.seriesCode}/0006`);
      docs.push(`FT ${ftSeries.seriesCode}/0007`);
    }
    if (rcSeries) {
      docs.push(`RC ${rcSeries.seriesCode}/0001`);
      docs.push(`RC ${rcSeries.seriesCode}/0002`);
      docs.push(`RC ${rcSeries.seriesCode}/0003`);
      docs.push(`RC ${rcSeries.seriesCode}/0004`);
      docs.push(`RC ${rcSeries.seriesCode}/0005`);
      docs.push(`RC ${rcSeries.seriesCode}/0006`);
    }
    if (ndSeries) {
      docs.push(`ND ${ndSeries.seriesCode}/0001`);
      docs.push(`ND ${ndSeries.seriesCode}/0002`);
      docs.push(`ND ${ndSeries.seriesCode}/0003`);
    }
    if (ncSeries) {
      docs.push(`NC ${ncSeries.seriesCode}/0002`);
      docs.push(`NC ${ncSeries.seriesCode}/0003`);
    }
    for (const d of docs) {
      const payload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        documentNo: d,
        action: 'C',
        reason: 'Testes que faziamos'
      };
      const toSign = { taxRegistrationNumber: payload.taxRegistrationNumber, documentNo: payload.documentNo, action: payload.action };
      payload.jwsSignature = signJws(reqHeader, toSign, key);
      await post('validarDocumento', payload, `validarDocumento-cancel-${d}`);
    }
  }

  if (run('estornarTestes')) {
    const listarPayload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: nowIsoZ(),
      softwareInfo,
      seriesYear: year
    };
    listarPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listarPayload.taxRegistrationNumber, seriesYear: listarPayload.seriesYear }, key);
    const seriesResp = await post('listarSeries', listarPayload, 'listarSeries-for-estornarTestes');
    const list = (seriesResp && (seriesResp.seriesInfo || seriesResp.seriresInfo)) || [];
    const ftSeries = list.find(s => (s.documentType || '').toUpperCase() === 'FT' && (s.seriesStatus || '') === 'A');
    const ndSeries = list.find(s => (s.documentType || '').toUpperCase() === 'ND' && (s.seriesStatus || '') === 'A');
    const ncSeries = list.find(s => (s.documentType || '').toUpperCase() === 'NC' && (s.seriesStatus || '') === 'A');
    if (ncSeries) {
      const today = new Date();
      const ymd = today.toISOString().split('T')[0];
      const sysdt = today.toISOString().split('.')[0];
      const refs = [];
      if (ftSeries) {
        refs.push({ ref: `FT ${ftSeries.seriesCode}/0002`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `FT ${ftSeries.seriesCode}/0004`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `FT ${ftSeries.seriesCode}/0005`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `FT ${ftSeries.seriesCode}/0006`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `FT ${ftSeries.seriesCode}/0007`, net: 600, tax: 84, gross: 684 });
      }
      if (ndSeries) {
        refs.push({ ref: `ND ${ndSeries.seriesCode}/0001`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `ND ${ndSeries.seriesCode}/0002`, net: 1000, tax: 140, gross: 1140 });
        refs.push({ ref: `ND ${ndSeries.seriesCode}/0003`, net: 600, tax: 84, gross: 684 });
      }
      let seqCounter = 4;
      for (const r of refs) {
        const ncDocNo = `NC ${ncSeries.seriesCode}/${String(seqCounter).padStart(4,'0')}`;
        seqCounter++;
        const doc = {
          documentNo: ncDocNo,
          documentStatus: 'N',
          documentDate: ymd,
          documentType: 'NC',
          invoiceType: 'NC',
          period: today.getMonth() + 1,
          systemEntryDate: sysdt,
          transactionID: `${ymd.replace(/-/g,'')} ${ncSeries.seriesCode} ${seqCounter}`,
          customerTaxID: '999999999',
          customerCountry: 'AO',
          companyName: 'Consumidor Final',
          lines: [
            {
              lineNumber: 1,
              productCode: 'SERV001',
              productDescription: 'Estorno',
              quantity: 1,
              unitOfMeasure: 'UN',
              unitPrice: r.net,
              unitPriceBase: r.net,
              taxPointDate: ymd,
              description: 'Estorno',
              productType: 'P',
              debitAmount: r.net,
              settlementAmount: '0',
              reference: 'SERV001',
              taxes: [
                {
                  taxType: 'IVA',
                  taxCountryRegion: 'AO',
                  taxCode: 'NOR',
                  taxPercentage: 14,
                  taxContribution: r.tax
                }
              ],
              referenceInfo: {
                reference: r.ref,
                reason: 'Testes que faziamos',
                referenceItemLineNo: 1
              }
            }
          ],
          documentTotals: {
            taxPayable: r.tax,
            netTotal: r.net,
            grossTotal: r.gross,
            currencyCode: 'AOA'
          }
        };
        const hashData = `uuid-${ncSeries.seriesCode}-${seqCounter}-${r.gross}`;
        doc.hash = Buffer.from(hashData).toString('base64').substring(0, 16);
        const docSignSet = {
          documentNo: doc.documentNo,
          taxRegistrationNumber: nif,
          documentType: doc.documentType,
          documentDate: doc.documentDate,
          customerTaxID: doc.customerTaxID,
          customerCountry: doc.customerCountry,
          companyName: doc.companyName,
          documentTotals: {
            taxPayable: Number(doc.documentTotals.taxPayable),
            netTotal: Number(doc.documentTotals.netTotal),
            grossTotal: Number(doc.documentTotals.grossTotal)
          }
        };
        doc.jwsDocumentSignature = signJws(reqHeader, docSignSet, key);
        const regPayload = {
          schemaVersion: '1.0',
          submissionUUID: 'debug-uuid-' + Date.now(),
          taxRegistrationNumber: nif,
          submissionTimeStamp: new Date().toISOString(),
          softwareInfo,
          numberOfEntries: 1,
          documents: [doc]
        };
        regPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: regPayload.taxRegistrationNumber, submissionUUID: regPayload.submissionUUID }, key);
        const regResp = await post('registarFactura', regPayload, `registarFactura-${ncDocNo}`);
        const requestID = regResp && (regResp.requestID || regResp.successRequestID);
        if (requestID) {
          const obterPayload = {
            schemaVersion: '1.2',
            submissionUUID: 'debug-uuid-' + Date.now(),
            taxRegistrationNumber: nif,
            submissionTimeStamp: nowIsoZ(),
            softwareInfo,
            requestID: String(requestID)
          };
          obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
          await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
        }
      }
    }
  }
  // 2b) obterEstado por requestID explícito (CLI: --only=obterEstadoID --req=xxxxxxxxx)
  if (run('obterEstadoID')) {
    const requestID = String(reqOverride || '').trim();
    if (requestID) {
      const obterPayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        requestID
      };
      obterPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: obterPayload.taxRegistrationNumber, requestID: obterPayload.requestID }, key);
      await post('obterEstado', obterPayload, `obterEstado-${requestID}`);
    } else {
      console.log('Sem --req para obterEstadoID');
    }
  }

  // 2) solicitarSerie across doc types (somente estabelecimentos válidos)
  if (run('solicitarSerie')) {
    const docTypes = ['FT','FR','RC','NC','ND'];
    const establishments = [est]; // evitar códigos não registados (ex.: "10") que geram E99
    for (const dt of docTypes) for (const e of establishments) {
      const basePayload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: nowIsoZ(),
        softwareInfo,
        seriesYear: year,
        documentType: dt,
        establishmentNumber: e,
        seriesContingencyIndicator: 'N'
      };
      const signSet = {
        taxRegistrationNumber: basePayload.taxRegistrationNumber,
        establishmentNumber: basePayload.establishmentNumber,
        seriesYear: basePayload.seriesYear,
        documentType: basePayload.documentType
      };
      // Assinatura conforme expectativa: NIF + est + year + docType (+ indicador só quando 'C')
      const withCont = { ...signSet, ...(basePayload.seriesContingencyIndicator === 'C' ? { seriesContingencyIndicator: 'C' } : {}) };
      const p = { ...basePayload, jwsSignature: signJws(reqHeader, withCont, key) };
      await post('solicitarSerie', p, `solicitarSerie-${dt}-est-${e}`);
    }
  }

  // 3) listarFacturas (two windows or custom)
  if (run('listarFacturas')) {
    let windows;
    if (startRange && endRange) {
      windows = [{ s: startRange, e: endRange }];
    } else if (periodSpec === 'month') {
      const t = new Date();
      const y = t.getFullYear();
      const m = t.getMonth() + 1;
      const start = `${y}-${String(m).padStart(2,'0')}-01`;
      const last = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
      windows = [{ s: start, e: end }];
    } else {
      windows = [
        { s: '2025-12-01', e: '2025-12-31' },
        { s: `${year}-01-01`, e: `${year}-12-31` }
      ];
    }
    for (const w of windows) {
      const payload = {
        schemaVersion: '1.0',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        queryStartDate: w.s,
        queryEndDate: w.e
      };
      payload.jwsSignature = signJws(
        reqHeader,
        {
          taxRegistrationNumber: payload.taxRegistrationNumber,
          queryStartDate: payload.queryStartDate,
          queryEndDate: payload.queryEndDate
        },
        key
      );
      const resp = await post('listarFacturas', payload, `listarFacturas-${w.s}-to-${w.e}`);
      try {
        const list = (resp && resp.statusResult && (resp.statusResult.documentResultList || resp.statusResult.documentList)) || [];
        if (Array.isArray(list) && list.length > 0) {
          const header = 'documentNo,documentDate\n';
          const lines = list.map(d => `${String(d.documentNo || '').replace(/\\s+/g,' ').trim()},${String(d.documentDate || '').trim()}`).join('\n') + '\n';
          const outPath = csvOut || path.join('data', `agt_listar_facturas_${w.s.replace(/-/g,'')}_${w.e.replace(/-/g,'')}.csv`);
          const dir = path.dirname(outPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(outPath, header + lines, 'utf8');
          console.log(`CSV ${outPath}`);
        }
      } catch {}
    }
  }

  // 4) consultarFactura (use a plausible documentNo format even se não existir)
  if (run('consultarFactura')) {
    // Example: FT XVE{year}/0001 (will likely return error if not registered; still realistic)
    const seq = '0001';
    const seriesBase = 'XVE' + year;
    const defaultDoc = `FT ${seriesBase}/${seq}`;
    const docNo = docOverride || defaultDoc;
    const payload = {
      schemaVersion: '1.0',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo,
      invoiceNo: docNo
    };
    payload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: payload.taxRegistrationNumber, invoiceNo: payload.invoiceNo }, key);
    await post('consultarFactura', payload, `consultarFactura-${docNo}`);
  }

  // 5) validarDocumento (documentNo plausível e ação C)
  if (run('validarDocumento')) {
    const seriesBase = 'XVE' + year;
    const defaultDoc = `FT ${seriesBase}/0001`;
    const docNo = docOverride || defaultDoc;
    const payload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo,
      documentNo: docNo,
      action: 'C'
    };
    const toSign = { taxRegistrationNumber: payload.taxRegistrationNumber, documentNo: payload.documentNo, action: payload.action };
    payload.jwsSignature = signJws(reqHeader, toSign, key);
    await post('validarDocumento', payload, `validarDocumento-${docNo}`);
  }

  if (run('validarConfirmarAuto')) {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth() + 1;
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const last = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    const listPayload = {
      schemaVersion: '1.0',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo,
      queryStartDate: start,
      queryEndDate: end
    };
    listPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listPayload.taxRegistrationNumber, queryStartDate: listPayload.queryStartDate, queryEndDate: listPayload.queryEndDate }, key);
    const listResp = await post('listarFacturas', listPayload, `listarFacturas-${start}-to-${end}-for-validar`);
    const list = (listResp && listResp.statusResult && (listResp.statusResult.documentResultList || listResp.statusResult.documentList)) || [];
    if (Array.isArray(list) && list.length > 0) {
      const docNo = String(list[0].documentNo || '').trim();
      const payload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        documentNo: docNo,
        action: 'C'
      };
      const toSign = { taxRegistrationNumber: payload.taxRegistrationNumber, documentNo: payload.documentNo, action: payload.action };
      payload.jwsSignature = signJws(reqHeader, toSign, key);
      await post('validarDocumento', payload, `validarDocumento-auto-C-${docNo}`);
    } else {
      console.log('Sem facturas em nome do contribuinte para confirmar no período atual');
    }
  }

  if (run('validarRejeitarAuto')) {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth() + 1;
    const start = `${y}-${String(m).padStart(2,'0')}-01`;
    const last = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
    const listPayload = {
      schemaVersion: '1.0',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo,
      queryStartDate: start,
      queryEndDate: end
    };
    listPayload.jwsSignature = signJws(reqHeader, { taxRegistrationNumber: listPayload.taxRegistrationNumber, queryStartDate: listPayload.queryStartDate, queryEndDate: listPayload.queryEndDate }, key);
    const listResp = await post('listarFacturas', listPayload, `listarFacturas-${start}-to-${end}-for-validarR`);
    const list = (listResp && listResp.statusResult && (listResp.statusResult.documentResultList || listResp.statusResult.documentList)) || [];
    if (Array.isArray(list) && list.length > 0) {
      const docNo = String(list[0].documentNo || '').trim();
      const payload = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: nif,
        submissionTimeStamp: new Date().toISOString(),
        softwareInfo,
        documentNo: docNo,
        action: 'R'
      };
      const toSign = { taxRegistrationNumber: payload.taxRegistrationNumber, documentNo: payload.documentNo, action: payload.action };
      payload.jwsSignature = signJws(reqHeader, toSign, key);
      await post('validarDocumento', payload, `validarDocumento-auto-R-${docNo}`);
    } else {
      console.log('Sem facturas em nome do contribuinte para rejeitar no período atual');
    }
  }

  if (run('validarE93')) {
    const seq = '9999';
    const seriesBase = 'XVE' + year;
    const fakeDoc = `FT ${seriesBase}/${seq}`;
    const payload = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: nif,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo,
      documentNo: fakeDoc,
      action: 'C'
    };
    const toSign = { taxRegistrationNumber: payload.taxRegistrationNumber, documentNo: payload.documentNo, action: payload.action };
    payload.jwsSignature = signJws(reqHeader, toSign, key);
    await post('validarDocumento', payload, `validarDocumento-E93-${fakeDoc}`);
  }

  // Sumário final
  try {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(s => JSON.parse(s));
    const summary = lines.reduce((acc, l) => {
      const k = l.endpoint;
      acc[k] = acc[k] || { ok: 0, fail: 0 };
      if (l.ok) acc[k].ok++; else acc[k].fail++;
      return acc;
    }, {});
    console.log('=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
  } catch {}
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
