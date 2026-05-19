import { NextApiRequest, NextApiResponse } from 'next';
import { stockStore } from '../../../lib/stockStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { movementStore } from '../../../lib/movementStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';
import connectToDatabase from '../../../lib/mongoose';
import Company from '../../../models/Company';
import Product from '../../../models/Product';

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(200).json({ stocks: [] });
    }

    // Get all product IDs belonging to the active company
    const companyProducts = await Product.find(
      { companyId: activeCompany._id },
      { _id: 1 }
    ).lean();
    const companyProductIds = new Set(companyProducts.map(p => String(p._id)));

    const { warehouseId, productId } = req.query;
    let records = stockStore.getAll();

    // Filter by company products first
    records = records.filter(r => companyProductIds.has(r.productId));

    if (typeof warehouseId === 'string' && warehouseId) {
      records = records.filter(r => r.warehouseId === warehouseId);
    }
    if (typeof productId === 'string' && productId) {
      records = records.filter(r => r.productId === productId);
    }
    const enriched = await Promise.all(records.map(async r => {
      const product = await getProductByIdHelper(r.productId);
      const warehouse = warehouseStore.getWarehouse(r.warehouseId);
      return {
        ...r,
        productName: product?.name,
        productUnit: product?.unit,
        warehouseName: warehouse?.name
      };
    }));
    return res.status(200).json({ stocks: enriched });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { warehouseId, productId, delta } = req.body || {};
    if (!warehouseId || !productId || typeof delta !== 'number') {
      return res.status(400).json({ error: 'warehouseId, productId and delta are required' });
    }
    stockStore.adjust(warehouseId, productId, delta);
    movementStore.record({
      warehouseId,
      productId,
      delta,
      source: 'manual',
    });
    return res.status(200).json({ quantity: stockStore.getQuantity(warehouseId, productId) });
  } catch (error) {
    console.error('Error adjusting inventory:', error);
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