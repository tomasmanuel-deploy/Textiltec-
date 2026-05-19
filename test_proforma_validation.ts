
const documentValidationService = require('./src/services/DocumentValidationService').default;

const proformaDoc = {
  id: 'test-pp',
  documentType: 'proforma',
  issueDate: new Date().toISOString(),
  series: 'PP',
  sequentialNumber: 1,
  totals: { total: 100 },
  payment: { method: 'NU' },
  buyer: { name: 'Test' },
  seller: { name: 'Test Seller' },
  lines: [{ description: 'Test', quantity: 1, unitPrice: 100, tax: { code: 'NOR', percentage: 14 } }]
};

console.log('Testing Proforma validation for AGT submission...');

const result = documentValidationService.validateForAgtSubmission(proformaDoc);

if (!result.isValid) {
  const agtError = result.errors.find((e: any) => e.code === 'INVALID_DOCUMENT_TYPE_AGT');
  if (agtError) {
    console.log('[PASS] Proforma validation failed as expected with code:', agtError.code);
    console.log('Message:', agtError.message);
  } else {
    console.log('[FAIL] Validation failed but not with expected error code.');
    console.log('Errors:', JSON.stringify(result.errors, null, 2));
  }
} else {
  console.log('[FAIL] Proforma validation passed unexpectedly.');
  console.log('Errors:', JSON.stringify(result.errors, null, 2));
}
