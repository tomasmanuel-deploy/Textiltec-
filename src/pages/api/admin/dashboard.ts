
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { documentStore } from '../../../lib/documentStore';
import { companiesJsonPath, resolveDataPath, licenseJsonPath } from '../../../lib/dataPaths';
import { verifyLicenseKey } from '../../../services/LicenseService';
import { AlertService } from '@/services/AlertService';

interface CompanyStats {
  id: string;
  name: string;
  nif: string;
  tradeName: string;
  documentCount: number;
  lastDocumentDate: string | null;
  agtStatus: {
    success: number;
    error: number;
    pending: number;
    offline: number;
  };
  license: {
    isValid: boolean;
    expiresAt: string | null;
    daysRemaining: number | null;
    status: 'active' | 'expired' | 'missing' | 'warning';
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Disable caching for real-time dashboard data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 1. Load companies
    const companiesPath = companiesJsonPath();
    let companies: any[] = [];
    if (fs.existsSync(companiesPath)) {
      const raw = fs.readFileSync(companiesPath, 'utf-8');
      companies = raw ? JSON.parse(raw) : [];
    }

    // 2. Load all documents
    const rawDocs = documentStore.getAllDocuments();
    let allDocs = rawDocs;
    
    // Filter by date range if provided
    const { startDate, endDate, documentType } = req.query;
    if (startDate && typeof startDate === 'string') {
      const start = new Date(startDate);
      allDocs = allDocs.filter(d => new Date(d.issueDate) >= start);
    }
    if (endDate && typeof endDate === 'string') {
      // Set to end of day
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      allDocs = allDocs.filter(d => new Date(d.issueDate) <= end);
    }
    if (documentType && typeof documentType === 'string' && documentType !== 'all') {
      // Filter by document type (e.g., FT, NC, FR)
      // Check both documentType and documentType code if available
      allDocs = allDocs.filter(d => {
        const type = String(d.documentType);
        return type === documentType || 
        (type === 'factura' && documentType === 'FT') ||
        (type === 'nota_de_credito' && documentType === 'NC') ||
        (type === 'recibo' && documentType === 'RC') ||
        (type === 'factura_recibo' && documentType === 'FR');
      });
    }

    // 3. Process each company
    const stats: CompanyStats[] = await Promise.all(companies.map(async (company) => {
      // Filter documents for this company (by NIF)
      const companyDocs = allDocs.filter(d => 
        (d.seller?.nif && company.nif && d.seller.nif.trim() === company.nif.trim())
      );
      
      // For lastDocDate, we should look at ALL documents, not just filtered ones, to know true activity
      const allCompanyDocs = rawDocs.filter(d => 
        (d.seller?.nif && company.nif && d.seller.nif.trim() === company.nif.trim())
      );

      // Calculate document stats
      const agtStatus = {
        success: 0,
        error: 0,
        pending: 0,
        offline: 0
      };

      let lastDocDateValue: Date | null = null;

      // Calculate last document date from ALL docs
      allCompanyDocs.forEach(d => {
        if (!d.issueDate) return;
        const docDate = new Date(d.issueDate);
        if (!isNaN(docDate.getTime())) {
          if (!lastDocDateValue || docDate > lastDocDateValue) {
            lastDocDateValue = docDate;
          }
        }
      });

      // Calculate stats from FILTERED docs
      const submittableTypes = [
        'factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito',
        'ft', 'fr', 'rc', 'nc', 'nd'
      ];

      companyDocs.forEach(d => {
        // AGT Status
        const status = d.agtSubmission?.status;
        const currentStatus = String(d.status);
        const isFinal = currentStatus === 'issued' || currentStatus === 'paid' || currentStatus === 'finalized';
        const type = String(d.documentType || '').toLowerCase();
        const isSubmittable = submittableTypes.includes(type);

        if (status === 'success') agtStatus.success++;
        else if (status === 'error') agtStatus.error++;
        else if (status === 'offline_pending') agtStatus.offline++;
        else if (status === 'pending') agtStatus.pending++;
        else if (!status && isFinal && isSubmittable) {
            // Count as pending if not sent but should have been
            agtStatus.pending++;
        }
      });

      // Alert if AGT error rate is high (> 10% and > 5 errors)
      const totalAgtDocs = agtStatus.success + agtStatus.error;
      if (totalAgtDocs > 0 && agtStatus.error > 5) {
        const errorRate = agtStatus.error / totalAgtDocs;
        if (errorRate > 0.1) {
          AlertService.sendAlert(
            'AGT_ERROR', 
            `Empresa ${company.name} com alta taxa de erros na AGT (${(errorRate * 100).toFixed(1)}%)`, 
            company.email || 'admin', 
            'high',
            company.phone // Pass phone for SMS alert
          );
        }
      }

      // Check License
      // Try company-specific license file first: license-{id}.json
      // Then fallback to global license.json if not found
      let licenseInfo = {
        isValid: false,
        expiresAt: null as string | null,
        daysRemaining: null as number | null,
        status: 'missing' as 'active' | 'expired' | 'missing' | 'warning'
      };

      let licenseKey = '';
      let licenseExp = '';

      // Check for specific license file
      const specificLicensePath = resolveDataPath(`license-${company.id}.json`);
      if (fs.existsSync(specificLicensePath)) {
         try {
           const l = JSON.parse(fs.readFileSync(specificLicensePath, 'utf-8'));
           licenseKey = l.key;
           licenseExp = l.extendedExp || l.notAfter;
         } catch {}
      } else {
        // Fallback to global license.json (assuming single-tenant installation or shared license)
        // But in multi-tenant mode, this might be incorrect. For now, we'll use it as fallback.
        try {
           const p = licenseJsonPath();
           if (fs.existsSync(p)) {
             const l = JSON.parse(fs.readFileSync(p, 'utf-8'));
             licenseKey = l.key;
             licenseExp = l.extendedExp || l.notAfter;
           }
        } catch {}
      }

      if (licenseKey) {
        const verify = verifyLicenseKey(licenseKey, { allowExtension: true });
        licenseInfo.isValid = verify.valid;
        
        // Calculate expiration from verification result or stored extendedExp
        const expStr = licenseExp || verify.payload?.exp;
        if (expStr) {
          licenseInfo.expiresAt = expStr;
          const expDate = new Date(expStr);
          const now = new Date();
          const diffTime = expDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          licenseInfo.daysRemaining = diffDays;

          if (!verify.valid) {
             licenseInfo.status = 'expired';
             AlertService.sendAlert(
               'LICENSE_EXPIRING', 
               `Licença da empresa ${company.name} expirou!`, 
               company.email || 'admin', 
               'high',
               company.phone
             );
          } else if (diffDays <= 30) {
            licenseInfo.status = 'warning';
            // Send alert if close to expiration (e.g. <= 7 days or exactly 30/15 days)
            if (diffDays <= 7 || diffDays === 30 || diffDays === 15) {
              AlertService.sendAlert(
                'LICENSE_EXPIRING', 
                `Licença da empresa ${company.name} expira em ${diffDays} dias.`, 
                company.email || 'admin', 
                diffDays <= 7 ? 'high' : 'medium',
                company.phone
              );
            }
          } else {
            licenseInfo.status = 'active';
          }
        } else {
          licenseInfo.status = verify.valid ? 'active' : 'expired';
        }
      }

      return {
        id: company.id,
        name: company.name || 'Unknown',
        tradeName: company.tradeName || '',
        nif: company.nif || '',
        documentCount: companyDocs.length,
        lastDocumentDate: lastDocDateValue ? (lastDocDateValue as any).toISOString() : null,
        agtStatus,
        license: licenseInfo
      };
    }));

    // AGT Compliance: Rounding helper (Round Half Up)
    const round = (value: number, decimals: number = 2): number => {
      return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    };

    // Calculate global metrics
    const monthlyData: Record<string, { count: number, revenue: number }> = {};
    
    allDocs.forEach(d => {
      const date = new Date(d.issueDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) monthlyData[key] = { count: 0, revenue: 0 };
      monthlyData[key].count++;
      monthlyData[key].revenue = round(monthlyData[key].revenue + (d.totals?.total || 0));
    });

    const monthlyEvolution = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate document type breakdown
    const documentTypeBreakdown: Record<string, number> = {};
    allDocs.forEach(d => {
      const type = d.documentType || 'Unknown';
      documentTypeBreakdown[type] = (documentTypeBreakdown[type] || 0) + 1;
    });

    const globalMetrics = {
      totalCompanies: companies.length,
      totalDocuments: allDocs.length,
      totalRevenue: round(allDocs.reduce((sum, d) => sum + (d.totals?.total || 0), 0)),
      activeLicenses: stats.filter(s => s.license.status === 'active' || s.license.status === 'warning').length,
      expiringLicenses: stats.filter(s => s.license.status === 'warning').length,
      agtPendingTotal: stats.reduce((sum, s) => sum + s.agtStatus.pending + s.agtStatus.offline, 0),
      agtErrorTotal: stats.reduce((sum, s) => sum + s.agtStatus.error, 0),
      agtSuccessTotal: stats.reduce((sum, s) => sum + s.agtStatus.success, 0),
      monthlyEvolution,
      documentTypeBreakdown: Object.entries(documentTypeBreakdown).map(([type, count]) => ({ type, count }))
    };

    res.status(200).json({
      companies: stats,
      globalMetrics
    });

  } catch (error) {
    console.error('Error fetching admin dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
