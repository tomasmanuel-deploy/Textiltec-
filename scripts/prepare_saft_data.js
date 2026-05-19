
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // 1. Get Company Info
    const companyPath = path.resolve(process.cwd(), 'data/company.json');
    let company = {};
    if (fs.existsSync(companyPath)) {
      company = JSON.parse(fs.readFileSync(companyPath, 'utf8'));
    }

    // 2. Fetch Documents (Local)
    const docPath = path.resolve(process.cwd(), 'data/documents.json');
    let documents = [];
    if (fs.existsSync(docPath)) {
      const docData = JSON.parse(fs.readFileSync(docPath, 'utf8'));
      if (docData.documents) {
        // Convert map to array
        documents = Object.values(docData.documents);
      } else if (Array.isArray(docData)) {
        documents = docData;
      }
    }

    // 3. Construct Payload
    const payload = {
      company: { // Changed from header to match python script expectation
        companyID: company.nif || '999999999',
        taxRegistrationNumber: company.nif || '999999999',
        companyName: company.name || 'Empresa Exemplo',
        businessName: company.tradeName || company.name || 'Empresa Exemplo',
        addressDetail: company.address || 'Luanda',
        city: company.city || 'Luanda',
        province: company.province || 'Luanda',
        country: 'AO',
        postalCode: '1000',
        currencyCode: 'AOA',
        fiscalYear: new Date().getFullYear().toString(),
        startDate: `${new Date().getFullYear()}-01-01`,
        endDate: `${new Date().getFullYear()}-12-31`,
        dateCreated: new Date().toISOString().split('T')[0],
        taxEntity: 'Global',
        productCompanyTaxID: company.saftProductCompanyTaxId || '5000000000',
        softwareValidationNumber: company.saftSoftwareValidationNumber || '000/AGT/2020',
        productID: company.saftProductId || 'Product/1.0',
        productVersion: company.saftProductVersion || '1.0.0',
        telephone: company.phone || '000000000',
        email: company.email || 'geral@empresa.ao',
        website: company.website || 'www.empresa.ao'
      },
      documents: documents
    };

    console.log(JSON.stringify(payload, null, 2));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
