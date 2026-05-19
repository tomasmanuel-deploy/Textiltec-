import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';
import Client from '@/models/Client';
import DocumentModel from '@/models/Document';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    switch (req.method) {
      case 'GET':
        return handleGet(req, res);
      case 'POST':
        return handlePost(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in clients API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const activeCompany = await Company.findOne({ isDefault: true }).lean();
  if (!activeCompany) {
    return res.status(200).json({
      clients: [],
      pagination: { total: 0, limit: 10, offset: 0, hasMore: false }
    });
  }

  const { status, search, limit = '10', offset = '0' } = req.query;
  
  const limitNum = parseInt(limit as string, 10);
  const offsetNum = parseInt(offset as string, 10);
  
  const query: any = { companyId: activeCompany._id };
  
  if (status) {
    query.status = status as 'active' | 'inactive';
  }
  
  if (search) {
    const s = String(search).trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { nif: { $regex: s, $options: 'i' } }
    ];
  }

  const total = await Client.countDocuments(query);
  const dbClients = await Client.find(query)
    .sort({ createdAt: -1 })
    .skip(offsetNum)
    .limit(limitNum)
    .lean();

  // Find NIFs that have invoices under this active company
  const activeNifList = await DocumentModel.find({ "seller.nif": activeCompany.nif }).distinct('buyer.nif');
  const nifWithInvoices = new Set(activeNifList.map(n => String(n || '').trim()));

  const clients = dbClients.map(c => ({
    id: String(c._id),
    name: c.name,
    tradeName: c.tradeName,
    nif: c.nif,
    address: c.address,
    email: c.email,
    phone: c.phone,
    clientType: c.clientType,
    status: c.status,
    notes: c.notes,
    hasInvoices: nifWithInvoices.has(c.nif),
    createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : new Date().toISOString(),
  }));

  res.status(200).json({
    clients,
    pagination: {
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < total
    }
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const activeCompany = await Company.findOne({ isDefault: true }).lean();
  if (!activeCompany) {
    return res.status(400).json({ error: 'Nenhuma empresa ativa selecionada para associar o cliente' });
  }

  const { name, tradeName, nif, address, email, phone, clientType, notes } = req.body;
  
  // Validation
  if (!name || !nif || !address || !clientType) {
    return res.status(400).json({ 
      error: 'Campos obrigatórios em falta',
      required: ['name', 'nif', 'address', 'clientType']
    });
  }
  
  // Check if NIF already exists inside active company
  const exists = await Client.findOne({ companyId: activeCompany._id, nif });
  if (exists) {
    return res.status(409).json({ error: 'Cliente com este NIF já existe nesta empresa' });
  }
  
  // Create new client in Mongoose
  const newClient = await Client.create({
    companyId: activeCompany._id,
    name,
    tradeName,
    nif,
    address,
    email,
    phone,
    clientType,
    status: 'active',
    notes
  });

  const mappedClient = {
    id: String(newClient._id),
    name: newClient.name,
    tradeName: newClient.tradeName,
    nif: newClient.nif,
    address: newClient.address,
    email: newClient.email,
    phone: newClient.phone,
    clientType: newClient.clientType,
    status: newClient.status,
    notes: newClient.notes,
    createdAt: newClient.createdAt.toISOString(),
    updatedAt: newClient.updatedAt.toISOString(),
  };
  
  res.status(201).json({
    message: 'Cliente criado com sucesso',
    client: mappedClient
  });
}