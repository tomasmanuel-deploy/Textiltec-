import { NextApiRequest, NextApiResponse } from 'next';
import { documentStore } from '../../../lib/documentStore';
import PdfCacheService from '../../../services/PdfCacheService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Restrict to development or explicit testing flag
  const allowReset = process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_RESET === '1';
  if (!allowReset) {
    return res.status(403).json({ error: 'Operação não permitida em produção' });
  }

  try {
    const result = documentStore.wipePreservingCounters();
    await PdfCacheService.clearAllCache();

    return res.status(200).json({ message: 'Histórico de documentos e PDFs limpo com sucesso.', ...result });
  } catch (error) {
    console.error('Erro ao limpar histórico:', error);
    return res.status(500).json({ error: 'Falha ao limpar histórico de documentos.' });
  }
}
