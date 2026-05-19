import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { systemJsonPath } from '@/lib/dataPaths';

export type SoftwareByNifEntry = {
  saftProductId?: string;
  saftProductVersion?: string;
  saftProductCompanyTaxId?: string;
  saftSoftwareCertificateNumber?: string;
};

export type SystemConfig = {
  saftProductId?: string;
  saftProductVersion?: string;
  saftProductCompanyTaxId?: string;
  saftSoftwareCertificateNumber?: string;
  softwareByNif?: Record<string, SoftwareByNifEntry>;
};

function readSystemConfig(): SystemConfig {
  const p = systemJsonPath();
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const json = raw ? JSON.parse(raw) : {};
      if (json && typeof json === 'object') return json as SystemConfig;
    }
  } catch {}
  return {};
}

function writeSystemConfig(cfg: SystemConfig): void {
  const p = systemJsonPath();
  fs.writeFileSync(p, JSON.stringify(cfg || {}, null, 2), 'utf-8');
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const cfg = readSystemConfig();
    return res.status(200).json({ system: cfg });
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const incoming: SystemConfig = {
        saftProductId: body.saftProductId ?? undefined,
        saftProductVersion: body.saftProductVersion ?? undefined,
        saftProductCompanyTaxId: body.saftProductCompanyTaxId ?? undefined,
        saftSoftwareCertificateNumber: body.saftSoftwareCertificateNumber ?? undefined,
        softwareByNif: (body.softwareByNif && typeof body.softwareByNif === 'object') ? body.softwareByNif : undefined,
      };
      const current = readSystemConfig();
      const merged: SystemConfig = {
        ...current,
        ...incoming,
      };
      writeSystemConfig(merged);
      return res.status(200).json({ system: merged });
    } catch (e) {
      console.error('Erro a guardar configuração do sistema:', e);
      return res.status(500).json({ error: 'Falha ao guardar configuração do sistema' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}