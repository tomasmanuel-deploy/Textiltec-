import { NextApiRequest, NextApiResponse } from 'next';
import { transferStore } from '../../../lib/transferStore';
import { stockStore } from '../../../lib/stockStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid transfer ID' });
  }

  switch (req.method) {
    case 'GET': {
      const transfer = transferStore.getTransfer(id);
      if (!transfer) return res.status(404).json({ error: 'Transfer not found' });
      return res.status(200).json({ transfer });
    }
    case 'PUT': {
      try {
        const updates = req.body || {};
        const current = transferStore.getTransfer(id);
        if (!current) return res.status(404).json({ error: 'Transfer not found' });
        if (updates.originWarehouseId && !warehouseStore.getWarehouse(updates.originWarehouseId)) {
          return res.status(400).json({ error: 'Invalid origin warehouse' });
        }
        if (updates.destinationWarehouseId && !warehouseStore.getWarehouse(updates.destinationWarehouseId)) {
          return res.status(400).json({ error: 'Invalid destination warehouse' });
        }
        if (updates.lines) {
          for (const line of updates.lines) {
            if (!line.productId || typeof line.quantity !== 'number' || line.quantity <= 0) {
              return res.status(400).json({ error: 'Invalid line item' });
            }
            const p = await getProductByIdHelper(line.productId);
            if (!p) return res.status(400).json({ error: `Invalid product in lines: ${line.productId}` });
          }
        }
        const updated = transferStore.updateTransfer(id, updates);
        if (!updated) return res.status(404).json({ error: 'Transfer not found' });
        // Apply stock impact when changing status (ignore service products)
        try {
          const filterServiceLines = async (lines: Array<{ productId: string; quantity: number }>) => {
            const results: Array<{ productId: string; quantity: number }> = [];
            for (const l of lines) {
              const p = await getProductByIdHelper(l.productId);
              if (!p?.isService) results.push(l);
            }
            return results;
          };

          if (current.status !== 'posted' && updated.status === 'posted') {
            stockStore.applyTransfer({
              originWarehouseId: updated.originWarehouseId,
              destinationWarehouseId: updated.destinationWarehouseId,
              lines: await filterServiceLines(updated.lines),
            });
          } else if (current.status === 'posted' && updated.status !== 'posted') {
            stockStore.revertTransfer({
              originWarehouseId: updated.originWarehouseId,
              destinationWarehouseId: updated.destinationWarehouseId,
              lines: await filterServiceLines(updated.lines),
            });
          }
        } catch (impactError) {
          try {
            transferStore.updateTransfer(id, current);
          } catch (rollbackError) {
            console.error('Rollback failed after stock impact error:', rollbackError);
          }
          const msg = impactError instanceof Error ? impactError.message : 'Stock impact error';
          return res.status(400).json({ error: msg });
        }
        return res.status(200).json(updated);
      } catch (error) {
        console.error('Error updating transfer:', error);
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    case 'DELETE': {
      const ok = transferStore.deleteTransfer(id);
      if (!ok) return res.status(404).json({ error: 'Transfer not found' });
      return res.status(200).json({ message: 'Transfer deleted' });
    }
    default: {
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return res.status(405).json({ error: 'Method not allowed' });
    }
  }
}