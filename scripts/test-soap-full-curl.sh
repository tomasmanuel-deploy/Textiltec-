#!/bin/bash

# Define XML Content
XML_CONTENT='<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1">
   <soapenv:Header/>
   <soapenv:Body>
      <v1:RegistarFacturaRequest>
         <AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
            <Header>
               <AuditFileVersion>1.01_01</AuditFileVersion>
               <CompanyID>5002821079</CompanyID>
               <TaxRegistrationNumber>5002821079</TaxRegistrationNumber>
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
               <ProductCompanyTaxID>5002821079</ProductCompanyTaxID>
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
                           <TaxCountryRegion>AO</TaxCountryRegion>
                           <TaxCode>NOR</TaxCode>
                           <TaxPercentage>14</TaxPercentage>
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

# Execute curl
echo "Sending request..."
curl -v -k -X POST "https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -H "Content-Type: text/xml; charset=utf-8" \
     -H "SOAPAction: http://sifp.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -d "$XML_CONTENT"
