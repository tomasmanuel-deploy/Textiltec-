import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '@/lib/dataPaths';
import { SeriesStore } from '@/lib/seriesStore';
import crypto from 'crypto';

interface Company {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  seriesBase?: string; // e.g. "2024"
  regime?: string; // e.g. "Geral"
  createdAt: string;
  updatedAt: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const companiesPath = resolveDataPath('companies.json');

  // Helper to load companies
  const loadCompanies = (): Company[] => {
    if (!fs.existsSync(companiesPath)) return [];
    try {
      const data = fs.readFileSync(companiesPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading companies.json:', e);
      return [];
    }
  };

  // Helper to save companies
  const saveCompanies = (companies: Company[]) => {
    fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2));
  };

  if (req.method === 'GET') {
    try {
      const companies = loadCompanies();
      res.status(200).json({ companies });
    } catch (error) {
      console.error('Error fetching companies:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, nif, email, seriesBase, regime } = req.body;

      if (!name || !nif) {
        return res.status(400).json({ error: 'Nome e NIF são obrigatórios' });
      }

      const companies = loadCompanies();
      if (companies.some(c => c.nif === nif)) {
        return res.status(409).json({ error: 'Empresa com este NIF já existe' });
      }

      const newCompany: Company = {
        id: crypto.randomUUID(),
        name,
        tradeName: req.body.tradeName || name,
        nif,
        email: email || '',
        phone: req.body.phone || '',
        address: req.body.address || '',
        city: req.body.city || '',
        province: req.body.province || '',
        postalCode: req.body.postalCode || '',
        seriesBase: seriesBase || new Date().getFullYear().toString(),
        regime: regime || 'Geral',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Initialize Series for this company
      // This will automatically create the file with default series
      // We pass the filename relative to data path, e.g. 'series-uuid.json'
      const seriesFileName = `series-${newCompany.id}.json`;
      // The SeriesStore constructor handles file creation and seeding defaults
      // We just instantiate it to trigger the logic.
      // However, the constructor calls loadSeries() which calls seedDefaults() if empty.
      // So just creating the instance is enough.
      new SeriesStore(seriesFileName);

      // 2. Initialize Default License (Trial)
      const licenseFileName = `license-${newCompany.id}.json`;
      const licensePath = resolveDataPath(licenseFileName);
      // Create a basic trial license structure (mock)
      // In a real scenario, this would generate a signed key.
      const trialLicense = {
        key: 'TRIAL-KEY-GENERATED', // Placeholder
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        type: 'TRIAL',
        companyId: newCompany.id,
        nif: newCompany.nif
      };
      fs.writeFileSync(licensePath, JSON.stringify(trialLicense, null, 2));

      companies.push(newCompany);
      saveCompanies(companies);

      res.status(201).json({ company: newCompany });
    } catch (error) {
      console.error('Error creating company:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
