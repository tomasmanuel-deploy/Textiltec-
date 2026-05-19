import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { resolveDataPath } from '@/lib/dataPaths';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const licensePath = resolveDataPath(`license-${id}.json`);

  if (req.method === 'GET') {
    if (fs.existsSync(licensePath)) {
      const license = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
      res.status(200).json(license);
    } else {
      res.status(404).json({ error: 'License not found' });
    }
  } else if (req.method === 'PUT') {
    // Update license (e.g. extend expiry, change type)
    const { type, expiresAt, status } = req.body;
    
    let currentLicense: any = {};
    if (fs.existsSync(licensePath)) {
      currentLicense = JSON.parse(fs.readFileSync(licensePath, 'utf-8'));
    }

    const updatedLicense = {
      ...currentLicense,
      type: type || currentLicense.type || 'STANDARD',
      // If expiresAt is provided, update it. If extending, calculate new date.
      expiresAt: expiresAt || currentLicense.expiresAt,
      // If user manually sets status
      status: status || 'active',
      updatedAt: new Date().toISOString()
    };
    
    // In a real system, we would generate a new signed key here
    updatedLicense.key = `KEY-${id}-${updatedLicense.type}-${Date.now()}`; 

    fs.writeFileSync(licensePath, JSON.stringify(updatedLicense, null, 2));
    res.status(200).json(updatedLicense);
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}
