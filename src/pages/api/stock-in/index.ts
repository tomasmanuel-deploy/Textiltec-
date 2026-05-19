import type { NextApiRequest, NextApiResponse } from 'next';
import { stockInStore } from '../../../lib/stockInStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  switch (method) {
    case 'GET': {
      const { status } = req.query;
      const list = stockInStore.list(
        typeof status === 'string' && (status === 'draft' || status === 'posted') ? status : undefined
      ).map(r => ({
        ...r,
        warehouseName: warehouseStore.getWarehouse(r.warehouseId)?.name,
        totalLines: r.lines.length,
        totalQuantity: r.lines.reduce((sum, l) => sum + l.quantity, 0),
      }));
      return res.status(200).json({ stockIns: list });
    }
    case 'POST': {
      try {
        const body = req.body || {};
        const { warehouseId, lines, reference, status, date } = body;
        if (!warehouseId) return res.status(400).json({ error: 'warehouseId is required' });
        const wh = warehouseStore.getWarehouse(warehouseId);
        if (!wh) return res.status(400).json({ error: 'Invalid warehouseId' });
        if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'At least one line is required' });
        for (const l of lines) {
          if (!l.productId || typeof l.quantity !== 'number' || l.quantity <= 0) {
            return res.status(400).json({ error: 'Invalid line item' });
          }
          const p = await getProductByIdHelper(l.productId);
          if (!p) return res.status(400).json({ error: `Invalid product: ${l.productId}` });
        }
        const created = stockInStore.create({ warehouseId, lines, reference, status, date });
        return res.status(201).json(created);
      } catch (error) {
        console.error('Error creating stock-in:', error);
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end('Method Not Allowed');
  }
}