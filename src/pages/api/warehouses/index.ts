import { NextApiRequest, NextApiResponse } from 'next';
import { warehouseStore } from '../../../lib/warehouseStore';

function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { status, search } = req.query;
    const warehouses = warehouseStore.getWarehouses({
      status: typeof status === 'string' && (status === 'active' || status === 'inactive') ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
    return res.status(200).json({ warehouses });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, code, address, status } = req.body || {};

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    if (status && status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const warehouse = warehouseStore.createWarehouse({ name, code, address, status });
    return res.status(201).json(warehouse);
  } catch (error) {
    console.error('Error creating warehouse:', error);
    if (error instanceof Error && error.message.includes('unique')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method not allowed' });
  }
}