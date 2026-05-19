import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface PdfData {
  document_number?: string;
  client_name?: string;
  client_address?: string;
  watermark_text?: string;
  company_name?: string;
  company_details?: string;
  products?: Array<{
    code: string;
    description: string;
    price: number;
    unit: string;
    quantity: number;
    discount: number;
    iec: number;
    tax: number;
    total: number;
  }>;
  totals?: {
    liquid: number;
    discount: number;
    tax: number;
    iec: number;
    stamp_tax: number;
    retention: number;
    final_total: number;
  };
}

export class PythonPdfService {
  private scriptPath: string;

  constructor() {
    this.scriptPath = path.join(process.cwd(), 'scripts', 'reportlab_replicate.py');
  }

  async generatePdf(outputPath: string, data?: PdfData): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [this.scriptPath, outputPath];
      
      if (data) {
        args.push(JSON.stringify(data));
      }

      const pythonProcess = spawn('python3', args, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Python PDF generation completed:', stdout);
          resolve(outputPath);
        } else {
          console.error('Python PDF generation failed:', stderr);
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        reject(error);
      });
    });
  }

  async generateDocumentPdf(documentId: number, document: any, outputPath?: string): Promise<string> {
    const finalOutputPath = outputPath || path.join(process.cwd(), 'public', 'pdfs', `document-${documentId}.pdf`);
    
    // Transform document data to match Python script format
    const pdfData: PdfData = {
      document_number: document.number || `PP XVE${new Date().getFullYear()}/${documentId}`,
      client_name: document.buyer?.name || 'Cliente',
      client_address: this.formatClientAddress(document.buyer),
      watermark_text: document.status === 'draft' ? 'DOCUMENTO EMITIDO PARA FINS DE PROFORMA' : undefined,
      company_name: document.seller?.name || 'NEGOMIL',
      company_details: this.formatCompanyDetails(document.seller),
      products: document.items?.map((item: any) => ({
        code: item.product?.code || 'Service',
        description: item.product?.name || item.description || 'Serviço',
        price: item.unitPrice || 0,
        unit: item.unit || 'UNI',
        quantity: item.quantity || 1,
        discount: item.discount || 0,
        iec: item.iec || 0,
        tax: item.tax || 14,
        total: item.total || (item.unitPrice * item.quantity)
      })),
      totals: {
        liquid: document.subtotal || 0,
        discount: document.totalDiscount || 0,
        tax: document.totalTax || 0,
        iec: document.totalIec || 0,
        stamp_tax: document.stampTax || 0,
        retention: document.retention || 0,
        final_total: document.total || 0
      }
    };

    return this.generatePdf(finalOutputPath, pdfData);
  }

  private formatClientAddress(buyer: any): string {
    if (!buyer) return 'ANGOLA - Luanda, Luanda, Luanda';
    
    const parts = [];
    if (buyer.address) parts.push(buyer.address);
    if (buyer.city) parts.push(buyer.city);
    if (buyer.province) parts.push(buyer.province);
    if (buyer.country) parts.push(buyer.country);
    
    return parts.length > 0 ? parts.join(', ') : 'ANGOLA - Luanda, Luanda, Luanda';
  }

  private formatCompanyDetails(seller: any): string {
    if (!seller) {
      return `Textilec Soluções
Contribuinte Nº: 5401453696
Telefone: 921261422
Site:
Email:
Luanda - Angola    Luanda,Luanda, Luanda`;
    }

    const lines = [];
    if (seller.name) lines.push(seller.name);
    if (seller.taxId) lines.push(`Contribuinte Nº: ${seller.taxId}`);
    if (seller.phone) lines.push(`Telefone: ${seller.phone}`);
    if (seller.website) lines.push(`Site: ${seller.website}`);
    if (seller.email) lines.push(`Email: ${seller.email}`);
    
    const address = this.formatClientAddress(seller);
    if (address) lines.push(address);
    
    return lines.join('\n');
  }

  async checkPythonAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', ['--version'], { stdio: 'pipe' });
      
      pythonProcess.on('close', (code) => {
        resolve(code === 0);
      });
      
      pythonProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  async checkReportLabAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', ['-c', 'import reportlab; print("OK")'], { stdio: 'pipe' });
      
      pythonProcess.on('close', (code) => {
        resolve(code === 0);
      });
      
      pythonProcess.on('error', () => {
        resolve(false);
      });
    });
  }
}

export default PythonPdfService;