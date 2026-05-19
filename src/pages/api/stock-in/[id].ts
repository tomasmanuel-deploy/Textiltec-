import type { NextApiRequest, NextApiResponse } from 'next';
import { stockInStore } from '../../../lib/stockInStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { stockStore } from '../../../lib/stockStore';
import { movementStore } from '../../../lib/movementStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { id } = req.query as { id: string };

  switch (method) {
    case 'GET': {
      const record = stockInStore.get(id);
      if (!record) return res.status(404).json({ error: 'Stock In not found' });
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
        const current = stockInStore.get(id);
        if (!current) return res.status(404).json({ error: 'Stock In not found' });
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
        const updated = stockInStore.update(id, updates);
        if (!updated) return res.status(404).json({ error: 'Stock In not found' });
        // Apply inventory impact on status change OR when editing a posted record
        try {
          if (current.status !== 'posted' && updated.status === 'posted') {
            for (const l of updated.lines) {
              const p = await getProductByIdHelper(l.productId);
              if (p?.isService) continue;
              stockStore.adjust(updated.warehouseId, l.productId, l.quantity);
              movementStore.record({ warehouseId: updated.warehouseId, productId: l.productId, delta: l.quantity, source: 'stock_in', reference: updated.reference });
            }
          } else if (current.status === 'posted' && updated.status !== 'posted') {
            for (const l of updated.lines) {
              const p = await getProductByIdHelper(l.productId);
              if (p?.isService) continue;
              stockStore.adjust(updated.warehouseId, l.productId, -l.quantity);
              movementStore.record({ warehouseId: updated.warehouseId, productId: l.productId, delta: -l.quantity, source: 'stock_in', reference: updated.reference });
            }
          } else if (current.status === 'posted' && updated.status === 'posted') {
            const sumByProduct = async (lines: Array<{ productId: string; quantity: number }>) => {
              const map = new Map<string, number>();
              for (const ln of lines) {
                const p = await getProductByIdHelper(ln.productId);
                if (p?.isService) continue;
                map.set(ln.productId, (map.get(ln.productId) || 0) + ln.quantity);
              }
              return map;
            };
            const applied: Array<{ warehouseId: string; productId: string; delta: number }> = [];
            const oldSum = await sumByProduct(current.lines);
            const newSum = await sumByProduct(updated.lines);
            try {
              if (current.warehouseId !== updated.warehouseId) {
                oldSum.forEach((qty, pid) => {
                  stockStore.adjust(current.warehouseId, pid, -qty);
                  applied.push({ warehouseId: current.warehouseId, productId: pid, delta: -qty });
                  movementStore.record({ warehouseId: current.warehouseId, productId: pid, delta: -qty, source: 'stock_in', reference: updated.reference });
                });
                newSum.forEach((qty, pid) => {
                  stockStore.adjust(updated.warehouseId, pid, +qty);
                  applied.push({ warehouseId: updated.warehouseId, productId: pid, delta: +qty });
                  movementStore.record({ warehouseId: updated.warehouseId, productId: pid, delta: +qty, source: 'stock_in', reference: updated.reference });
                });
              } else {
                const allPids = new Set<string>([...Array.from(oldSum.keys()), ...Array.from(newSum.keys())]);
                Array.from(allPids).forEach(pid => {
                  const before = oldSum.get(pid) || 0;
                  const after = newSum.get(pid) || 0;
                  const delta = after - before;
                  if (delta !== 0) {
                    stockStore.adjust(updated.warehouseId, pid, delta);
                    applied.push({ warehouseId: updated.warehouseId, productId: pid, delta });
                    movementStore.record({ warehouseId: updated.warehouseId, productId: pid, delta, source: 'stock_in', reference: updated.reference });
                  }
                });
              }
            } catch (applyErr) {
              try {
                for (const op of applied.reverse()) {
                  stockStore.adjust(op.warehouseId, op.productId, -op.delta);
                }
                stockInStore.update(id, current);
              } catch (rollbackError) {
                console.error('Rollback failed after posted edit impact error:', rollbackError);
              }
              const msg = applyErr instanceof Error ? applyErr.message : 'Stock impact error during edit';
              return res.status(400).json({ error: msg });
            }
          }
        } catch (impactError) {
          try {
            stockInStore.update(id, current);
          } catch (rollbackError) {
            console.error('Rollback failed after stock-in impact error:', rollbackError);
          }
          const msg = impactError instanceof Error ? impactError.message : 'Stock impact error';
          return res.status(400).json({ error: msg });
        }
        return res.status(200).json(updated);
      } catch (error) {
        console.error('Error updating stock-in:', error);
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
    case 'DELETE': {
      const current = stockInStore.get(id);
      if (!current) return res.status(404).json({ error: 'Stock In not found' });
      if (current.status === 'posted') {
        try {
          for (const l of current.lines) {
            const p = await getProductByIdHelper(l.productId);
            if (p?.isService) continue;
            stockStore.adjust(current.warehouseId, l.productId, -l.quantity);
            movementStore.record({ warehouseId: current.warehouseId, productId: l.productId, delta: -l.quantity, source: 'stock_in', reference: current.reference });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Insufficient stock to revert posted record';
          return res.status(400).json({ error: msg });
        }
      }
      const ok = stockInStore.delete(id);
      if (!ok) return res.status(404).json({ error: 'Stock In not found' });
      return res.status(204).end('');
    }
    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return res.status(405).end('Method Not Allowed');
  }
}