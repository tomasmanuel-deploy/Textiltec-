
import fs from 'fs';
import path from 'path';

/**
 * Service to handle email notifications.
 * In a real environment, this would integrate with SendGrid, Twilio, AWS SES, or Nodemailer.
 * For this implementation, it logs emails to the console and/or a log file.
 */
export class EmailService {
  private static logFile = path.join(process.cwd(), 'data', 'email_logs.txt');

  /**
   * Send an email notification.
   * @param to Recipient email address
   * @param subject Email subject
   * @param body Email body content (text/html)
   */
  static async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] TO: ${to} | SUBJECT: ${subject} | BODY: ${body}\n`;

    // 1. Log to console for dev visibility
    console.log('📧 MOCK EMAIL SENT:');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('--- Body ---');
    console.log(body);
    console.log('------------');

    // 2. Append to a log file to simulate persistence
    try {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.logFile, logEntry);
      return true;
    } catch (error) {
      console.error('Failed to log email:', error);
      return false;
    }

    // 3. Integration point for real email service:
    /*
    try {
      // Example with SendGrid
      await sgMail.send({
        to,
        from: 'noreply@prakash-billing.com',
        subject,
        html: body,
      });
      return true;
    } catch (error) {
      console.error('Email provider error:', error);
      return false;
    }
    */
  }

  /**
   * Send an alert about license expiration.
   */
  static async sendLicenseAlert(to: string, companyName: string, daysRemaining: number): Promise<boolean> {
    const subject = `ALERTA: Licença expira em ${daysRemaining} dias - ${companyName}`;
    const body = `
      Olá,
      
      A licença da empresa ${companyName} irá expirar em ${daysRemaining} dias.
      Por favor, providencie a renovação para evitar interrupções no serviço.
      
      Atenciosamente,
      Sistema de Faturação
    `;
    return this.sendEmail(to, subject, body);
  }

  /**
   * Send an alert about AGT submission failures.
   */
  static async sendAgtFailureAlert(to: string, companyName: string, errorCount: number): Promise<boolean> {
    const subject = `CRÍTICO: Falhas de submissão AGT - ${companyName}`;
    const body = `
      Olá,
      
      Detectamos ${errorCount} falhas consecutivas na submissão de documentos para a AGT
      na empresa ${companyName}.
      
      Verifique o estado da conexão e os logs do sistema imediatamente.
      
      Atenciosamente,
      Sistema de Faturação
    `;
    return this.sendEmail(to, subject, body);
  }
}
