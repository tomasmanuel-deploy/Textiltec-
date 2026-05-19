import { NextApiRequest, NextApiResponse } from 'next';
import connectToDatabase from '@/lib/mongoose';
import Company from '@/models/Company';
import Client from '@/models/Client';
import DocumentModel from '@/models/Document';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID do cliente é obrigatório' });
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
    console.error('Error in client API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, clientId: string, activeCompany: any) {
  const client = await Client.findOne({ _id: clientId, companyId: activeCompany._id });
  
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado nesta empresa' });
  }

  const hasInvoices = !!(await DocumentModel.findOne({ "seller.nif": activeCompany.nif, "buyer.nif": client.nif }).lean());
  
  res.status(200).json({
    client: {
      id: String(client._id),
      name: client.name,
      tradeName: client.tradeName,
      nif: client.nif,
      address: client.address,
      email: client.email,
      phone: client.phone,
      clientType: client.clientType,
      status: client.status,
      notes: client.notes,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    },
    hasInvoices
  });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, clientId: string, activeCompany: any) {
  const client = await Client.findOne({ _id: clientId, companyId: activeCompany._id });
  
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado nesta empresa' });
  }
  
  const { name, tradeName, nif, address, email, phone, clientType, status, notes } = req.body;
  
  // Validation
  if (!name || !nif || !address || !clientType) {
    return res.status(400).json({ 
      error: 'Campos obrigatórios em falta',
      required: ['name', 'nif', 'address', 'clientType']
    });
  }
  
  // Check if NIF already exists (excluding current client)
  const exists = await Client.findOne({ companyId: activeCompany._id, nif, _id: { $ne: clientId } });
  if (exists) {
    return res.status(409).json({ error: 'Cliente com este NIF já existe nesta empresa' });
  }

  // Block NIF change if client has invoices
  if (nif !== client.nif) {
    const hasInvoices = !!(await DocumentModel.findOne({ "seller.nif": activeCompany.nif, "buyer.nif": client.nif }).lean());
    if (hasInvoices) {
      return res.status(409).json({ error: 'Não é possível alterar o NIF de um cliente que já possui faturas.' });
    }
  }
  
  client.name = String(name).trim();
  client.tradeName = tradeName ? String(tradeName).trim() : client.tradeName;
  client.nif = String(nif).trim();
  client.address = String(address).trim();
  client.email = email ? String(email).trim().toLowerCase() : client.email;
  client.phone = phone ? String(phone).trim() : client.phone;
  client.clientType = clientType;
  client.status = status || client.status;
  client.notes = notes ? String(notes).trim() : client.notes;

  await client.save();
  
  res.status(200).json({
    message: 'Cliente atualizado com sucesso',
    client: {
      id: String(client._id),
      name: client.name,
      tradeName: client.tradeName,
      nif: client.nif,
      address: client.address,
      email: client.email,
      phone: client.phone,
      clientType: client.clientType,
      status: client.status,
      notes: client.notes,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    }
  });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, clientId: string, activeCompany: any) {
  const client = await Client.findOne({ _id: clientId, companyId: activeCompany._id });
  
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado nesta empresa' });
  }

  const hasInvoices = !!(await DocumentModel.findOne({ "seller.nif": activeCompany.nif, "buyer.nif": client.nif }).lean());
  if (hasInvoices) {
    return res.status(409).json({ error: 'Não é possível eliminar um cliente que já possui faturas.' });
  }
  
  await Client.deleteOne({ _id: clientId, companyId: activeCompany._id });
  
  res.status(200).json({
    message: 'Cliente eliminado com sucesso',
    client: {
      id: String(client._id),
      name: client.name,
      nif: client.nif,
    }
  });
}