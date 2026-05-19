import { NextApiRequest, NextApiResponse } from 'next';
import { categoryStore } from '../../../lib/categoryStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const categoryId = Array.isArray(id) ? id[0] : id;
  if (!categoryId) return res.status(400).json({ error: 'ID inválido' });

  switch (req.method) {
    case 'PUT':
      return handlePut(categoryId, req, res);
    case 'DELETE':
      return handleDelete(categoryId, res);
    default:
      res.setHeader('Allow', ['PUT', 'DELETE']);
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

function handlePut(id: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, status } = req.body || {};

    if (name && categoryStore.nameExists(String(name), id)) {
      return res.status(400).json({ error: 'Já existe uma categoria com esse nome' });
    }

    const updated = categoryStore.updateCategory(id, {
      name: name ? String(name) : undefined,
      status: status as 'active' | 'inactive' | undefined,
    });

    if (!updated) return res.status(404).json({ error: 'Categoria não encontrada' });
    return res.status(200).json({ category: updated });
  } catch (error) {
    console.error('Error updating category:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function handleDelete(id: string, res: NextApiResponse) {
  try {
    const ok = categoryStore.deleteCategory(id);
    if (!ok) return res.status(404).json({ error: 'Categoria não encontrada' });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}