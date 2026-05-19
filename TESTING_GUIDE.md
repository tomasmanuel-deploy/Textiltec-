# Testing Guide - AGT Compliance Features

## 🚀 Application Running

The development server should be available at: **http://localhost:3000**

## 📋 Testing Checklist

### 1. Taxpayer Consultation (Consulta de Contribuinte)

**Location**: Can be integrated in document creation/editing pages

**Test Steps**:
1. Navigate to `/documents/new` or edit an existing document
2. Enter a NIF in the customer NIF field
3. Click "Consultar AGT" button (if TaxpayerLookup component is integrated)
4. Verify:
   - ✅ Taxpayer information is displayed if found
   - ✅ Status shows as "Ativo", "Inativo", or "Suspenso"
   - ✅ Name and address are populated
   - ✅ Cache works (second lookup is faster)

**API Endpoint**: `GET /api/agt/taxpayer/consult?nif=123456789`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "nif": "123456789",
    "name": "Company Name",
    "status": "active",
    "isValid": true
  },
  "cached": false
}
```

### 2. Document Validation

**Test Steps**:
1. Create a new document at `/documents/new`
2. Fill in form fields
3. Verify validation badge shows:
   - ✅ Green badge when document is valid
   - ✅ Red badge with errors when invalid
   - ✅ Yellow badge with warnings when needed
4. Try creating documents with:
   - Missing required fields (should show errors)
   - Invalid NIF format (should validate)
   - Zero unit price for invoice (should error)
   - Valid complete document (should pass)

**Component**: `DocumentValidationBadge` (can be added to forms)

### 3. AGT Configuration

**Test Steps**:
1. Check current config: `GET /api/agt/config`
2. Update config: `POST /api/agt/config`
```json
{
  "apiUrl": "https://api.agt.gov.ao",
  "clientId": "your-client-id",
  "clientSecret": "your-secret",
  "testMode": true,
  "environment": "development"
}
```
3. Verify config is saved

### 4. Document Submission to AGT

**Test Steps**:
1. Create a valid document
2. Submit to AGT: `POST /api/documents/{id}/submit-agt`
3. Verify:
   - ✅ Document is validated before submission
   - ✅ Returns AGT token on success
   - ✅ Updates document with AGT submission status
   - ✅ Logs are created in audit logs

**Expected Response**:
```json
{
  "success": true,
  "message": "Document submitted successfully to AGT",
  "token": "AGT-123456789",
  "validation": {
    "isValid": true,
    "warnings": []
  }
}
```

### 5. SAF-T XML Export

**Test Steps**:
1. Create several documents of different types
2. Navigate to export SAF-T (if UI exists) or use API:
   `GET /api/documents/export-xml?startDate=2024-01-01&endDate=2024-12-31`
3. Verify XML:
   - ✅ InvoiceNo format: `FT S001/1` (not `FT 2024/1`)
   - ✅ InvoiceStatus: N, S, A, or R (not F)
   - ✅ Period: 1-12 (not 0-11)
   - ✅ VAT codes: NOR, RED, ISE, OUT
   - ✅ Version: 1.01_01
   - ✅ Namespace: `urn:OECD:StandardAuditFile-Tax:AO_1.01_01`
   - ✅ Date format: YYYY-MM-DD

### 6. Audit Logging

**Test Steps**:
1. Perform various AGT operations:
   - Submit document
   - Consult taxpayer
   - Export SAF-T
2. Check audit logs in: `data/audit_logs/audit_YYYY-MM-DD.jsonl`
3. Verify logs contain:
   - ✅ Timestamp
   - ✅ Action type
   - ✅ Status (success/error)
   - ✅ Details

### 7. Document Types Mapping

**Test creating documents with different types**:
- ✅ `factura` → FT
- ✅ `factura_recibo` → FR
- ✅ `nota_de_credito` → NC
- ✅ `nota_de_debito` → ND
- ✅ `recibo` → RP

### 8. VAT Rate Mapping

**Test documents with different VAT rates**:
- ✅ 14% → NOR
- ✅ 7% → RED
- ✅ 0% with exemption → OUT
- ✅ 0% without exemption → ISE

## 🧪 Manual API Testing

### Using curl:

```bash
# 1. Check AGT Config
curl http://localhost:3000/api/agt/config

# 2. Consult Taxpayer
curl "http://localhost:3000/api/agt/taxpayer/consult?nif=123456789"

# 3. Submit Document to AGT
curl -X POST http://localhost:3000/api/documents/{id}/submit-agt

# 4. Export SAF-T XML
curl "http://localhost:3000/api/documents/export-xml?startDate=2024-01-01&endDate=2024-12-31" > saft.xml
```

### Using Browser Console:

```javascript
// Consult Taxpayer
fetch('/api/agt/taxpayer/consult?nif=123456789')
  .then(r => r.json())
  .then(console.log);

// Get AGT Config
fetch('/api/agt/config')
  .then(r => r.json())
  .then(console.log);
```

## ✅ Expected Behaviors

1. **Taxpayer Consultation**:
   - First call may take 1-2 seconds
   - Cached calls are < 200ms
   - Invalid NIF shows appropriate error

2. **Document Validation**:
   - Real-time validation as you type (debounced 500ms)
   - Shows specific field errors
   - Prevents submission of invalid documents

3. **SAF-T Export**:
   - XML validates against XSD
   - All required fields present
   - Correct format for all fields

4. **Audit Logs**:
   - All AGT operations are logged
   - Logs rotate automatically
   - Queryable by filters

## 🐛 Known Test Mode Behavior

When `testMode: true` in AGT config:
- Taxpayer consultation returns mock data
- Document submission simulates success
- No real API calls are made

To test with real AGT API:
1. Set `testMode: false`
2. Configure valid `clientId` and `clientSecret`
3. Ensure network connectivity to AGT API

## 📝 Test Results Template

```
✅ Taxpayer Consultation: [ ] Pass / [ ] Fail
✅ Document Validation: [ ] Pass / [ ] Fail
✅ AGT Configuration: [ ] Pass / [ ] Fail
✅ Document Submission: [ ] Pass / [ ] Fail
✅ SAF-T XML Export: [ ] Pass / [ ] Fail
✅ Audit Logging: [ ] Pass / [ ] Fail
✅ InvoiceNo Format: [ ] Pass / [ ] Fail
✅ Status Mapping: [ ] Pass / [ ] Fail
✅ VAT Codes: [ ] Pass / [ ] Fail
```

## 🎯 Success Criteria

All tests should pass with:
- ✅ No errors in console
- ✅ Correct data formats
- ✅ Fast response times
- ✅ Proper error handling
- ✅ Complete audit trail

