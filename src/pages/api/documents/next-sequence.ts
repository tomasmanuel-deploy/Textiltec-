
import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { series, year } = req.query;

    if (!series || !year) {
      return res.status(400).json({ error: 'Missing series or year' });
    }

    const nextSeq = documentStore.getNextSequenceNumber(String(series), Number(year));
    
    return res.status(200).json({ nextSequence: nextSeq });
  } catch (error) {
    console.error('Error getting next sequence:', error);
    return res.status(500).json({ error: 'Failed to get next sequence number' });
  }
}
