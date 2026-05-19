import type { NextApiRequest, NextApiResponse } from 'next';
import taxpayerConsultationService from '../../../../services/TaxpayerConsultationService';

/**
 * API endpoint for taxpayer consultation
 * Implements AGT v5_0_1 specification
 * 
 * GET /api/agt/taxpayer/consult?nif=123456789
 * Query params:
 *   - nif: Taxpayer NIF (required)
 *   - forceRefresh: boolean (optional, defaults to false)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nif, forceRefresh } = req.query;

    if (!nif || typeof nif !== 'string') {
      return res.status(400).json({
        error: 'NIF is required',
        code: 'MISSING_NIF',
      });
    }

    const refresh = forceRefresh === 'true' || forceRefresh === '1';

    // Consult taxpayer
    const taxpayerInfo = await taxpayerConsultationService.consultTaxpayer(nif, refresh);

    // Return 404 if not found or invalid
    if (!taxpayerInfo.isValid && taxpayerInfo.status === 'unknown') {
      return res.status(404).json({
        error: 'Taxpayer not found',
        code: 'TAXPAYER_NOT_FOUND',
        nif: taxpayerInfo.nif,
        validationErrors: taxpayerInfo.validationErrors,
      });
    }

    // Return 200 with taxpayer info
      return res.status(200).json({
        success: true,
        data: taxpayerInfo,
        cached: !refresh && taxpayerConsultationService.isCached(nif),
      });
  } catch (error: any) {
    console.error('Error in taxpayer consultation API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      code: 'INTERNAL_ERROR',
    });
  }
}
