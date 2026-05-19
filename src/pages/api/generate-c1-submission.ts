import { NextApiRequest, NextApiResponse } from 'next';
import { AgtService } from '../../services/AgtService';
import { DocumentType, DocumentStatus } from '../../models/Document';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const agtService = new AgtService();

    // Mock Company (Issuer - The one issuing the self-bill)
    const company = {
      name: 'Minha Empresa Lda',
      nif: '5417012345',
      address: 'Rua Exemplo, 123',
      city: 'Luanda'
    };

    // Mock Supplier (Seller - The one providing the service)
    const supplier = {
      name: 'Fornecedor Exemplo S.A.',
      nif: '5417098765',
      address: 'Avenida dos Fornecedores, 456',
      city: 'Luanda'
    };

    // Mock Document (Self-Billing Invoice/Receipt)
    const doc: any = {
      uuid: crypto.randomUUID(),
      documentType: DocumentType.INVOICE_RECEIPT, // FR
      series: 'AGTC1',
      sequentialNumber: 1,
      issueDate: new Date(),
      createdAt: new Date(),
      taxableDate: new Date(),
      status: DocumentStatus.DRAFT,
      payment: {
        method: 'NU', // Numerário
        amount: 1140.00
      },
      buyer: company, // The entity issuing the self-bill (Me)
      seller: supplier, // The entity providing the service (Them)
      selfBillingIndicator: 1,
      cashVATSchemeIndicator: 0,
      thirdPartiesBillingIndicator: 0,
      totals: {
        total: 1140.00,
        subtotal: 1000.00,
        vatTotal: 140.00,
        vatBreakdown: [
          {
            rate: 14,
            amount: 140.00,
            base: 1000.00
          }
        ]
      },
      lines: [
        {
          sku: 'SERV001',
          description: 'Serviço de Exemplo - Auto Factura',
          quantity: 1,
          unit: 'UN',
          unitPrice: 1000.00,
          vatRate: 14,
          lineTotal: 1000.00,
          type: 'S', // Service
          tax: {
            amount: 140.00
          }
        }
      ],
      notes: 'Auto-Facturacao'
    };

    // Generate SAF-T Content using the Service
    const saftContent = await agtService.generateSaftJson(doc);

    // Manually construct the final submission wrapper if needed, 
    // or return the structure exactly as AgtService produces it.
    // AgtService.generateSaftJson already produces the structure:
    // { generalInfo: ..., softwareInfo: ..., documents: [...] }
    
    // However, ensure we are not wrapping it again if the service does it.
    // Looking at AgtService.ts, generateSaftJson returns the full object.
    
    res.status(200).json(saftContent);

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}
