import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';
import Product from '@/models/Product';

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(200).json({ products: [], pagination: { total: 0, limit: 10, offset: 0, hasMore: false } });
    }

    const { 
      status, 
      category, 
      search, 
      limit = '10', 
      offset = '0' 
    } = req.query;

    const parsedLimit = parseInt(limit as string, 10);
    const parsedOffset = parseInt(offset as string, 10);

    const query: any = { companyId: activeCompany._id };

    if (status) {
      query.active = status === 'active';
    }
    if (category) {
      query.category = category as string;
    }
    if (search) {
      const s = String(search).trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { sku: { $regex: s, $options: 'i' } }
      ];
    }

    const total = await Product.countDocuments(query);
    const dbProducts = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(parsedOffset)
      .limit(parsedLimit)
      .lean();

    // Map Mongoose fields to the frontend standard Product structure
    const products = dbProducts.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      description: p.description,
      code: p.sku,
      category: p.category || '',
      price: p.unitPrice,
      unit: p.unit,
      stock: p.stock,
      minStock: p.minStock,
      status: p.active ? 'active' : 'inactive',
      taxRate: p.vatRate,
      notes: '',
      isService: !!p.isService,
      createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt ? p.updatedAt.toISOString() : new Date().toISOString(),
    }));

    return res.status(200).json({
      products,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < total
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(400).json({ error: 'Nenhuma empresa ativa selecionada para associar o produto' });
    }

    const { name, description, code, category, price, unit, stock, minStock, status, taxRate, isService } = req.body;

    // Validation: unidade obrigatória apenas para produtos (não-serviços)
    if (!name || !code || !category || price === undefined || (!isService && !unit)) {
      return res.status(400).json({ 
        error: 'Nome, código, categoria e preço são obrigatórios; unidade é obrigatória para produtos'
      });
    }

    // Check if sku/code already exists within the SAME company
    const skuUpper = String(code).trim().toUpperCase();
    const exists = await Product.findOne({ companyId: activeCompany._id, sku: skuUpper });
    if (exists) {
      return res.status(400).json({ 
        error: 'Código do produto já existe nesta empresa' 
      });
    }

    // Validate price
    const unitPrice = parseFloat(price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ 
        error: 'Preço deve ser um número válido e não negativo' 
      });
    }

    const newProduct = await Product.create({
      companyId: activeCompany._id,
      sku: skuUpper,
      name: String(name).trim(),
      description: description ? String(description).trim() : '',
      category: category ? String(category).trim() : '',
      unitPrice,
      unit: isService ? '' : String(unit).trim(),
      stock: stock ? parseInt(stock, 10) : 0,
      minStock: minStock ? parseInt(minStock, 10) : 0,
      active: status !== 'inactive',
      vatRate: taxRate ? parseFloat(taxRate) : 14,
      isService: !!isService,
    });

    const mapped = {
      id: String(newProduct._id),
      name: newProduct.name,
      description: newProduct.description,
      code: newProduct.sku,
      category: newProduct.category || '',
      price: newProduct.unitPrice,
      unit: newProduct.unit,
      stock: newProduct.stock,
      minStock: newProduct.minStock,
      status: newProduct.active ? 'active' : 'inactive',
      taxRate: newProduct.vatRate,
      notes: '',
      isService: !!newProduct.isService,
      createdAt: newProduct.createdAt.toISOString(),
      updatedAt: newProduct.updatedAt.toISOString(),
    };

    return res.status(201).json(mapped);
  } catch (error) {
    console.error('Error creating product:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return await handleGet(req, res);
    case 'POST':
      return await handlePost(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end('Method Not Allowed');
  }
}