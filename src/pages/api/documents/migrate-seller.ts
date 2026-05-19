import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { documentStore } from '../../../lib/documentStore';
import { companyJsonPath } from '@/lib/dataPaths';

function readActiveCompany(): any {
  try {
    const p = companyJsonPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      return raw ? JSON.parse(raw) : {};
    }
  } catch {}
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { ids, onlyMissing } = (req.body || {}) as { ids?: string[]; onlyMissing?: boolean };
    const active = readActiveCompany();
    const activeNif = active?.nif || '';
    if (!activeNif) return res.status(400).json({ error: 'Empresa ativa inválida (NIF ausente)' });

    const seller = {
      name: active?.name || active?.tradeName || 'Empresa',
      tradeName: active?.tradeName || active?.name || 'Empresa',
      address: active?.address || '',
      nif: activeNif,
      email: active?.email || '',
      phone: active?.phone || ''
    };

    const all = documentStore.getAllDocuments();
    const candidates = all.filter(d => {
      const nif = d?.seller?.nif || '';
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.includes(d.id) && (!onlyMissing || !nif);
      }
      return !nif || nif !== activeNif;
    });

    const migratedIds: string[] = [];
    candidates.forEach(d => {
      const updated = documentStore.overrideSeller(d.id, seller);
      if (updated) migratedIds.push(d.id);
    });

    return res.status(200).json({ migratedCount: migratedIds.length, migratedIds });
  } catch (e) {
    console.error('migrate-seller error', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}