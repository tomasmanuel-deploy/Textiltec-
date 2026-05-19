const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const axios = require('axios');
const { execFileSync } = require('child_process');

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
  const sig = s.sign(key, 'base64url');
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

async function main() {
  const fingerprint = fs.readFileSync(path.resolve('data/agt_keys/public.sha256.base64.txt'), 'utf8').trim();
  let issuerKeyPath = 'data/agt_keys/private.pem';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.resolve('data/agt_config.json'),'utf8'));
    if (cfg.issuerPrivateKeyPath && fs.existsSync(cfg.issuerPrivateKeyPath)) issuerKeyPath = cfg.issuerPrivateKeyPath;
  } catch {}
  const key = fs.readFileSync(path.resolve(issuerKeyPath));
  const user = 'ws.prak';
  const pass = 'mfn180032026';
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    minVersion: 'TLSv1',
    ciphers: 'DEFAULT@SECLEVEL=0'
  });

  const year = new Date().getFullYear();
  const base = 'https://sifp.minfin.gov.ao/sigt/fe/v1';
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${auth}`,
    'X-Software-Key-Id': fingerprint
  };

  // Build softwareInfo
  const cfg = JSON.parse(fs.readFileSync(path.resolve('data/agt_config.json'),'utf8'));
  const softwareInfoDetail = {
    productId: 'Prakash Software',
    productVersion: '1.0.6',
    softwareValidationNumber: cfg.softwareCertificateNumber || '0'
  };
  const h2 = { alg: 'RS256', typ: 'JWT', kid: fingerprint };
  const jwsSoftwareSignature = signJws(h2, softwareInfoDetail, key);

  // JWT.io samples
  const jwtHeader = { alg: 'RS256', typ: 'JWT', kid: fingerprint };
  const jwtListar = signJws(jwtHeader, { taxRegistrationNumber: '5002821079', seriesYear: String(year) }, key);
  const jwtSolicitar = signJws(jwtHeader, { taxRegistrationNumber: '5002821079', establishmentNumber: 'SEDE', seriesYear: String(year), documentType: 'FT', seriesContingencyIndicator: 'N' }, key);
  console.log('=== JWT.io Samples ===');
  console.log('softwareInfo.jwsSoftwareSignature:', jwsSoftwareSignature);
  console.log('listarSeries.jwsSignature:', jwtListar);
  console.log('solicitarSerie.jwsSignature:', jwtSolicitar);

  // Helper to try multiple header variants
  const headerVariants = [
    { name: 'typ=JOSE,kid', value: { alg: 'RS256', typ: 'JOSE', kid: fingerprint } },
    { name: 'typ=JWT,kid', value: { alg: 'RS256', typ: 'JWT', kid: fingerprint } },
    { name: 'typ=JWS,kid', value: { alg: 'RS256', typ: 'JWS', kid: fingerprint } },
    { name: 'alg-only', value: { alg: 'RS256' } }
  ];

  // Helper: pretty print result summary
  const showSummary = (title, out) => {
    try {
      const obj = typeof out === 'string' ? JSON.parse(out) : out;
      const code = obj?.resultCode ?? obj?.resultCode?.toString?.();
      const seriesCount = obj?.seriesResultCount || obj?.seriresInfo?.length || obj?.seriresInfo?.length;
      console.log(`>>> ${title} RESULT: code=${code} count=${seriesCount ?? 'n/a'}`);
    } catch {
      console.log(`>>> ${title} RAW:`, String(out).slice(0, 500));
    }
  };

  // Test listarSeries (year as string)
  try {
    const basePayloadListar = {
      schemaVersion: '1.2',
      submissionUUID: 'debug-uuid-' + Date.now(),
      taxRegistrationNumber: '5002821079',
      submissionTimeStamp: new Date().toISOString().substring(0,19) + 'Z',
      softwareInfo: { softwareInfoDetail, jwsSoftwareSignature },
      seriesYear: String(year)
    };
    console.log('TYPE_CHECK listarSeries.seriesYear', typeof basePayloadListar.seriesYear);
    const signSetsListar = [
      { name: 'NIF', pick: (p) => ({ taxRegistrationNumber: p.taxRegistrationNumber }) },
      { name: 'NIF+Year', pick: (p) => ({ taxRegistrationNumber: p.taxRegistrationNumber, seriesYear: p.seriesYear }) },
      { name: 'FullPayload', pick: (p) => ({ ...p }) }
    ];
    for (const hv of headerVariants) {
      for (const ss of signSetsListar) {
        const payload = { ...basePayloadListar };
        const toSign = ss.pick(payload);
        payload.jwsSignature = signJws(hv.value, toSign, key);
        const decoded1 = decodeJws(payload.jwsSignature);
        console.log(`=== listarSeries (local check ${hv.name}/${ss.name}) ===`);
        console.log('Signed payload:', decoded1.payload);
        console.log('HTTP body subset to compare:', toSign);
        let out;
        try {
          const r = await axios.post(`${base}/listarSeries`, payload, { headers, httpsAgent, timeout: 60000 });
          out = JSON.stringify(r.data, null, 2);
          console.log(`=== listarSeries (axios, ${hv.name}/${ss.name}) ===`);
          console.log(out);
          showSummary(`listarSeries ${hv.name}/${ss.name}`, out);
        } catch (e) {
          console.log(`listarSeries axios ERR (${hv.name}/${ss.name})`, e.response?.status, e.response?.data || e.message);
          out = execFileSync('curl', [
            '-sS',
            '-u', `${user}:${pass}`,
            '-H', 'Content-Type: application/json',
            '-H', 'Accept: application/json',
            ...(hv.value.kid ? ['-H', `X-Software-Key-Id: ${fingerprint}`] : []),
            '-X', 'POST',
            `${base}/listarSeries`,
            '-d', JSON.stringify(payload)
          ], { encoding: 'utf8' });
          console.log(`=== listarSeries (curl, ${hv.name}/${ss.name}) ===`);
          console.log(out);
          showSummary(`listarSeries curl ${hv.name}/${ss.name}`, out);
        }
        if (!String(out).includes('"E40"')) {
          console.log(`>>> SUCCESS (listarSeries with ${hv.name}/${ss.name})`);
          break;
        }
      }
    }
  } catch (e) {
    console.log('listarSeries ERR', e.response?.status, e.response?.data || e.message);
  }

  // Test solicitarSerie using SEDE establishment for multiple document types
  try {
    const est = 'SEDE';
    const docTypes = ['FT','OR','GR','RC','NC','ND','FR','PP'];
    for (const dt of docTypes) {
      const basePayloadSolic = {
        schemaVersion: '1.2',
        submissionUUID: 'debug-uuid-' + Date.now(),
        taxRegistrationNumber: '5002821079',
        submissionTimeStamp: new Date().toISOString().substring(0,19) + 'Z',
        softwareInfo: { softwareInfoDetail, jwsSoftwareSignature },
        seriesYear: String(year),
        documentType: dt,
        establishmentNumber: est,
        seriesContingencyIndicator: 'N'
      };
      console.log('TYPE_CHECK solicitarSerie.seriesYear', typeof basePayloadSolic.seriesYear);
      const signSetsSolic = [
        { name: 'NIF+Est+Year+Doc', pick: (p) => ({ taxRegistrationNumber: p.taxRegistrationNumber, establishmentNumber: p.establishmentNumber, seriesYear: p.seriesYear, documentType: p.documentType }) },
        { name: 'NIF+Est+Year+Doc+Cont', pick: (p) => ({ taxRegistrationNumber: p.taxRegistrationNumber, establishmentNumber: p.establishmentNumber, seriesYear: p.seriesYear, documentType: p.documentType, seriesContingencyIndicator: p.seriesContingencyIndicator }) },
        { name: 'FullPayload', pick: (p) => ({ ...p }) }
      ];
      for (const hv of headerVariants) {
        for (const ss of signSetsSolic) {
          const payload = { ...basePayloadSolic };
          const toSign2 = ss.pick(payload);
          payload.jwsSignature = signJws(hv.value, toSign2, key);
          const decoded2 = decodeJws(payload.jwsSignature);
          console.log(`=== solicitarSerie (local check est=SEDE ${hv.name}/${ss.name} doc=${dt}) ===`);
          console.log('Signed payload:', decoded2.payload);
          console.log('HTTP body subset to compare:', toSign2);
          let out;
          try {
            const r = await axios.post(`${base}/solicitarSerie`, payload, { headers, httpsAgent, timeout: 60000 });
            out = JSON.stringify(r.data, null, 2);
            console.log(`=== solicitarSerie (axios, est=SEDE ${hv.name}/${ss.name} doc=${dt}) ===`);
            console.log(out);
            showSummary(`solicitarSerie ${hv.name}/${ss.name} ${dt}`, out);
          } catch (e) {
            console.log(`solicitarSerie axios ERR (est=SEDE ${hv.name}/${ss.name} doc=${dt})`, e.response?.status, e.response?.data || e.message);
            out = execFileSync('curl', [
              '-sS',
              '-u', `${user}:${pass}`,
              '-H', 'Content-Type: application/json',
              '-H', 'Accept: application/json',
              ...(hv.value.kid ? ['-H', `X-Software-Key-Id: ${fingerprint}`] : []),
              '-X', 'POST',
              `${base}/solicitarSerie`,
              '-d', JSON.stringify(payload)
            ], { encoding: 'utf8' });
            console.log(`=== solicitarSerie (curl, est=SEDE ${hv.name}/${ss.name} doc=${dt}) ===`);
            console.log(out);
          }
          if (!String(out).includes('"E40"')) {
            console.log(`>>> SUCCESS (solicitarSerie est=SEDE with ${hv.name}/${ss.name}, doc=${dt})`);
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log('solicitarSerie ERR', e.response?.status, e.response?.data || e.message);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
