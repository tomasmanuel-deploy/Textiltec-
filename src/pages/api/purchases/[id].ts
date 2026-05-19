import type { NextApiRequest, NextApiResponse } from 'next';
import { purchaseStore } from '../../../lib/purchaseStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { stockStore } from '../../../lib/stockStore';
import { movementStore } from '../../../lib/movementStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { id } = req.query as { id: string };

  switch (method) {
    case 'GET': {
      const record = purchaseStore.get(id);
      if (!record) return res.status(404).json({ error: 'Purchase not found' });
      const lines = await Promise.all(record.lines.map(async l => ({
        ...l,
        productName: (await getProductByIdHelper(l.productId))?.name,
      })));
      return res.status(200).json({
        ...record,
        warehouseName: warehouseStore.getWarehouse(record.warehouseId)?.name,
        lines
      });
    }
    case 'PUT': {
      try {
        const updates = req.body || {};
        const current = purchaseStore.get(id);
        if (!current) return res.status(404).json({ error: 'Purchase not found' });
        if (updates.warehouseId && !warehouseStore.getWarehouse(updates.warehouseId)) {
          return res.status(400).json({ error: 'Invalid warehouseId' });
        }
        if (updates.lines) {
          for (const l of updates.lines) {
            if (!l.productId || typeof l.quantity !== 'number' || l.quantity <= 0) {
              return res.status(400).json({ error: 'Invalid line item' });
            }
            const p = await getProductByIdHelper(l.productId);
            if (!p) return res.status(400).json({ error: `Invalid product: ${l.productId}` });
          }
        }
        const updated = purchaseStore.update(id, updates);
        if (!updated) return res.status(404).json({ error: 'Purchase not found' });
        // Apply inventory impact on status change
        try {
          if (current.status !== 'posted' && updated.status === 'posted') {
            for (const l of updated.lines) {
              const p = await getProductByIdHelper(l.productId);
              if (p?.isService) continue;
              stockStore.adjust(updated.warehouseId, l.productId, l.quantity);
              movementStore.record({ warehouseId: updated.warehouseId, productId: l.productId, delta: l.quantity, source: 'purchase', reference: id });
            }
          } else if (current.status === 'posted' && updated.status !== 'posted') {
            for (const l of updated.lines) {
              const p = await getProductByIdHelper(l.productId);
              if (p?.isService) continue;
              stockStore.adjust(updated.warehouseId, l.productId, -l.quantity);
              movementStore.record({ warehouseId: updated.warehouseId, productId: l.productId, delta: -l.quantity, source: 'purchase', reference: id });
            }
            movementStore.cancelByReference('purchase', id);
          }
        } catch (impactError) {
          try {
            purchaseStore.update(id, current);
          } catch (rollbackError) {
            console.error('Rollback failed after purchase impact error:', rollbackError);
          }
          const msg = impactError instanceof Error ? impactError.message : 'Stock impact error';
          return res.status(400).json({ error: msg });
        }
        return res.status(200).json(updated);
      } catch (error) {
        console.error('Error updating purchase:', error);
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    case 'DELETE': {
      const current = purchaseStore.get(id);
      if (!current) return res.status(404).json({ error: 'Purchase not found' });
      if (current.status === 'posted') {
        return res.status(400).json({ error: 'Cannot delete posted record. Revert to draft first.' });
      }
      const ok = purchaseStore.delete(id);
      if (!ok) return res.status(404).json({ error: 'Purchase not found' });
      return res.status(204).end('');
    }
    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return res.status(405).end('Method Not Allowed');
  }
}