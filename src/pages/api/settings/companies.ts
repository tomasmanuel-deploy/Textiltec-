import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import Company from '@/models/Company';
import connectToDatabase from '@/lib/mongoose';
import { companyJsonPath } from '@/lib/dataPaths';

const activeCompanyPath = companyJsonPath();

function readActiveCompanySnapshot(): any {
  try {
    if (fs.existsSync(activeCompanyPath)) {
      const raw = fs.readFileSync(activeCompanyPath, 'utf-8');
      return raw ? JSON.parse(raw) : {};
    }
  } catch (err) {
    console.warn('Erro ao ler snapshot de company.json:', err);
  }
  return {};
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
      const companies = await Company.find().lean();
      const activeCompany = companies.find(company => company.isDefault);
      return res.status(200).json({
        companies: companies.map(formatCompanyResponse),
        activeCompanyId: activeCompany ? String(activeCompany._id) : undefined,
      });
    } catch (err) {
      console.warn('DB unavailable, falling back to file companies list:', err);
      const fallback = readActiveCompanySnapshot();
      return res.status(200).json({ companies: [], activeCompanyId: fallback.selectedCompanyId });
    }
  }

  if (req.method === 'POST') {
    try {
      await connectToDatabase();
      const payload = req.body || {};
      
      const company = new Company({
        name: payload.name || '',
        tradeName: payload.tradeName || payload.name || '',
        nif: payload.nif || '',
        address: payload.address || '',
        city: payload.city || 'Luanda',
        province: payload.province || 'Luanda',
        postalCode: payload.postalCode || '0000',
        email: payload.email || '',
        phone: payload.phone || '',
        bankAccounts: Array.isArray(payload.bankAccounts) ? payload.bankAccounts : [],
        saftProductId: payload.saftProductId || 'Prakash_Billing_1.0',
        saftProductVersion: payload.saftProductVersion || '1.0.6',
        saftProductCompanyTaxId: payload.nif || '',
        saftSoftwareCertificateNumber: payload.saftSoftwareCertificateNumber || '0000/AGT/2026',
        saftSoftwareValidationNumber: payload.saftSoftwareValidationNumber || '0000',
        regime: payload.regime || 'Geral',
        seriesBase: payload.seriesBase || new Date().getFullYear().toString(),
        isCabinda: !!payload.isCabinda,
        isDefault: false,
      });
      const saved = await company.save();

      // Create corresponding owner User in DB if password is provided
      if (payload.password) {
        const User = (await import('@/models/User')).default;
        const existingUser = await User.findOne({ email: payload.email });
        if (!existingUser) {
          const user = new User({
            name: payload.name,
            email: payload.email,
            password: payload.password,
            role: 'admin',
            active: true
          });
          await user.save();
        }
      }

      return res.status(201).json({ company: formatCompanyResponse(saved.toObject()) });
    } catch (err: any) {
      console.error('Erro ao criar empresa:', err);
      if (err.code === 11000) {
        return res.status(409).json({ error: 'Já existe uma empresa com este NIF' });
      }
      return res.status(500).json({ error: `Falha ao criar empresa: ${err.message || err}` });
    }
  }

  if (req.method === 'PUT') {
    try {
      await connectToDatabase();
      const payload = req.body || {};
      const { id } = payload;
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      const existing = await Company.findById(id);
      if (!existing) return res.status(404).json({ error: 'Empresa não encontrada' });
      existing.name = payload.name ?? existing.name;
      existing.tradeName = payload.tradeName ?? existing.tradeName;
      existing.address = payload.address ?? existing.address;
      existing.city = payload.city ?? existing.city;
      existing.province = payload.province ?? existing.province;
      existing.postalCode = payload.postalCode ?? existing.postalCode;
      existing.email = payload.email ?? existing.email;
      existing.phone = payload.phone ?? existing.phone;
      existing.bankAccounts = Array.isArray(payload.bankAccounts) ? payload.bankAccounts : existing.bankAccounts;
      existing.regime = payload.regime ?? existing.regime;
      existing.seriesBase = payload.seriesBase ?? existing.seriesBase;
      existing.isCabinda = payload.isCabinda !== undefined ? !!payload.isCabinda : existing.isCabinda;
      existing.saftProductId = payload.saftProductId ?? existing.saftProductId;
      existing.saftProductVersion = payload.saftProductVersion ?? existing.saftProductVersion;
      existing.saftProductCompanyTaxId = payload.saftProductCompanyTaxId ?? existing.saftProductCompanyTaxId;
      existing.saftSoftwareCertificateNumber = payload.saftSoftwareCertificateNumber ?? existing.saftSoftwareCertificateNumber;
      existing.saftSoftwareValidationNumber = payload.saftSoftwareValidationNumber ?? existing.saftSoftwareValidationNumber;
      const updated = await existing.save();
      return res.status(200).json({ company: formatCompanyResponse(updated.toObject()) });
    } catch (err) {
      console.error('Erro ao atualizar empresa:', err);
      return res.status(500).json({ error: 'Falha ao atualizar empresa' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}
