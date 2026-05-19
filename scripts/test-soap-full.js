const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ignore self-signed certificate errors for HML environment
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Endpoint
const URL = 'https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura';

// Load Private Key
const privateKeyPath = path.join(process.cwd(), 'data', 'agt_keys', 'private.pem');
let privateKey = '';
try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
} catch (e) {
  console.error('Failed to load private key:', e.message);
  process.exit(1);
}

// Company Info
const company = {
  nif: '5002821079',
  name: 'Textiltec Soluções',
  address: 'LUANDA',
  city: 'LUANDA',
  postalCode: '34242',
  productId: 'Prakash/Textiltec Soluções',
  productVersion: '1.0.6',
  regime: 'General'
};

// Generate Hash (RSA-SHA1)
function generateHash(invoiceDate, systemEntryDate, invoiceNo, grossTotal, prevHash) {
  // Payload: Date;SystemEntryDate;DocNo;GrossTotal;PreviousHash
  // Date format: YYYY-MM-DD
  // SystemEntryDate format: YYYY-MM-DDThh:mm:ss
  
  const formattedDate = invoiceDate;
  const formattedSED = systemEntryDate;
  const formattedTotal = Number(grossTotal).toFixed(2);
  
  const payload = `${formattedDate};${formattedSED};${invoiceNo};${formattedTotal};${prevHash}`;
  console.log('Hash Payload:', payload);
  
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(payload);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

// Data
const invoiceDate = new Date().toISOString().split('T')[0];
const systemEntryDate = new Date().toISOString().split('.')[0]; // YYYY-MM-DDThh:mm:ss
const invoiceNo = `FT XVE${new Date().getFullYear()}/1`;
const grossTotal = 1140.00;
const prevHash = ''; // First document of series

const hash = generateHash(invoiceDate, systemEntryDate, invoiceNo, grossTotal, prevHash);

// Construct XML Content
// Using a minimal but valid structure based on SAF-T AO 1.01_01
const xmlContent = `
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${company.nif}</CompanyID>
    <TaxRegistrationNumber>${company.nif}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${company.name}</CompanyName>
    <BusinessName>${company.name}</BusinessName>
    <CompanyAddress>
      <AddressDetail>${company.address}</AddressDetail>
      <City>${company.city}</City>
      <PostalCode>${company.postalCode}</PostalCode>
      <Country>AO</Country>
    </CompanyAddress>
    <FiscalYear>${new Date().getFullYear()}</FiscalYear>
    <StartDate>${invoiceDate}</StartDate>
    <EndDate>${invoiceDate}</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${invoiceDate}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${company.nif}</ProductCompanyTaxID>
    <SoftwareValidationNumber>0</SoftwareValidationNumber>
    <ProductID>${company.productId}</ProductID>
    <ProductVersion>${company.productVersion}</ProductVersion>
    <Telephone>222000000</Telephone>
    <Email>teste@example.com</Email>
    <Website>www.example.com</Website>
  </Header>
  <MasterFiles>
    <Customer>
      <CustomerID>999999999</CustomerID>
      <AccountID>999999999</AccountID>
      <CustomerTaxID>999999999</CustomerTaxID>
      <CompanyName>Consumidor Final</CompanyName>
      <BillingAddress>
        <AddressDetail>Desconhecido</AddressDetail>
        <City>Luanda</City>
        <PostalCode>0000</PostalCode>
        <Country>AO</Country>
      </BillingAddress>
      <SelfBillingIndicator>0</SelfBillingIndicator>
    </Customer>
    <Product>
      <ProductType>P</ProductType>
      <ProductCode>SERV001</ProductCode>
      <ProductGroup>GERAL</ProductGroup>
      <ProductDescription>Servico Teste</ProductDescription>
      <ProductNumberCode>SERV001</ProductNumberCode>
    </Product>
    <TaxTable>
      <TaxTableEntry>
        <TaxType>IVA</TaxType>
        <TaxCode>NOR</TaxCode>
        <Description>Normal</Description>
        <TaxAmount>14.0000</TaxAmount>
      </TaxTableEntry>
    </TaxTable>
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>1</NumberOfEntries>
      <TotalDebit>0.00</TotalDebit>
      <TotalCredit>${grossTotal.toFixed(2)}</TotalCredit>
      <Invoice>
        <InvoiceNo>${invoiceNo}</InvoiceNo>
        <DocumentStatus>
          <InvoiceStatus>N</InvoiceStatus>
          <InvoiceStatusDate>${systemEntryDate}</InvoiceStatusDate>
          <SourceID>Admin</SourceID>
          <SourceBilling>P</SourceBilling>
        </DocumentStatus>
        <Hash>${hash}</Hash>
        <HashControl>1</HashControl>
        <Period>${new Date().getMonth() + 1}</Period>
        <InvoiceDate>${invoiceDate}</InvoiceDate>
        <InvoiceType>FT</InvoiceType>
        <SpecialRegimes>
          <SelfBillingIndicator>0</SelfBillingIndicator>
          <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
          <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
        </SpecialRegimes>
        <SourceID>Admin</SourceID>
        <SystemEntryDate>${systemEntryDate}</SystemEntryDate>
        <CustomerID>999999999</CustomerID>
        <Line>
          <LineNumber>1</LineNumber>
          <ProductCode>SERV001</ProductCode>
          <ProductDescription>Servico Teste</ProductDescription>
          <Quantity>1</Quantity>
          <UnitOfMeasure>UN</UnitOfMeasure>
          <UnitPrice>1000</UnitPrice>
          <TaxPointDate>${invoiceDate}</TaxPointDate>
          <Description>Servico Teste</Description>
          <CreditAmount>1000.00</CreditAmount>
          <Tax>
            <TaxType>IVA</TaxType>
            <TaxCountryRegion>AO</TaxCountryRegion>
            <TaxCode>NOR</TaxCode>
            <TaxPercentage>14</TaxPercentage>
          </Tax>
          <SettlementAmount>0.00</SettlementAmount>
        </Line>
        <DocumentTotals>
          <TaxPayable>140.00</TaxPayable>
          <NetTotal>1000.00</NetTotal>
          <GrossTotal>${grossTotal.toFixed(2)}</GrossTotal>
        </DocumentTotals>
      </Invoice>
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>
`;

// Construct SOAP Envelope
const soapEnvelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1">
   <soapenv:Header/>
   <soapenv:Body>
      <v1:RegistarFacturaRequest>
         ${xmlContent}
      </v1:RegistarFacturaRequest>
   </soapenv:Body>
</soapenv:Envelope>
`;

// Send Request
async function sendRequest() {
  console.log('Sending request to:', URL);
  // console.log('Payload:', soapEnvelope);
  
  try {
    const response = await axios.post(URL, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://sifp.minfin.gov.ao/sigt/fe/ws/v1/registarFactura'
      },
      httpsAgent: httpsAgent
    });

    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error Status:', error.response.status);
      console.error('Error Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
      if (error.code) console.error('Error Code:', error.code);
    }
  }
}

sendRequest();
