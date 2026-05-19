import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import Company, { ICompany } from '@/models/Company';
import connectToDatabase from '@/lib/mongoose';
import { companyJsonPath } from '@/lib/dataPaths';

const companyPath = companyJsonPath();

function readActiveCompanySnapshot(): any {
  try {
    if (fs.existsSync(companyPath)) {
      const raw = fs.readFileSync(companyPath, 'utf-8');
      return raw ? JSON.parse(raw) : {};
    }
  } catch (err) {
    console.warn('Erro ao ler snapshot de company.json:', err);
  }
  return {};
}

function writeActiveCompanySnapshot(company: any) {
  const snapshot = { ...company };
  delete snapshot._id;
  delete snapshot.__v;
  snapshot.selectedCompanyId = String(company._id || company.selectedCompanyId || '');
  fs.writeFileSync(companyPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

function buildCompanyPayload(payload: any, existing: any = {}, allowRestrictedFields: boolean) {
  const result: any = {
    name: payload.name ?? existing.name ?? '',
    tradeName: payload.tradeName ?? existing.tradeName ?? payload.name ?? '',
    address: payload.address ?? existing.address ?? '',
    city: payload.city ?? existing.city ?? '',
    province: payload.province ?? existing.province ?? '',
    postalCode: payload.postalCode ?? existing.postalCode ?? '',
    email: payload.email ?? existing.email ?? '',
    phone: payload.phone ?? existing.phone ?? '',
    bankAccounts: Array.isArray(payload.bankAccounts)
      ? payload.bankAccounts
      : existing.bankAccounts ?? [],
    regime: payload.regime ?? existing.regime ?? '',
    seriesBase: payload.seriesBase ?? existing.seriesBase ?? '',
    isCabinda: payload.isCabinda ?? existing.isCabinda ?? false,
  };

  if (allowRestrictedFields) {
    const preferExisting = (cur: any, incoming: any) => {
      const currentValue = String(cur || '').trim();
      return currentValue ? cur : incoming;
    };
    result.nif = preferExisting(existing.nif, payload.nif);
    result.saftProductId = preferExisting(existing.saftProductId, payload.saftProductId);
    result.saftProductVersion = preferExisting(existing.saftProductVersion, payload.saftProductVersion);
    result.saftProductCompanyTaxId = preferExisting(existing.saftProductCompanyTaxId, payload.saftProductCompanyTaxId);
    result.saftSoftwareCertificateNumber = preferExisting(existing.saftSoftwareCertificateNumber, payload.saftSoftwareCertificateNumber);
    result.saftSoftwareValidationNumber = preferExisting(existing.saftSoftwareValidationNumber, payload.saftSoftwareValidationNumber);
  } else {
    result.nif = existing.nif ?? '';
    result.saftProductId = existing.saftProductId ?? '';
    result.saftProductVersion = existing.saftProductVersion ?? '';
    result.saftProductCompanyTaxId = existing.saftProductCompanyTaxId ?? '';
    result.saftSoftwareCertificateNumber = existing.saftSoftwareCertificateNumber ?? '';
    result.saftSoftwareValidationNumber = existing.saftSoftwareValidationNumber ?? '';
  }

  return result;
}

function formatCompanyResponse(company: any) {
  if (!company) return null;
  const formatted = { ...company };
  if (formatted._id) formatted.id = String(formatted._id);
  delete formatted._id;
  delete formatted.__v;
  return formatted;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      await connectToDatabase();
      const activeCompany = await Company.findOne({ isDefault: true }).lean();
      if (activeCompany) {
        return res.status(200).json({ company: formatCompanyResponse(activeCompany) });
      }
    } catch (err) {
      console.warn('DB unavailable, fallback to file active company:', err);
    }

    const fallbackCompany = readActiveCompanySnapshot();
    return res.status(200).json({ company: fallbackCompany });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const payload = req.body || {};
    const allowRestrictedFields = req.method === 'POST';

    let activeCompany: any = null;
    let dbConnected = true;
    try {
      await connectToDatabase();
      activeCompany = await Company.findOne({ isDefault: true }).lean();
    } catch (err) {
      dbConnected = false;
      console.warn('DB unavailable for company save, falling back to file:', err);
    }

    const existing = activeCompany || readActiveCompanySnapshot();
    const companyPayload = buildCompanyPayload(payload, existing, allowRestrictedFields);

    try {
      if (dbConnected) {
        let savedCompany: ICompany | null = null;
        if (activeCompany) {
          savedCompany = await Company.findByIdAndUpdate(
            activeCompany._id,
            { ...companyPayload, isDefault: true },
            { new: true, runValidators: true, context: 'query' }
          );
        } else if (companyPayload.nif) {
          const existingByNif = await Company.findOne({ nif: companyPayload.nif });
          if (existingByNif) {
            existingByNif.set({ ...companyPayload, isDefault: true });
            savedCompany = await existingByNif.save();
          }
        }

        if (!savedCompany) {
          savedCompany = await Company.create({ ...companyPayload, isDefault: true });
        }

        const snapshot = writeActiveCompanySnapshot(savedCompany.toObject());
        return res.status(200).json({ message: 'Configuração guardada com sucesso', company: formatCompanyResponse(savedCompany.toObject()), snapshot });
      }

      // Fallback to file-based persistence if DB is unavailable
      const existingFile = existing;
      const effectivePayload = buildCompanyPayload(payload, existingFile, allowRestrictedFields);

      if (req.method === 'POST') {
        const previous = existingFile;
        const preferExisting = (cur: any, incoming: any) => {
          const currentValue = String(cur || '').trim();
          return currentValue ? cur : incoming;
        };
        const selectedCompany = {
          ...previous,
          ...effectivePayload,
          nif: preferExisting(previous?.nif, payload.nif),
          saftProductId: preferExisting(previous?.saftProductId, payload.saftProductId),
          saftProductVersion: preferExisting(previous?.saftProductVersion, payload.saftProductVersion),
          saftProductCompanyTaxId: preferExisting(previous?.saftProductCompanyTaxId, payload.saftProductCompanyTaxId),
          saftSoftwareCertificateNumber: preferExisting(previous?.saftSoftwareCertificateNumber, payload.saftSoftwareCertificateNumber),
          saftSoftwareValidationNumber: preferExisting(previous?.saftSoftwareValidationNumber, payload.saftSoftwareValidationNumber),
        };
        const snapshot = writeActiveCompanySnapshot(selectedCompany);
        return res.status(200).json({ message: 'Configuração guardada com sucesso', company: snapshot });
      }

      const snapshot = writeActiveCompanySnapshot(effectivePayload);
      return res.status(200).json({ message: 'Configuração guardada com sucesso', company: snapshot });
    } catch (error: any) {
      console.error('Erro ao guardar empresa:', error);
      if (error.code === 11000) {
        return res.status(409).json({ error: 'Já existe uma empresa com este NIF' });
      }
      return res.status(500).json({ error: 'Falha ao guardar configuração da empresa' });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
