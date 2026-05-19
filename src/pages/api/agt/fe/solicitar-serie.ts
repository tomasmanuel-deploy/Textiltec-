import type { NextApiRequest, NextApiResponse } from 'next';
import AgtService from '@/services/AgtService';
import agtAuditService from '@/services/AgtAuditService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { anoSerie, seriesYear, documentType, establishmentNumber, contingency, debug } = req.body || {};
  const yearStr = String(anoSerie ?? seriesYear ?? '').trim();
  if (!yearStr || !documentType) return res.status(400).json({ error: 'anoSerie (ou seriesYear) e documentType são obrigatórios' });
  try {
    const svc = new AgtService();
    // Debug mode: return built payload and decoded JWS alongside AGT response
    if (debug === true || String(debug) === 'true' || String(req.query?.debug) === 'true') {
      // Build payload exactly as used by the service
      const built = await (svc as any).generateSolicitarSeriePayload(String(yearStr), String(documentType), String(establishmentNumber || 'SEDE'), Boolean(contingency));
      const jws = String(built?.jwsSignature || '');
      const parts = jws.split('.');
      const decode = (b64: string) => {
        const s = b64.replace(/-/g, '+').replace(/_/g, '/');
        const buf = Buffer.from(s, 'base64');
        return JSON.parse(buf.toString('utf8'));
      };
      const jwsHeader = parts[0] ? decode(parts[0]) : null;
      const jwsPayload = parts[1] ? decode(parts[1]) : null;
      const agt = await (svc as any).submitRestRequest('solicitarSerie', built);
      agtAuditService.log('agt_solicitar_serie', 'success', 'Solicitado (debug)', { anoSerie: yearStr, documentType });
      return res.status(200).json({ debug: { builtPayload: built, jwsHeader, jwsPayload }, agt });
    }
    const resp = await svc.solicitarSerie(String(yearStr), String(documentType), String(establishmentNumber || 'SEDE'), Boolean(contingency));
    try {
      const code = (resp as any)?.seriesFEResult?.seriesCode || (resp as any)?.seriesCode;
      if (code && contingency) {
        const fs = await import('fs');
        const path = await import('path');
        const cfgPath = path.join(process.cwd(), 'data', 'agt_config.json');
        let cfg: any = {};
        try {
          if (fs.existsSync(cfgPath)) {
            cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8') || '{}');
          }
        } catch {}
        const contMap = cfg.contingencySeriesCodes || {};
        const dt = String((svc as any).mapDocumentTypeToAgt(String(documentType))).toUpperCase();
        if (!contMap[dt]) contMap[dt] = {};
        contMap[dt][String(yearStr)] = String(code);
        cfg.contingencySeriesCodes = contMap;
        try {
          const dir = path.dirname(cfgPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
        } catch {}
      }
    } catch {}
    agtAuditService.log('agt_solicitar_serie', 'success', 'Solicitado', { anoSerie: yearStr, documentType });
    return res.status(200).json(resp);
  } catch (e: any) {
    agtAuditService.log('agt_solicitar_serie', 'error', e?.message || 'Erro', { anoSerie: yearStr, documentType });
    return res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}
