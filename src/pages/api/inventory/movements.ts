import { NextApiRequest, NextApiResponse } from 'next';
import { movementStore } from '../../../lib/movementStore';
import { warehouseStore } from '../../../lib/warehouseStore';
import { getProductByIdHelper } from '../../../lib/mongooseProductHelper';
import connectToDatabase from '../../../lib/mongoose';
import Company from '../../../models/Company';
import Product from '../../../models/Product';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(200).json({ movements: [], total: 0 });
    }

    // Get product IDs for the active company
    const companyProducts = await Product.find(
      { companyId: activeCompany._id },
      { _id: 1 }
    ).lean();
    const companyProductIds = new Set(companyProducts.map(p => String(p._id)));

    const { warehouseId, productId, limit, offset } = req.query;
    const parsedLimit = limit ? parseInt(String(limit), 10) : 50;
    const parsedOffset = offset ? parseInt(String(offset), 10) : 0;

    const { movements, total } = movementStore.list({
      warehouseId: typeof warehouseId === 'string' ? warehouseId : undefined,
      productId: typeof productId === 'string' ? productId : undefined,
      limit: 999, // fetch all, then filter by company
      offset: 0,
    });

    // Filter to only company products
    const filtered = movements.filter(m => companyProductIds.has(m.productId));
    const companyTotal = filtered.length;
    const paged = filtered.slice(parsedOffset, parsedOffset + parsedLimit);

    const enriched = await Promise.all(paged.map(async (m) => {
      const warehouse = warehouseStore.getWarehouse(m.warehouseId);
      const product = await getProductByIdHelper(m.productId);
      return {
        ...m,
        warehouseName: warehouse?.name,
        productName: product?.name,
        productUnit: product?.unit,
      };
    }));

    return res.status(200).json({ movements: enriched, total: companyTotal });
  } catch (error) {
    console.error('Error fetching movements:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}