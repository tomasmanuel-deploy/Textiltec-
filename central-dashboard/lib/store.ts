import fs from 'fs';
import path from 'path';

// Store data in the local 'data' directory of the dashboard app
const DATA_DIR = path.join(process.cwd(), 'data');
const LOGS_FILE = path.join(DATA_DIR, 'central_logs.json');

export interface CentralLogEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  eventType: 'submission' | 'error' | 'status_check';
  documentId?: string;
  status: 'success' | 'failure';
  details?: any;
}

export class CentralStore {
  private static ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (e) {
        console.error('Failed to create data dir', e);
      }
    }
    if (!fs.existsSync(LOGS_FILE)) {
      try {
        fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
      } catch (e) {
        console.error('Failed to create logs file', e);
      }
    }
  }

  static getLogs(): CentralLogEntry[] {
    this.ensureFile();
    try {
      const data = fs.readFileSync(LOGS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading central logs:', error);
      return [];
    }
  }

  static addLog(entry: Omit<CentralLogEntry, 'id' | 'timestamp'>): CentralLogEntry {
    const logs = this.getLogs();
    const newEntry: CentralLogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date().toISOString(),
    };
    
    // Keep only last 1000 logs to prevent file bloat
    const updatedLogs = [newEntry, ...logs].slice(0, 1000);
    
    try {
      this.ensureFile();
      fs.writeFileSync(LOGS_FILE, JSON.stringify(updatedLogs, null, 2));
    } catch (error) {
      console.error('Error writing central log:', error);
    }
    
    return newEntry;
  }

  static getStats() {
    const logs = this.getLogs();
    const totalSubmissions = logs.filter(l => l.eventType === 'submission').length;
    const errors = logs.filter(l => l.status === 'failure').length;
    const activeTenants = new Set(logs.map(l => l.tenantId)).size;
    
    // Group by tenant
    const tenantStats = logs.reduce((acc, log) => {
      if (!acc[log.tenantId]) {
        acc[log.tenantId] = { submissions: 0, errors: 0, lastActive: log.timestamp };
      }
      if (log.eventType === 'submission') acc[log.tenantId].submissions++;
      if (log.status === 'failure') acc[log.tenantId].errors++;
      if (new Date(log.timestamp) > new Date(acc[log.tenantId].lastActive)) {
        acc[log.tenantId].lastActive = log.timestamp;
      }
      return acc;
    }, {} as Record<string, any>);

    return {
      totalSubmissions,
      errors,
      activeTenants,
      tenantStats
    };
  }
}
