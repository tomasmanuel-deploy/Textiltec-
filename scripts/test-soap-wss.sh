#!/bin/bash

# Configuration
URL="https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura"
NIF="5002821079"
# REPLACE THIS WITH THE ACTUAL PASSWORD
PASSWORD="YOUR_PASSWORD_HERE"

# Generate Timestamp (MacOS)
CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPIRES=$(date -u -v+5M +"%Y-%m-%dT%H:%M:%SZ")

# Define XML Content with WS-Security and Timestamp
XML_CONTENT='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
   <soapenv:Header>
      <wsse:Security soapenv:mustUnderstand="1">
         <wsu:Timestamp wsu:Id="Timestamp-1">
            <wsu:Created>'$CREATED'</wsu:Created>
            <wsu:Expires>'$EXPIRES'</wsu:Expires>
         </wsu:Timestamp>
         <wsse:UsernameToken wsu:Id="UsernameToken-1">
            <wsse:Username>'$NIF'</wsse:Username>
            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">'$PASSWORD'</wsse:Password>
         </wsse:UsernameToken>
      </wsse:Security>
   </soapenv:Header>
   <soapenv:Body>
      <v1:RegistarFacturaRequest>
         <AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
            <Header>
               <AuditFileVersion>1.01_01</AuditFileVersion>
               <CompanyID>'$NIF'</CompanyID>
               <TaxRegistrationNumber>'$NIF'</TaxRegistrationNumber>
               <TaxAccountingBasis>F</TaxAccountingBasis>
               <CompanyName>Textiltec Soluções</CompanyName>
               <BusinessName>Textiltec Soluções</BusinessName>
               <CompanyAddress>
                  <AddressDetail>LUANDA</AddressDetail>
                  <City>LUANDA</City>
                  <PostalCode>34242</PostalCode>
                  <Country>AO</Country>
               </CompanyAddress>
               <FiscalYear>2025</FiscalYear>
               <StartDate>2025-02-05</StartDate>
               <EndDate>2025-02-05</EndDate>
               <CurrencyCode>AOA</CurrencyCode>
               <DateCreated>2025-02-05</DateCreated>
               <TaxEntity>Global</TaxEntity>
               <ProductCompanyTaxID>'$NIF'</ProductCompanyTaxID>
               <SoftwareValidationNumber>0</SoftwareValidationNumber>
               <ProductID>Prakash/Textiltec Soluções</ProductID>
               <ProductVersion>1.0.6</ProductVersion>
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
                  <TotalCredit>1140.00</TotalCredit>
                  <Invoice>
                     <InvoiceNo>FT XVE2025/1</InvoiceNo>
                     <DocumentStatus>
                        <InvoiceStatus>N</InvoiceStatus>
                        <InvoiceStatusDate>2025-02-05T10:00:00</InvoiceStatusDate>
                        <SourceID>Admin</SourceID>
                        <SourceBilling>P</SourceBilling>
                     </DocumentStatus>
                     <Hash>0</Hash>
                     <HashControl>1</HashControl>
                     <Period>2</Period>
                     <InvoiceDate>2025-02-05</InvoiceDate>
                     <InvoiceType>FT</InvoiceType>
                     <SpecialRegimes>
                        <SelfBillingIndicator>0</SelfBillingIndicator>
                        <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
                        <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
                     </SpecialRegimes>
                     <SourceID>Admin</SourceID>
                     <SystemEntryDate>2025-02-05T10:00:00</SystemEntryDate>
                     <CustomerID>999999999</CustomerID>
                     <Line>
                        <LineNumber>1</LineNumber>
                        <ProductCode>SERV001</ProductCode>
                        <ProductDescription>Servico Teste</ProductDescription>
                        <Quantity>1</Quantity>
                        <UnitOfMeasure>UN</UnitOfMeasure>
                        <UnitPrice>1000</UnitPrice>
                        <TaxPointDate>2025-02-05</TaxPointDate>
                        <Description>Servico Teste</Description>
                        <CreditAmount>1000.00</CreditAmount>
                        <Tax>
                           <TaxType>IVA</TaxType>
                           <TaxCode>NOR</TaxCode>
                           <TaxPercentage>14.00</TaxPercentage>
                        </Tax>
                        <SettlementAmount>0.00</SettlementAmount>
                     </Line>
                     <DocumentTotals>
                        <TaxPayable>140.00</TaxPayable>
                        <NetTotal>1000.00</NetTotal>
                        <GrossTotal>1140.00</GrossTotal>
                     </DocumentTotals>
                  </Invoice>
               </SalesInvoices>
            </SourceDocuments>
         </AuditFile>
      </v1:RegistarFacturaRequest>
   </soapenv:Body>
</soapenv:Envelope>'

# Send Request
echo "Sending SOAP Request with WS-Security..."
curl -v -k -X POST "$URL" \
     -H "Content-Type: text/xml; charset=utf-8" \
     -H "SOAPAction: http://sifp.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -d "$XML_CONTENT"
