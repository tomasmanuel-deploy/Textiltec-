const axios = require('axios');
const https = require('https');

// Ignore self-signed certificate errors for HML environment
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Endpoint
const URL = 'https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura';

// Sample Invoice Data (Simplified for testing)
const invoiceData = {
  InvoiceNo: 'FT S001/1',
  InvoiceStatus: 'N',
  Hash: '0', // Should be valid hash
  HashControl: '1',
  Period: '2',
  InvoiceDate: '2025-02-05',
  InvoiceType: 'FT',
  SpecialRegimes: {
    SelfBillingIndicator: '0',
    CashVATSchemeIndicator: '0',
    ThirdPartiesBillingIndicator: '0'
  },
  SourceID: 'Admin',
  SystemEntryDate: '2025-02-05T10:00:00',
  CustomerID: 'Consumidor Final',
  Line: [
    {
      LineNumber: '1',
      ProductCode: 'SERV001',
      ProductDescription: 'Servico Teste',
      Quantity: '1',
      UnitOfMeasure: 'UN',
      UnitPrice: '1000',
      TaxPointDate: '2025-02-05',
      Description: 'Servico Teste',
      CreditAmount: '1000',
      Tax: {
        TaxType: 'IVA',
        TaxCountryRegion: 'AO',
        TaxCode: 'NOR',
        TaxPercentage: '14'
      },
      SettlementAmount: '0'
    }
  ],
  DocumentTotals: {
    TaxPayable: '140',
    NetTotal: '1000',
    GrossTotal: '1140'
  }
};

// Construct SOAP Envelope
// Note: The structure inside RegistarFacturaRequest usually mimics the SAF-T SourceDocuments/SalesInvoices/Invoice structure
// But typically it expects the <AuditFile> or <SalesInvoices> root or just <Invoice>.
// Based on typical AGT patterns, it might be <RegistarFacturaRequest><Factura>...XML...</Factura></RegistarFacturaRequest>
// or wrapping the SAF-T structure.
// Let's try sending the Invoice structure directly inside the request first.

const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1">
   <soapenv:Header/>
   <soapenv:Body>
      <v1:RegistarFacturaRequest>
         <AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
            <SourceDocuments>
               <SalesInvoices>
                  <Invoice>
                     <InvoiceNo>${invoiceData.InvoiceNo}</InvoiceNo>
                     <DocumentStatus>
                        <InvoiceStatus>${invoiceData.InvoiceStatus}</InvoiceStatus>
                        <InvoiceStatusDate>${invoiceData.SystemEntryDate}</InvoiceStatusDate>
                        <SourceID>${invoiceData.SourceID}</SourceID>
                        <SourceBilling>${invoiceData.SpecialRegimes.SelfBillingIndicator === '1' ? 'P' : 'I'}</SourceBilling>
                     </DocumentStatus>
                     <Hash>${invoiceData.Hash}</Hash>
                     <HashControl>${invoiceData.HashControl}</HashControl>
                     <Period>${invoiceData.Period}</Period>
                     <InvoiceDate>${invoiceData.InvoiceDate}</InvoiceDate>
                     <InvoiceType>${invoiceData.InvoiceType}</InvoiceType>
                     <SpecialRegimes>
                        <SelfBillingIndicator>${invoiceData.SpecialRegimes.SelfBillingIndicator}</SelfBillingIndicator>
                        <CashVATSchemeIndicator>${invoiceData.SpecialRegimes.CashVATSchemeIndicator}</CashVATSchemeIndicator>
                        <ThirdPartiesBillingIndicator>${invoiceData.SpecialRegimes.ThirdPartiesBillingIndicator}</ThirdPartiesBillingIndicator>
                     </SpecialRegimes>
                     <SourceID>${invoiceData.SourceID}</SourceID>
                     <SystemEntryDate>${invoiceData.SystemEntryDate}</SystemEntryDate>
                     <CustomerID>${invoiceData.CustomerID}</CustomerID>
                     <Line>
                        <LineNumber>${invoiceData.Line[0].LineNumber}</LineNumber>
                        <ProductCode>${invoiceData.Line[0].ProductCode}</ProductCode>
                        <ProductDescription>${invoiceData.Line[0].ProductDescription}</ProductDescription>
                        <Quantity>${invoiceData.Line[0].Quantity}</Quantity>
                        <UnitOfMeasure>${invoiceData.Line[0].UnitOfMeasure}</UnitOfMeasure>
                        <UnitPrice>${invoiceData.Line[0].UnitPrice}</UnitPrice>
                        <TaxPointDate>${invoiceData.Line[0].TaxPointDate}</TaxPointDate>
                        <Description>${invoiceData.Line[0].Description}</Description>
                        <CreditAmount>${invoiceData.Line[0].CreditAmount}</CreditAmount>
                        <Tax>
                           <TaxType>${invoiceData.Line[0].Tax.TaxType}</TaxType>
                           <TaxCountryRegion>${invoiceData.Line[0].Tax.TaxCountryRegion}</TaxCountryRegion>
                           <TaxCode>${invoiceData.Line[0].Tax.TaxCode}</TaxCode>
                           <TaxPercentage>${invoiceData.Line[0].Tax.TaxPercentage}</TaxPercentage>
                        </Tax>
                        <SettlementAmount>${invoiceData.Line[0].SettlementAmount}</SettlementAmount>
                     </Line>
                     <DocumentTotals>
                        <TaxPayable>${invoiceData.DocumentTotals.TaxPayable}</TaxPayable>
                        <NetTotal>${invoiceData.DocumentTotals.NetTotal}</NetTotal>
                        <GrossTotal>${invoiceData.DocumentTotals.GrossTotal}</GrossTotal>
                     </DocumentTotals>
                  </Invoice>
               </SalesInvoices>
            </SourceDocuments>
         </AuditFile>
      </v1:RegistarFacturaRequest>
   </soapenv:Body>
</soapenv:Envelope>
`;

console.log('--- Sending SOAP Request ---');
// console.log(soapEnvelope);

async function sendRequest() {
  try {
    const response = await axios.post(URL, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '' // Sometimes required
      },
      httpsAgent: httpsAgent
    });

    console.log('Status:', response.status);
    console.log('Data:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

sendRequest();
