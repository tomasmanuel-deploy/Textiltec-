import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Taxpayer information interface according to AGT specifications
 */
export interface TaxpayerInfo {
  nif: string;
  name: string;
  tradeName?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  status: 'active' | 'inactive' | 'suspended' | 'unknown';
  registrationDate?: string;
  lastUpdate?: string;
  isValid: boolean;
  validationErrors?: string[];
}

/**
 * Cache entry with expiration
 */
interface CacheEntry {
  data: TaxpayerInfo;
  expiresAt: number;
}

/**
 * Taxpayer Consultation Service
 * Implements AGT v5_0_1 specifications for taxpayer consultation
 * Includes intelligent caching and error handling
 */
class TaxpayerConsultationService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 10000; // Maximum cache entries
  private axiosInstance: AxiosInstance | null = null;

  /**
   * Get AGT configuration from file system (compatible with existing system)
   */
  private async getAgtConfig(): Promise<any> {
    try {
      // Try to read from file-based config
      const configPath = path.join(process.cwd(), 'data', 'agt_config.json');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
      }
      
      // Fallback to environment variables
      return {
        apiUrl: process.env.AGT_API_URL || 'https://api.agt.gov.ao',
        clientId: process.env.AGT_CLIENT_ID || '',
        clientSecret: process.env.AGT_CLIENT_SECRET || '',
        testMode: process.env.AGT_TEST_MODE === 'true' || true,
        taxpayerConsultationUrl: process.env.AGT_TAXPAYER_URL,
        taxpayerUsername: process.env.AGT_TAXPAYER_USER,
        taxpayerPassword: process.env.AGT_TAXPAYER_PASS,
        taxpayerDocType: process.env.AGT_TAXPAYER_DOC_TYPE || 'NIF',
      };
    } catch (error) {
      console.error('Error reading AGT config:', error);
      return {
        apiUrl: process.env.AGT_API_URL || 'https://api.agt.gov.ao',
        clientId: process.env.AGT_CLIENT_ID || '',
        clientSecret: process.env.AGT_CLIENT_SECRET || '',
        testMode: true,
        taxpayerConsultationUrl: process.env.AGT_TAXPAYER_URL,
        taxpayerUsername: process.env.AGT_TAXPAYER_USER,
        taxpayerPassword: process.env.AGT_TAXPAYER_PASS,
        taxpayerDocType: process.env.AGT_TAXPAYER_DOC_TYPE || 'NIF',
      };
    }
  }

  /**
   * Initialize axios instance with AGT configuration
   */
  private async getAxiosInstance(): Promise<AxiosInstance> {
    if (this.axiosInstance) {
      return this.axiosInstance;
    }

    const config = await this.getAgtConfig();
    if (!config || (!config.apiUrl && !config.taxpayerConsultationUrl)) {
      throw new Error('No active AGT configuration found');
    }

    const https = require('https');
    let baseURL: string | undefined = undefined;
    if (config.taxpayerConsultationUrl) {
      try {
        const u = new URL(config.taxpayerConsultationUrl);
        baseURL = u.origin;
      } catch {
        baseURL = undefined;
      }
    }
    if (!baseURL && config.apiUrl) {
      baseURL = String(config.apiUrl).replace(/\/$/, '');
    }
    this.axiosInstance = axios.create({
      baseURL,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...(config.testMode ? {} : {
        httpsAgent: new https.Agent({
          rejectUnauthorized: !config.testMode,
        }),
      }),
    });

    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async (requestConfig) => {
        const agtConfig = await this.getAgtConfig();
        if (agtConfig && agtConfig.taxpayerUsername && agtConfig.taxpayerPassword) {
          const token = Buffer.from(`${agtConfig.taxpayerUsername}:${agtConfig.taxpayerPassword}`).toString('base64');
          requestConfig.headers.Authorization = `Basic ${token}`;
        } else if (agtConfig && agtConfig.clientId && agtConfig.clientSecret) {
          const token = Buffer.from(`${agtConfig.clientId}:${agtConfig.clientSecret}`).toString('base64');
          requestConfig.headers.Authorization = `Basic ${token}`;
        }
        const fingerprint = agtConfig?.publicKeyFingerprint || process.env.AGT_PUBLIC_KEY_FINGERPRINT;
        if (fingerprint) {
          requestConfig.headers['X-Software-Key-Id'] = fingerprint;
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    return this.axiosInstance;
  }

  /**
   * Normalize NIF (remove spaces, convert to uppercase)
   */
  private normalizeNif(nif: string): string {
    return String(nif || '').replace(/\s+/g, '').toUpperCase().trim();
  }

  /**
   * Validate NIF format (basic validation)
   */
  private validateNifFormat(nif: string): boolean {
    const normalized = this.normalizeNif(nif);
    // Angola NIF: typically 9 digits, sometimes with letters
    return /^[0-9]{9}$/.test(normalized) || /^[A-Z0-9]{6,14}$/.test(normalized);
  }

  /**
   * Get from cache if available and not expired
   */
  private getCached(nif: string): TaxpayerInfo | null {
    const normalized = this.normalizeNif(nif);
    const entry = this.cache.get(normalized);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(normalized);
      return null;
    }

    return entry.data;
  }

  /**
   * Public helper to check cache presence without exposing private getter
   */
  public isCached(nif: string): boolean {
    return this.getCached(nif) !== null;
  }

  /**
   * Store in cache with TTL
   */
  private setCache(nif: string, data: TaxpayerInfo): void {
    const normalized = this.normalizeNif(nif);
    
    // Implement LRU: remove oldest entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(normalized, {
      data,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
  }

  /**
   * Clear expired cache entries (call periodically)
   */
  public clearExpiredCache(): void {
    const now = Date.now();
    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Clear all cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Consult taxpayer by NIF
   * Implements AGT v5_0_1 specification
   */
  async consultTaxpayer(nif: string, forceRefresh: boolean = false): Promise<TaxpayerInfo> {
    const normalized = this.normalizeNif(nif);

    // Validate NIF format
    if (!this.validateNifFormat(normalized)) {
      return {
        nif: normalized,
        name: '',
        status: 'unknown',
        isValid: false,
        validationErrors: ['Formato de NIF inválido'],
      };
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.getCached(normalized);
      if (cached) {
        return cached;
      }
    }

    try {
      const axios = await this.getAxiosInstance();
      const config = await this.getAgtConfig();
      
      if (!config) {
        throw new Error('AGT configuration not found');
      }

      // Test mode: return mock data
      if (config.testMode) {
        const mockData: TaxpayerInfo = {
          nif: normalized,
          name: `Taxpayer ${normalized}`,
          tradeName: `Trade Name ${normalized}`,
          address: 'Luanda, Angola',
          city: 'Luanda',
          status: 'active',
          isValid: true,
        };
        this.setCache(normalized, mockData);
        return mockData;
      }

      let response;
      if (config.taxpayerConsultationUrl) {
        const url = String(config.taxpayerConsultationUrl);
        const docType = config.taxpayerDocType || 'NIF';
        response = await axios.get(url, {
          params: { tipoDocumento: docType, numeroDocumento: normalized },
          timeout: config.timeout || 10000,
        });
      } else {
        response = await axios.get(`/api/v1/taxpayer/consult/${encodeURIComponent(normalized)}`, {
          timeout: config.timeout || 10000,
        });
      }

      // Map AGT response to our interface
      const agtData = response.data?.data || response.data;
      const taxpayerInfo: TaxpayerInfo = {
        nif: normalized,
        name: agtData?.name || agtData?.companyName || agtData?.designacaoSocial || '',
        tradeName: agtData?.tradeName || agtData?.businessName,
        address: agtData?.address || agtData?.addressDetail || agtData?.morada,
        city: agtData?.city || agtData?.municipio,
        province: agtData?.province || agtData?.state || agtData?.provincia,
        postalCode: agtData?.postalCode || agtData?.codigoPostal,
        phone: agtData?.phone || agtData?.telephone || agtData?.telefone,
        email: agtData?.email,
        status: this.mapStatus(agtData?.status),
        registrationDate: agtData?.registrationDate,
        lastUpdate: agtData?.lastUpdate || agtData?.updatedAt,
        isValid: true,
      };

      // Validate required fields
      if (!taxpayerInfo.name) {
        taxpayerInfo.isValid = false;
        taxpayerInfo.validationErrors = ['Nome do contribuinte não encontrado'];
      }

      // Cache successful response
      if (taxpayerInfo.isValid) {
        this.setCache(normalized, taxpayerInfo);
      }

      return taxpayerInfo;
    } catch (error: any) {
      console.error('Error consulting taxpayer:', error);
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        return {
          nif: normalized,
          name: '',
          status: 'unknown',
          isValid: false,
          validationErrors: ['Contribuinte não encontrado na base de dados AGT'],
        };
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        return {
          nif: normalized,
          name: '',
          status: 'unknown',
          isValid: false,
          validationErrors: ['Erro de autenticação com AGT. Verifique as credenciais.'],
        };
      }

      // Network/timeout errors
      return {
        nif: normalized,
        name: '',
        status: 'unknown',
        isValid: false,
        validationErrors: [`Erro na comunicação com AGT: ${error.message || 'Timeout ou erro de rede'}`],
      };
    }
  }

  /**
   * Map AGT status code to our status enum
   */
  private mapStatus(agtStatus: string | number): TaxpayerInfo['status'] {
    const statusStr = String(agtStatus || '').toLowerCase();
    
    if (statusStr.includes('active') || statusStr === '1' || statusStr === 'ativo') {
      return 'active';
    }
    if (statusStr.includes('inactive') || statusStr === '0' || statusStr === 'inativo') {
      return 'inactive';
    }
    if (statusStr.includes('suspend') || statusStr.includes('bloqueado')) {
      return 'suspended';
    }
    
    return 'unknown';
  }

  /**
   * Batch consult multiple taxpayers (with rate limiting)
   */
  async batchConsultTaxpayers(nifs: string[], delayMs: number = 100): Promise<Map<string, TaxpayerInfo>> {
    const results = new Map<string, TaxpayerInfo>();
    
    for (const nif of nifs) {
      try {
        const info = await this.consultTaxpayer(nif);
        results.set(this.normalizeNif(nif), info);
        
        // Rate limiting to avoid overwhelming AGT API
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`Error consulting taxpayer ${nif}:`, error);
        results.set(this.normalizeNif(nif), {
          nif: this.normalizeNif(nif),
          name: '',
          status: 'unknown',
          isValid: false,
          validationErrors: ['Erro ao consultar'],
        });
      }
    }
    
    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttl: this.CACHE_TTL_MS,
    };
  }
}

// Singleton instance
const taxpayerConsultationService = new TaxpayerConsultationService();

// Periodically clear expired cache entries (every hour)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    taxpayerConsultationService.clearExpiredCache();
  }, 60 * 60 * 1000); // 1 hour
}

export default taxpayerConsultationService;
