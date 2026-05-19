import type { NextApiRequest, NextApiResponse } from 'next';
import { supplierStore } from '../../../lib/supplierStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };
  if (!id) return res.status(400).json({ error: 'Falta id' });

  if (req.method === 'GET') {
    const supplier = supplierStore.getSupplierById(id);
    if (!supplier) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    return res.status(200).json({ supplier });
  }

  if (req.method === 'PUT') {
    const { name, tradeName, nif, address, email, phone, notes, status, clientType } = req.body || {};
    if (nif && supplierStore.nifExists(nif, id)) {
      return res.status(409).json({ error: 'NIF já existe' });
    }
    const updated = supplierStore.updateSupplier(id, { name, tradeName, nif, address, email, phone, notes, status, clientType });
    if (!updated) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    return res.status(200).json({ supplier: updated });
  }

  if (req.method === 'DELETE') {
    const ok = supplierStore.deleteSupplier(id);
    if (!ok) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ error: 'Método não permitido' });
}