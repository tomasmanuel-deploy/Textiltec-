import fs from 'fs';
import { resolveDataPath } from '@/lib/dataPaths';
import crypto from 'crypto';

import { EmailService } from '@/services/EmailService';

interface Alert {
  id: string;
  type: 'LICENSE_EXPIRING' | 'AGT_ERROR' | 'SYSTEM_ERROR';
  severity: 'high' | 'medium' | 'low';
  message: string;
  recipient: string; // email or phone
  createdAt: string;
  status: 'sent' | 'failed' | 'pending';
}

// Mock notification service
export class AlertService {
  private static alertsPath = resolveDataPath('alerts.json');

  static async sendAlert(type: Alert['type'], message: string, recipient: string, severity: Alert['severity'] = 'medium', phone?: string) {
    // Basic debounce check: don't spam the same message to the same recipient within 24h
    if (this.hasRecentAlert(type, message, recipient)) return;

    const alert: Alert = {
      id: crypto.randomUUID(),
      type,
      message,
      recipient,
      severity,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    console.log(`[ALERT SERVICE] Sending ${severity} alert to ${recipient} (Phone: ${phone || 'N/A'}): ${message}`);
    
    // Send email via EmailService
    try {
      const emailSent = await EmailService.sendEmail(recipient, `[${type}] Alert: ${message}`, message);
      alert.status = emailSent ? 'sent' : 'failed';

      // Send SMS if severity is HIGH and phone is available
      if (severity === 'high' && phone) {
        await this.sendSMS(phone, `[${type}] ${message}`);
      }
    } catch (error) {
      console.error('[ALERT SERVICE] Failed to send alert:', error);
      alert.status = 'failed';
    }

    this.logAlert(alert);
  }

  // Mock SMS Service (e.g. Twilio)
  private static async sendSMS(phone: string, message: string): Promise<boolean> {
    console.log(`📱 MOCK SMS SENT to ${phone}: ${message}`);
    // Here you would integrate Twilio or other SMS provider
    // await twilioClient.messages.create({ body: message, to: phone, from: '...' });
    return true;
  }

  static hasRecentAlert(type: Alert['type'], message: string, recipient: string): boolean {
    const alerts = this.getRecentAlerts(500);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return alerts.some(a => 
      a.type === type && 
      a.message === message && 
      a.recipient === recipient && 
      new Date(a.createdAt).getTime() > oneDayAgo
    );
  }

  private static mockSend(alert: Alert): Promise<void> {
    // Deprecated in favor of EmailService
    return Promise.resolve();
  }

  private static logAlert(alert: Alert) {
    try {
      let alerts: Alert[] = [];
      if (fs.existsSync(this.alertsPath)) {
        alerts = JSON.parse(fs.readFileSync(this.alertsPath, 'utf-8'));
      }
      alerts.push(alert);
      // Keep only last 1000 alerts
      if (alerts.length > 1000) alerts = alerts.slice(-1000);
      fs.writeFileSync(this.alertsPath, JSON.stringify(alerts, null, 2));
    } catch (e) {
      console.error('[ALERT SERVICE] Error logging alert:', e);
    }
  }

  static getRecentAlerts(limit: number = 50): Alert[] {
    try {
      if (fs.existsSync(this.alertsPath)) {
        const alerts = JSON.parse(fs.readFileSync(this.alertsPath, 'utf-8'));
        return alerts.sort((a: Alert, b: Alert) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
      }
    } catch {}
    return [];
  }
}
