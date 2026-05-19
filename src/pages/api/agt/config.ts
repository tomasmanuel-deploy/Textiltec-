import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface AgtConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  testMode: boolean;
  submissionMode?: 'online' | 'offline' | 'auto';
  establishmentNumber?: string;
  contingencySeriesCodes?: Record<string, Record<string, string>>;
  taxpayerConsultationUrl?: string;
  taxpayerUsername?: string;
  taxpayerPassword?: string;
  taxpayerDocType?: string;
  agtRestUrl?: string;
  agtUsername?: string;
  agtPassword?: string;
  restAuthMode?: 'headers' | 'basic';
  restUserHeader?: string;
  restPassHeader?: string;
  saftSubmissionUrl?: string;
  softwareCertificateNumber?: string;
  publicKeyFingerprint?: string;
  privateKeyPath?: string;
  environment?: 'production' | 'staging' | 'development';
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  allowMock?: boolean;
}

const configPath = path.join(process.cwd(), 'data', 'agt_config.json');

function readConfig(): AgtConfig | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading AGT config:', error);
  }
  return null;
}

function writeConfig(config: AgtConfig): void {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing AGT config:', error);
    throw error;
  }
}

/**
 * API endpoint for AGT configuration management
 * GET /api/agt/config - Get current configuration
 * POST /api/agt/config - Create/Update configuration
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const config = readConfig();
      if (!config) {
        return res.status(404).json({
          error: 'AGT configuration not found',
          code: 'CONFIG_NOT_FOUND',
        });
      }

      // Don't expose secret in response
      const { clientSecret, taxpayerPassword, agtPassword, ...safeConfig } = config;
      return res.status(200).json({
        success: true,
        config: safeConfig,
        hasSecret: !!clientSecret || !!taxpayerPassword || !!agtPassword,
      });
    } catch (error: any) {
      console.error('Error reading AGT config:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const {
        apiUrl,
        clientId,
        clientSecret,
        testMode,
        submissionMode,
        establishmentNumber,
        contingencySeriesCodes,
        taxpayerConsultationUrl,
        taxpayerUsername,
        taxpayerPassword,
        taxpayerDocType,
        agtRestUrl,
        agtUsername,
        agtPassword,
        restAuthMode,
        restUserHeader,
        restPassHeader,
        saftSubmissionUrl,
        softwareCertificateNumber,
        publicKeyFingerprint,
        privateKeyPath,
        environment,
        timeout,
        retryAttempts,
        retryDelay,
        allowMock,
      } = req.body;

      if (!apiUrl && !taxpayerConsultationUrl) {
        return res.status(400).json({
          error: 'apiUrl or taxpayerConsultationUrl is required',
          code: 'MISSING_REQUIRED_FIELDS',
        });
      }

      const existing = readConfig();
      const config: AgtConfig = {
        ...existing,
        apiUrl: apiUrl || existing?.apiUrl || '',
        clientId: clientId || existing?.clientId || '',
        clientSecret: clientSecret || existing?.clientSecret || '', // Preserve existing secret if not provided
        testMode: testMode !== undefined ? testMode : (existing?.testMode ?? true),
        submissionMode: submissionMode || existing?.submissionMode || 'online',
        establishmentNumber: establishmentNumber || existing?.establishmentNumber || 'SEDE',
        contingencySeriesCodes: contingencySeriesCodes || existing?.contingencySeriesCodes,
        taxpayerConsultationUrl: taxpayerConsultationUrl || existing?.taxpayerConsultationUrl,
        taxpayerUsername: taxpayerUsername || existing?.taxpayerUsername,
        taxpayerPassword: taxpayerPassword || existing?.taxpayerPassword,
        taxpayerDocType: taxpayerDocType || existing?.taxpayerDocType,
        agtRestUrl: agtRestUrl || existing?.agtRestUrl,
        agtUsername: agtUsername || existing?.agtUsername,
        agtPassword: agtPassword || existing?.agtPassword,
        restAuthMode: restAuthMode || existing?.restAuthMode,
        restUserHeader: restUserHeader || existing?.restUserHeader,
        restPassHeader: restPassHeader || existing?.restPassHeader,
        saftSubmissionUrl: saftSubmissionUrl || existing?.saftSubmissionUrl,
        softwareCertificateNumber: softwareCertificateNumber || existing?.softwareCertificateNumber,
        publicKeyFingerprint: publicKeyFingerprint || existing?.publicKeyFingerprint,
        privateKeyPath: privateKeyPath || existing?.privateKeyPath,
        environment: environment || existing?.environment || 'development',
        timeout: timeout || existing?.timeout || 10000,
        retryAttempts: retryAttempts || existing?.retryAttempts || 3,
        retryDelay: retryDelay || existing?.retryDelay || 1000,
        allowMock: allowMock !== undefined ? allowMock : (existing?.allowMock ?? false),
      };

      writeConfig(config);

      // Return config without secret
      const { clientSecret: _, taxpayerPassword: __, agtPassword: ___, ...safeConfig } = config;
      return res.status(200).json({
        success: true,
        message: 'AGT configuration saved successfully',
        config: safeConfig,
      });
    } catch (error: any) {
      console.error('Error saving AGT config:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ error: 'Method not allowed' });
}
