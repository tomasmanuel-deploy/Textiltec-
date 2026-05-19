import { NextApiRequest, NextApiResponse } from 'next';
import { SeriesStore } from '@/lib/seriesStore';
import fs from 'fs';
import { resolveDataPath } from '@/lib/dataPaths';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid company ID' });
  }

  // Ensure company exists
  const companiesPath = resolveDataPath('companies.json');
  if (!fs.existsSync(companiesPath)) {
    return res.status(404).json({ error: 'Companies database not found' });
  }
  const companies = JSON.parse(fs.readFileSync(companiesPath, 'utf-8'));
  const company = companies.find((c: any) => c.id === id);
  
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  // Load series for this company
  // The SeriesStore constructor takes a custom path relative to data dir
  const seriesFileName = `series-${id}.json`;
  const store = new SeriesStore(seriesFileName);

  if (req.method === 'GET') {
    try {
      const series = store.getAllSeries();
      res.status(200).json({ series });
    } catch (error) {
      console.error('Error fetching series:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    try {
      // Create new series
      const { code, name, documentType, year, startNumber, isDefault } = req.body;
      
      if (!code || !documentType || !year) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const newSeries = store.createSeries({
        code,
        name: name || `${code} Series`,
        documentType,
        year: Number(year),
        startNumber: Number(startNumber) || 1,
        currentNumber: 0,
        active: true,
        isDefault: !!isDefault
      });

      res.status(201).json({ series: newSeries });
    } catch (error: any) {
      console.error('Error creating series:', error);
      res.status(400).json({ error: error.message || 'Error creating series' });
    }
  } else if (req.method === 'PUT') {
    try {
      // Update existing series
      const { code, year, active, isDefault } = req.body;
      
      if (!code || !year) {
        return res.status(400).json({ error: 'Missing code or year' });
      }

      const updated = store.updateSeries(code, Number(year), {
        active,
        isDefault
      });

      res.status(200).json({ series: updated });
    } catch (error: any) {
      console.error('Error updating series:', error);
      res.status(400).json({ error: error.message || 'Error updating series' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
