import { NextApiRequest, NextApiResponse } from 'next';
import { transferStore } from '../../../lib/transferStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { status } = req.query;
    const transfers = transferStore.getTransfers({
      status: typeof status === 'string' && (status === 'draft' || status === 'posted') ? status : undefined,
    });
    return res.status(200).json({ transfers });
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { originWarehouseId, destinationWarehouseId, lines, notes, status } = req.body || {};

    if (!originWarehouseId || !destinationWarehouseId) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }
    if (originWarehouseId === destinationWarehouseId) {
      return res.status(400).json({ error: 'Origin and destination must be different' });
    }

    const origin = warehouseStore.getWarehouse(originWarehouseId);
    const dest = warehouseStore.getWarehouse(destinationWarehouseId);
    if (!origin || !dest) {
      return res.status(400).json({ error: 'Invalid warehouse(s)' });
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'At least one line is required' });
    }
    for (const line of lines) {
      if (!line.productId || typeof line.quantity !== 'number' || line.quantity <= 0) {
        return res.status(400).json({ error: 'Invalid line item' });
      }
      const p = await getProductByIdHelper(line.productId);
      if (!p) {
        return res.status(400).json({ error: `Invalid product in lines: ${line.productId}` });
      }
    }

    const transfer = transferStore.createTransfer({ originWarehouseId, destinationWarehouseId, lines, notes, status });
    return res.status(201).json(transfer);
  } catch (error) {
    console.error('Error creating transfer:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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