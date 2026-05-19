import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';
import Product from '@/models/Product';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(200).json({ categories: [] });
    }

    const categories = await Product.distinct('category', { 
      companyId: activeCompany._id,
      category: { $ne: null, $ne: '' }
    });

    return res.status(200).json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}