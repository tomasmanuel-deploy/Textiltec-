# DS.120 Compliance Fixes - AGT registarFactura API

## Summary
Fixed the JSON payload generation to comply with DS.120 specification for the AGT `registarFactura` REST API endpoint.

## Key Changes

### 1. New Method: `generateRegistarFacturaPayload`
Created a new method that generates JSON payloads according to the DS.120 specification format, which is different from the SAF-T XML format.

**Location:** `src/services/AgtService.ts`

### 2. Field Name Corrections
Fixed field names to match DS.120 specification:
- ✅ `documentNo` (not `invoiceNo`)
- ✅ `lines` (not `line`) - array of line items
- ✅ `taxes` (array, not single `tax` object)
- ✅ `withholdingTaxList` (not `withholdingTax`)
- ✅ `taxContribution` (required in taxes array)
- ✅ `taxExemptionCode` (in taxes array, not at line level)

### 3. PaymentReceipt Handling
**Critical Fix:** `paymentReceipt` field is now correctly handled:
- ✅ **NOT included** for document type `AF` (Autofacturação)
- ✅ **ONLY included** for receipt types: `AR`, `RC`, `RG`
- ✅ For receipt types, `lines` array is **NOT included** (per DS.120 spec)

### 4. Tax Structure Compliance
- ✅ `taxes` is always an array (even for single tax)
- ✅ `taxContribution` is calculated and rounded UP to next cent (as per DS.120 spec)
- ✅ `taxExemptionCode` is included when `taxCode` is `ISE` or `OUT`
- ✅ For lines without VAT rate, `NS` (Não sujeito) tax type is added

### 5. Tax Contribution Rounding
Implemented correct rounding logic per DS.120 specification:
- Example: 23.144 → 23.15
- Example: 0.001844 → 0.01
- Example: 5.9999999 → 6.00

**Implementation:**
```typescript
const taxContribution = Math.ceil(lineTax * 100) / 100;
```

### 6. Document Type Handling
- ✅ `AF` (Autofacturação): Has `lines`, NO `paymentReceipt`
- ✅ `AR`, `RC`, `RG` (Receipts): NO `lines`, HAS `paymentReceipt`
- ✅ `NC` (Credit Note): Uses `creditAmount` instead of `debitAmount`
- ✅ `ND` (Debit Note): Uses `debitAmount`

### 7. Reference Info for Credit Notes
- ✅ `referenceInfo` is added to lines when document type is `NC`
- ✅ Includes `reference` (original invoice number) and `reason`

### 8. Document Status Handling
- ✅ `documentCancelReason` added when `documentStatus` is `A` (Anulado)
- ✅ `rejectedDocumentNo` added when `documentStatus` is `C` (Correção)

## JSON Structure (DS.120 Format)

```json
{
  "schemaVersion": "1.0",
  "submissionUUID": "...",
  "taxRegistrationNumber": "...",
  "submissionTimeStamp": "...",
  "softwareInfo": {
    "softwareInfoDetail": {
      "productId": "...",
      "productVersion": "...",
      "softwareValidationNumber": "..."
    },
    "jwsSoftwareSignature": "..."
  },
  "numberOfEntries": "1",
  "documents": [{
    "documentNo": "AF S001/1",
    "documentStatus": "N",
    "jwsDocumentSignature": "...",
    "documentDate": "2025-10-27",
    "documentType": "AF",
    "systemEntryDate": "2025-10-27T10:00:00",
    "customerTaxID": "999999999",
    "customerCountry": "AO",
    "companyName": "...",
    "lines": [{
      "lineNumber": "1",
      "productCode": "...",
      "productDescription": "...",
      "quantity": "1",
      "unitOfMeasure": "UN",
      "unitPrice": "100000",
      "unitPriceBase": "100000",
      "debitAmount": "100000",
      "taxes": [{
        "taxType": "IVA",
        "taxCountryRegion": "AO",
        "taxCode": "NOR",
        "taxPercentage": "14",
        "taxContribution": "14000"
      }]
    }],
    "documentTotals": {
      "taxPayable": "14000",
      "netTotal": "110000",
      "grossTotal": "124000"
    },
    "withholdingTaxList": []
  }]
}
```

## Testing

### Test Case: AF (Autofacturação)
- ✅ Should have `lines` array
- ✅ Should NOT have `paymentReceipt`
- ✅ Should have correct tax structure with `taxContribution`

### Test Case: AR, RC, RG (Receipts)
- ✅ Should NOT have `lines` array
- ✅ Should have `paymentReceipt` with `sourceDocuments`

### Test Case: NC (Credit Note)
- ✅ Should use `creditAmount` instead of `debitAmount`
- ✅ Should have `referenceInfo` in lines

## Error Fixed

**Previous Error:**
```
Utilização incorrecta do campo "paymentReceipt" para o tipo de factura (AF).
```

**Root Cause:**
The old implementation was including `paymentReceipt` for all document types, but according to DS.120 spec, it should only be included for receipt types (AR, RC, RG) and NOT for AF.

**Solution:**
Added conditional logic to only include `paymentReceipt` when `isReceiptType` is true, which excludes AF type.

## Files Modified

1. `src/services/AgtService.ts`
   - Added `generateRegistarFacturaPayload()` method
   - Updated `generateSaftJson()` to use new method
   - Fixed field names and structure to match DS.120 spec

## Next Steps


## Recent Updates (RE and RG Compliance)

### 1. RE (Recibo de Estorno) Fix
**Error Fixed:** `Utilização incorrecta do campo 'paymentReceipt' para o tipo de factura (RE).`

**Changes:**
- Removed `RE` from `isReceiptType` list (it is NOT a standard receipt structure in DS.120 context).
- `RE` is now treated as a reversal document (similar to `NC`).
- **Structure:**
  - Has `lines` array.
  - Does NOT have `paymentReceipt`.
  - Uses `creditAmount`.
  - Includes `referenceInfo` in lines with reason "Estorno".

### 2. RG (Outros Recibos) Implementation
**Goal:** Generate compliant payload for "Outros recibos".

**Changes:**
- Added `OTHER_RECEIPT` ('outros_recibos') to `DocumentType` enum.
- Mapped `OTHER_RECEIPT` to `RG` in `AgtService.ts`.
- **Structure:**
  - Treated as a receipt type (`isReceiptType = true`).
  - Has `paymentReceipt` with `sourceDocuments`.
  - Does NOT have `lines` array.
  - Uses `debitAmount` (Standard receipt behavior).

### Updated Document Type Behavior Matrix

| Document Type | AGT Code | Structure | Amount Field | Specifics |
|--------------|----------|-----------|--------------|-----------|
| Invoice | FT | Lines | debitAmount | Standard invoice |
| Invoice/Receipt | FR | Lines | debitAmount | Invoice with payment |
| Self-Billing | AF | Lines | debitAmount | No paymentReceipt |
| Credit Note | NC | Lines | creditAmount | Has referenceInfo |
| Debit Note | ND | Lines | debitAmount | Has referenceInfo |
| **Recibo Estorno** | **RE** | **Lines** | **creditAmount** | **Has referenceInfo** |
| Receipt | RC | PaymentReceipt | debitAmount | No lines |
| **Outros Recibos** | **RG** | **PaymentReceipt** | **debitAmount** | **No lines** |


