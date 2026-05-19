import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { resolveDataPath } from '@/lib/dataPaths';
import { documentStore } from '@/lib/documentStore';

interface Company {
  id: string;
  name: string;
  nif: string;
  // ... other fields
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const companiesPath = resolveDataPath('companies.json');

  const loadCompanies = (): Company[] => {
    if (!fs.existsSync(companiesPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
    } catch { return []; }
  };

  const saveCompanies = (companies: Company[]) => {
    fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2));
  };

  if (req.method === 'GET') {
    const companies = loadCompanies();
    const company = companies.find((c: any) => c.id === id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Fetch recent documents for this company
    const allDocs = documentStore.getAllDocuments();
    
    // Parse limit from query
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    
    // Filter by seller NIF matching company NIF
    const documents = allDocs
      .filter(d => d.seller?.nif && company.nif && d.seller.nif.trim() === company.nif.trim())
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
      .slice(0, limit); 

    res.status(200).json({ ...company, recentDocuments: documents });
  } else if (req.method === 'PUT') {
    const companies = loadCompanies();
    const index = companies.findIndex((c: any) => c.id === id);
    if (index === -1) return res.status(404).json({ error: 'Company not found' });

    const updatedCompany = { ...companies[index], ...req.body, updatedAt: new Date().toISOString() };
    companies[index] = updatedCompany;
    saveCompanies(companies);
    res.status(200).json(updatedCompany);
  } else if (req.method === 'DELETE') {
    const companies = loadCompanies();
    const newCompanies = companies.filter((c: any) => c.id !== id);
    if (newCompanies.length === companies.length) return res.status(404).json({ error: 'Company not found' });
    
    saveCompanies(newCompanies);
    // Optionally delete related files: series-{id}.json, license-{id}.json
    try {
      const seriesPath = resolveDataPath(`series-${id}.json`);
      if (fs.existsSync(seriesPath)) fs.unlinkSync(seriesPath);
      const licensePath = resolveDataPath(`license-${id}.json`);
      if (fs.existsSync(licensePath)) fs.unlinkSync(licensePath);
    } catch (e) {
      console.error('Error cleaning up company files:', e);
    }

    res.status(200).json({ message: 'Company deleted' });
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
