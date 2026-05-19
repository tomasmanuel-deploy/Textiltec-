import { NextApiRequest, NextApiResponse } from 'next';
import { warehouseStore } from '../../../lib/warehouseStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid warehouse ID' });
  }

  switch (req.method) {
    case 'GET': {
      const warehouse = warehouseStore.getWarehouse(id);
      if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
      return res.status(200).json({ warehouse });
    }
    case 'PUT': {
      try {
        const updates = req.body || {};
        if (updates.status && updates.status !== 'active' && updates.status !== 'inactive') {
          return res.status(400).json({ error: 'Invalid status' });
        }
        const updated = warehouseStore.updateWarehouse(id, updates);
        if (!updated) return res.status(404).json({ error: 'Warehouse not found' });
        return res.status(200).json(updated);
      } catch (error) {
        console.error('Error updating warehouse:', error);
        if (error instanceof Error && error.message.includes('unique')) {
          return res.status(409).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    case 'DELETE': {
      const ok = warehouseStore.deleteWarehouse(id);
      if (!ok) return res.status(404).json({ error: 'Warehouse not found' });
      return res.status(200).json({ message: 'Warehouse deleted' });
    }
    default: {
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
  }
}