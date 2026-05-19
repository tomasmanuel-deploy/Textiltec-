import { NextApiRequest, NextApiResponse } from 'next';
import { categoryStore } from '../../../lib/categoryStore';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
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

function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const categories = categoryStore.getAllCategories();
    return res.status(200).json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name, status } = req.body || {};
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const existing = categoryStore.findByName(String(name));
    if (existing) {
      return res.status(200).json({ category: existing, existed: true });
    }

    const category = categoryStore.createCategory({ name: String(name), status });
    return res.status(201).json({ category });
  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}