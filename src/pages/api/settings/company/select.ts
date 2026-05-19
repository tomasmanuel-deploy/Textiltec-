import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import mongoose from 'mongoose';
import Company from '@/models/Company';
import connectToDatabase from '@/lib/mongoose';
import { companiesJsonPath, companyJsonPath } from '@/lib/dataPaths';

const companiesPath = () => companiesJsonPath();
const activeCompanyPath = () => companyJsonPath();

function readCompanies(): any[] {
  try {
    if (fs.existsSync(companiesPath())) {
      const raw = fs.readFileSync(companiesPath(), 'utf-8');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }
  } catch {}
  return [];
}

function writeActiveCompanySnapshot(company: any, selectedId: string) {
  const snapshot = { ...company };
  delete snapshot._id;
  delete snapshot.__v;
  
  // Preserve software identification fields from existing active snapshot if needed
  const existing = fs.existsSync(activeCompanyPath()) ? JSON.parse(fs.readFileSync(activeCompanyPath(), 'utf-8') || '{}') : {};
  const preferExisting = (cur: any, incoming: any) => {
    const s = String(cur || '').trim();
    return s ? cur : incoming;
  };

  const companyData = {
    ...snapshot,
    saftProductId: preferExisting(existing.saftProductId, snapshot.saftProductId),
    saftProductVersion: preferExisting(existing.saftProductVersion, snapshot.saftProductVersion),
    saftProductCompanyTaxId: preferExisting(existing.saftProductCompanyTaxId, snapshot.saftProductCompanyTaxId),
    saftSoftwareCertificateNumber: preferExisting(existing.saftSoftwareCertificateNumber, snapshot.saftSoftwareCertificateNumber),
    selectedCompanyId: selectedId
  };

  fs.writeFileSync(activeCompanyPath(), JSON.stringify(companyData, null, 2), 'utf-8');
  return companyData;
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID da empresa é obrigatório' });
    }

    let dbConnected = false;
    let selectedDbCompany: any = null;

    try {
      await connectToDatabase();
      dbConnected = true;
      
      const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
      if (isValidObjectId) {
        selectedDbCompany = await Company.findById(id);
      } else {
        // Fallback search by NIF or name if a legacy ID was supplied
        selectedDbCompany = await Company.findOne({ $or: [{ nif: id }, { name: id }] });
      }
    } catch (dbErr) {
      console.warn('Banco de dados indisponível para seleção, usando fallback JSON:', dbErr);
    }

    if (dbConnected && selectedDbCompany) {
      // Set as default (the pre-save hook in Company model handles resetting other companies)
      selectedDbCompany.isDefault = true;
      const savedCompany = await selectedDbCompany.save();
      
      // Write snapshot to company.json for backwards compatibility
      const companyObject = savedCompany.toObject();
      const snapshot = writeActiveCompanySnapshot(companyObject, String(savedCompany._id));
      
      return res.status(200).json({
        message: 'Empresa ativa atualizada no DB',
        company: formatCompanyResponse(companyObject),
        snapshot
      });
    }

    // JSON Fallback
    const companies = readCompanies();
    const selectedJson = companies.find(c => c.id === id || c.nif === id);
    if (!selectedJson) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const snapshot = writeActiveCompanySnapshot(selectedJson, id);
    return res.status(200).json({
      message: 'Empresa ativa atualizada via fallback JSON',
      company: snapshot,
      snapshot
    });

  } catch (err) {
    console.error('Erro ao selecionar empresa ativa:', err);
    return res.status(500).json({ error: 'Falha ao selecionar empresa ativa' });
  }
}