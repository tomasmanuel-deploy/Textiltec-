import { NextApiRequest, NextApiResponse } from 'next';
import { CentralStore } from '../../../lib/centralStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple API Key Security
  const apiKey = req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.CENTRAL_API_KEY || 'default-secure-key-change-me';
  
  if (apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  try {
    const { tenantId, eventType, details, status } = req.body;
    
    if (!tenantId || !eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const log = CentralStore.addLog({
      tenantId,
      eventType,
      details,
      status: status || 'success',
    });

    res.status(200).json({ success: true, logId: log.id });
  } catch (error) {
    console.error('Failed to ingest log:', error);
    res.status(500).json({ error: 'Failed to ingest log' });
  }
}
