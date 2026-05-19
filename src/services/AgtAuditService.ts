import fs from 'fs';
import path from 'path';

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  timestamp: Date;
  action: string;
  documentId?: string;
  documentType?: string;
  userId?: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AGT Audit Service
 * Provides comprehensive audit logging for AGT compliance
 * Logs all operations related to document submission, taxpayer consultation, and SAFT generation
 */
class AgtAuditService {
  private logDir: string;
  private maxLogFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 100;

  constructor() {
    // Determine log directory
    const dataDir = process.env.AGT_AUDIT_LOG_DIR || path.join(process.cwd(), 'data', 'audit_logs');
    this.logDir = dataDir;

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get current log file path (one file per day)
   */
  private getLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `audit_${today}.jsonl`);
  }

  /**
   * Write log entry to file
   */
  private writeLogEntry(entry: AuditLogEntry): void {
    try {
      const logFilePath = this.getLogFilePath();
      const logLine = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      }) + '\n';

      // Append to log file
      fs.appendFileSync(logFilePath, logLine, 'utf8');

      // Rotate log if too large
      this.rotateLogIfNeeded(logFilePath);
    } catch (error) {
      console.error('Error writing audit log:', error);
      // Don't throw - audit logging failure shouldn't break the application
    }
  }

  /**
   * Rotate log file if it exceeds size limit
   */
  private rotateLogIfNeeded(logFilePath: string): void {
    try {
      if (!fs.existsSync(logFilePath)) return;

      const stats = fs.statSync(logFilePath);
      if (stats.size < this.maxLogFileSize) return;

      // Rename current file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const rotatedPath = logFilePath.replace('.jsonl', `_${timestamp}.jsonl`);
      fs.renameSync(logFilePath, rotatedPath);

      // Clean old log files
      this.cleanOldLogs();
    } catch (error) {
      console.error('Error rotating audit log:', error);
    }
  }

  /**
   * Clean old log files, keeping only the most recent ones
   */
  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('audit_') && f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          mtime: fs.statSync(path.join(this.logDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the most recent files
      if (files.length > this.maxLogFiles) {
        const toDelete = files.slice(this.maxLogFiles);
        toDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            console.error(`Error deleting old log file ${file.name}:`, err);
          }
        });
      }
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }

  /**
   * Log document submission to AGT
   */
  logDocumentSubmission(
    documentId: string,
    documentType: string,
    status: 'success' | 'error',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_document_submission',
      documentId,
      documentType,
      userId,
      status,
      message,
      details,
    });
  }

  /**
   * Log taxpayer consultation
   */
  logTaxpayerConsultation(
    nif: string,
    status: 'success' | 'error',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_taxpayer_consultation',
      userId,
      status,
      message: `Taxpayer consultation for NIF ${nif}: ${message}`,
      details: { nif, ...details },
    });
  }

  /**
   * Log SAFT generation
   */
  logSaftGeneration(
    status: 'success' | 'error',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_saft_generation',
      userId,
      status,
      message,
      details,
    });
  }

  /**
   * Log SAFT export
   */
  logSaftExport(
    startDate: string,
    endDate: string,
    documentCount: number,
    status: 'success' | 'error',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_saft_export',
      userId,
      status,
      message,
      details: {
        startDate,
        endDate,
        documentCount,
        ...details,
      },
    });
  }

  /**
   * Log document validation
   */
  logDocumentValidation(
    documentId: string,
    isValid: boolean,
    errors: string[],
    warnings: string[],
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_document_validation',
      documentId,
      userId,
      status: isValid ? 'success' : 'error',
      message: `Document validation: ${isValid ? 'Valid' : 'Invalid'} - ${errors.length} errors, ${warnings.length} warnings`,
      details: {
        isValid,
        errors,
        warnings,
      },
    });
  }

  /**
   * Log configuration change
   */
  logConfigurationChange(
    action: 'create' | 'update' | 'delete',
    configType: string,
    status: 'success' | 'error',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action: 'agt_configuration_change',
      userId,
      status,
      message: `${action} ${configType}: ${message}`,
      details: {
        action,
        configType,
        ...details,
      },
    });
  }

  /**
   * Generic log entry
   */
  log(
    action: string,
    status: 'success' | 'error' | 'warning',
    message: string,
    details?: any,
    userId?: string
  ): void {
    this.writeLogEntry({
      timestamp: new Date(),
      action,
      userId,
      status,
      message,
      details,
    });
  }

  /**
   * Query audit logs (simple implementation - can be enhanced with proper database)
   */
  queryLogs(filters: {
    action?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    documentId?: string;
    limit?: number;
  }): AuditLogEntry[] {
    const results: AuditLogEntry[] = [];
    const limit = filters.limit || 1000;

    try {
      // Read all log files in date range
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('audit_') && f.endsWith('.jsonl'))
        .map(f => path.join(this.logDir, f));

      for (const filePath of files) {
        if (results.length >= limit) break;

        // Check if file is in date range
        if (filters.startDate || filters.endDate) {
          const fileDate = new Date(path.basename(filePath, '.jsonl').replace('audit_', ''));
          if (filters.startDate && fileDate < filters.startDate) continue;
          if (filters.endDate && fileDate > filters.endDate) continue;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(l => l.trim());

          for (const line of lines) {
            if (results.length >= limit) break;

            try {
              const entry: AuditLogEntry = JSON.parse(line);
              entry.timestamp = new Date(entry.timestamp);

              // Apply filters
              if (filters.action && entry.action !== filters.action) continue;
              if (filters.status && entry.status !== filters.status) continue;
              if (filters.documentId && entry.documentId !== filters.documentId) continue;
              if (filters.startDate && entry.timestamp < filters.startDate) continue;
              if (filters.endDate && entry.timestamp > filters.endDate) continue;

              results.push(entry);
            } catch (parseError) {
              // Skip invalid JSON lines
              continue;
            }
          }
        } catch (readError) {
          console.error(`Error reading log file ${filePath}:`, readError);
          continue;
        }
      }

      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return results.slice(0, limit);
    } catch (error) {
      console.error('Error querying audit logs:', error);
      return [];
    }
  }
}

export default new AgtAuditService();

