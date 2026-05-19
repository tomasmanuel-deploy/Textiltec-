#!/bin/bash
echo "Testing SOAP endpoint via curl..."
curl -k -v -X POST "https://sifphml.minfin.gov.ao/sigt/fe/ws/v1/registarFactura" \
     -H "Content-Type: text/xml; charset=utf-8" \
     -d '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v1="http://sifp.minfin.gov.ao/sigt/fe/ws/v1">
   <soapenv:Header/>
   <soapenv:Body>
      <v1:RegistarFacturaRequest>
         <AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
            <SourceDocuments>
               <SalesInvoices>
                  <Invoice>
                     <InvoiceNo>FT S001/1</InvoiceNo>
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
                     <CustomerID>Consumidor Final</CustomerID>
                     <Line>
                        <LineNumber>1</LineNumber>
                        <ProductCode>SERV001</ProductCode>
                        <ProductDescription>Servico Teste</ProductDescription>
                        <Quantity>1</Quantity>
                        <UnitOfMeasure>UN</UnitOfMeasure>
                        <UnitPrice>1000</UnitPrice>
                        <TaxPointDate>2025-02-05</TaxPointDate>
                        <Description>Servico Teste</Description>
                        <CreditAmount>1000</CreditAmount>
                        <Tax>
                           <TaxType>IVA</TaxType>
                           <TaxCountryRegion>AO</TaxCountryRegion>
                           <TaxCode>NOR</TaxCode>
                           <TaxPercentage>14</TaxPercentage>
                        </Tax>
                        <SettlementAmount>0</SettlementAmount>
                     </Line>
                     <DocumentTotals>
                        <TaxPayable>140</TaxPayable>
                        <NetTotal>1000</NetTotal>
                        <GrossTotal>1140</GrossTotal>
                     </DocumentTotals>
                  </Invoice>
               </SalesInvoices>
            </SourceDocuments>
         </AuditFile>
      </v1:RegistarFacturaRequest>
   </soapenv:Body>
</soapenv:Envelope>'
