import { getDataDir } from '../lib/dataPaths';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class CentralLogService {
  private static endpoint = '/api/ingest';

  // In a real multi-tenant setup, this would be a unique ID per installation
  // For now, we'll use a mock ID or fetch from config
  private static getTenantId(): string {
    // 1. Check ENV override (for dev/testing)
    if (process.env.NEXT_PUBLIC_TENANT_ID) {
      return process.env.NEXT_PUBLIC_TENANT_ID;
    }

    // 2. Browser: LocalStorage
    if (typeof window !== 'undefined') {
       let id = localStorage.getItem('tenantId');
       if (!id) {
         id = crypto.randomUUID();
         localStorage.setItem('tenantId', id);
       }
       return id;
    }

    // 3. Server: File System
    try {
      const tenantFile = path.join(getDataDir(), 'tenant.json');
      if (fs.existsSync(tenantFile)) {
        const data = JSON.parse(fs.readFileSync(tenantFile, 'utf-8'));
        if (data.id) return data.id;
      }
      
      // Generate new ID if missing
      const newId = crypto.randomUUID();
      fs.writeFileSync(tenantFile, JSON.stringify({ id: newId, createdAt: new Date().toISOString() }, null, 2));
      return newId;
    } catch (e) {
      console.error('Failed to read/write tenant ID:', e);
      return 'fallback-tenant-id'; 
    }
  }

  private static getEndpoint(): string {
    // If running in browser or server, point to the external dashboard URL
    const dashboardUrl = process.env.NEXT_PUBLIC_CENTRAL_DASHBOARD_URL || 'http://localhost:3005';
    return `${dashboardUrl}${this.endpoint}`;
  }

  static async logSubmission(documentId: string, status: 'success' | 'failure', details?: any) {
    try {
      const url = this.getEndpoint();
      const payload = {
        tenantId: this.getTenantId(),
        eventType: 'submission',
        documentId,
        status,
        details: {
          ...details,
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
        }
      };

      // Use fire-and-forget pattern or await depending on criticality
      // Here we use fire-and-forget to not block the main flow
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CENTRAL_API_KEY || 'default-secure-key-change-me'}`
        },
        body: JSON.stringify(payload),
        mode: 'cors'
      }).catch(err => console.error('Failed to send log to central dashboard:', err));

    } catch (error) {
      console.error('Error in CentralLogService:', error);
    }
  }

  static async logError(context: string, error: any) {
    try {
      const url = this.getEndpoint();
      const payload = {
        tenantId: this.getTenantId(),
        eventType: 'error',
        status: 'failure',
        details: {
          context,
          errorMessage: error.message || String(error),
          stack: error.stack,
        }
      };

      fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CENTRAL_API_KEY || 'default-secure-key-change-me'}`
        },
        body: JSON.stringify(payload),
        mode: 'cors'
      }).catch(console.error);
    } catch {}
  }
}
