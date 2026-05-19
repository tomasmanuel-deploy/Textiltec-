import type { NextApiRequest, NextApiResponse } from 'next';
import { supplierStore } from '../../../lib/supplierStore';

function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { status, search, clientType, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const parsedLimit = Math.max(0, parseInt(limit as string, 10) || 50);
    const parsedOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    const { suppliers, total } = supplierStore.filterSuppliers({
      status: (status as any) || undefined,
      clientType: (clientType as any) || undefined,
      search: search || undefined,
      limit: parsedLimit,
      offset: parsedOffset
    });
    return res.status(200).json({ suppliers, pagination: { total, limit: parsedLimit, offset: parsedOffset } });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao obter fornecedores', details: e?.message });
  }
}

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, tradeName, nif, address, email, phone, notes, clientType } = req.body || {};
    if (!name || !nif || !address) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, nif, address' });
    }
    if (supplierStore.nifExists(nif)) {
      return res.status(409).json({ error: 'NIF já existe' });
    }
    const supplier = supplierStore.createSupplier({
      name,
      tradeName,
      nif,
      address,
      email,
      phone,
      status: 'active',
      notes,
      clientType: clientType === 'individual' ? 'individual' : 'company'
    });
    return res.status(201).json({ supplier });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao criar fornecedor', details: e?.message });
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Método não permitido' });
}