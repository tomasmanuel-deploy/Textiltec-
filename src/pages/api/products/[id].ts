import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';
import Product from '@/models/Product';
import DocumentModel from '@/models/Document';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID do produto é obrigatório' });
  }

  try {
    await connectToDatabase();
    const activeCompany = await Company.findOne({ isDefault: true }).lean();
    if (!activeCompany) {
      return res.status(400).json({ error: 'Nenhuma empresa ativa selecionada' });
    }

    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, id, activeCompany);
      case 'PUT':
        return await handlePut(req, res, id, activeCompany);
      case 'DELETE':
        return await handleDelete(req, res, id, activeCompany);
      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error handling product endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, id: string, activeCompany: any) {
  const product = await Product.findOne({ _id: id, companyId: activeCompany._id });
  
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado nesta empresa' });
  }

  const mapped = {
    id: String(product._id),
    name: product.name,
    description: product.description,
    code: product.sku,
    category: product.category || '',
    price: product.unitPrice,
    unit: product.unit,
    stock: product.stock,
    minStock: product.minStock,
    status: product.active ? 'active' : 'inactive',
    taxRate: product.vatRate,
    notes: '',
    isService: !!product.isService,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };

  return res.status(200).json(mapped);
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, id: string, activeCompany: any) {
  const { name, description, code, category, price, unit, stock, minStock, status, taxRate, isService } = req.body;

  const product = await Product.findOne({ _id: id, companyId: activeCompany._id });
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado nesta empresa' });
  }

  // Validation
  if (name !== undefined && !name) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  if (code !== undefined && !code) {
    return res.status(400).json({ error: 'Código é obrigatório' });
  }

  if (category !== undefined && !category) {
    return res.status(400).json({ error: 'Categoria é obrigatória' });
  }

  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ error: 'Preço deve ser um número válido e não negativo' });
  }

  if (unit !== undefined && !unit && !isService) {
    return res.status(400).json({ error: 'Unidade é obrigatória para produtos' });
  }

  // Check if code/sku already exists within the same company
  if (code) {
    const skuUpper = String(code).trim().toUpperCase();
    const exists = await Product.findOne({ companyId: activeCompany._id, sku: skuUpper, _id: { $ne: id } });
    if (exists) {
      return res.status(400).json({ error: 'Código do produto já existe nesta empresa' });
    }
  }

  product.name = name !== undefined ? String(name).trim() : product.name;
  product.description = description !== undefined ? String(description).trim() : product.description;
  product.sku = code !== undefined ? String(code).trim().toUpperCase() : product.sku;
  product.category = category !== undefined ? String(category).trim() : product.category;
  product.unitPrice = price !== undefined ? parseFloat(price) : product.unitPrice;
  product.unit = unit !== undefined ? String(unit).trim() : product.unit;
  product.stock = stock !== undefined ? parseInt(stock, 10) : product.stock;
  product.minStock = minStock !== undefined ? parseInt(minStock, 10) : product.minStock;
  product.active = status !== undefined ? status === 'active' : product.active;
  product.vatRate = taxRate !== undefined ? parseFloat(taxRate) : product.vatRate;
  product.isService = isService !== undefined ? !!isService : product.isService;

  await product.save();

  // Sync draft documents referencing this product's old/new SKU
  const draftDocs = await DocumentModel.find({ "seller.nif": activeCompany.nif, status: 'draft' });
  for (const doc of draftDocs) {
    let changed = false;
    const updatedLines = doc.lines.map((line: any) => {
      // Reference matching by SKU
      if (line.sku === product.sku) {
        changed = true;
        return {
          ...line,
          sku: product.sku,
          description: product.name,
          unitPrice: product.unitPrice,
          unit: product.unit,
          vatRate: product.vatRate
        };
      }
      return line;
    });
    if (changed) {
      doc.lines = updatedLines;
      if (typeof (doc as any).calculateTotals === 'function') {
        (doc as any).calculateTotals();
      }
      await doc.save();
    }
  }

  const mapped = {
    id: String(product._id),
    name: product.name,
    description: product.description,
    code: product.sku,
    category: product.category || '',
    price: product.unitPrice,
    unit: product.unit,
    stock: product.stock,
    minStock: product.minStock,
    status: product.active ? 'active' : 'inactive',
    taxRate: product.vatRate,
    notes: '',
    isService: !!product.isService,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };

  return res.status(200).json(mapped);
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, id: string, activeCompany: any) {
  const product = await Product.findOne({ _id: id, companyId: activeCompany._id });
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado nesta empresa' });
  }

  // Prevent deletion if product is referenced by any completed/issued fiscal documents (AGT)
  const fiscalTypes = new Set(['factura', 'nota_de_entrega', 'recibo', 'nota_de_credito']);
  const referencedDocs = await DocumentModel.find({
    "seller.nif": activeCompany.nif,
    documentType: { $in: Array.from(fiscalTypes) },
    "lines.sku": product.sku
  }).lean();

  if (referencedDocs.length > 0) {
    return res.status(400).json({ 
      error: 'Não é possível excluir o produto porque está referenciado em documentos fiscais (AGT)',
      documentIds: referencedDocs.map(d => String(d._id)),
      documents: referencedDocs.map(d => ({ 
        id: String(d._id), 
        series: d.series, 
        sequentialNumber: d.sequentialNumber, 
        status: d.status, 
        documentType: d.documentType 
      }))
    });
  }

  await Product.deleteOne({ _id: id, companyId: activeCompany._id });
  return res.status(200).json({ message: 'Produto excluído com sucesso' });
}