import type { NextApiRequest, NextApiResponse } from 'next';
import { getComputerCode } from '@/services/MachineIdService';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const code = getComputerCode();
    return res.status(200).json({ code });
  } catch {
    return res.status(500).json({ error: 'Unable to compute machine code' });
  }
}