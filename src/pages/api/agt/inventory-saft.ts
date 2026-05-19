import { NextApiRequest, NextApiResponse } from 'next';
import { AgtService } from '../../../services/AgtService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;
  const inventoryDate = date ? new Date(date as string) : new Date();

  try {
    const agtService = new AgtService();
    const xml = await agtService.generateInventorySaftXml(inventoryDate);
    
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="SAFT_INV_${inventoryDate.toISOString().split('T')[0]}.xml"`);
    res.status(200).send(xml);
  } catch (error) {
    console.error('Inventory SAF-T Export error:', error);
    res.status(500).json({ error: 'Failed to generate Inventory SAF-T' });
  }
}
