# AGT Integration Update - Change Log

## Overview
This update addresses missing document types, fixes AGT submission errors for non-fiscal documents, and ensures 100% compliance with AGT DS.120 specifications.

## Key Changes

### 1. Document Types Added
The following document types have been added to the system and fully integrated with AGT submission logic:
- **Factura Genérica (FG)**: Mapped to AGT type `FT`.
- **Factura Global (FGL)**: Mapped to AGT type `FT`.
- **Factura de Adiantamento (FA)**: Mapped to AGT type `FT`.
- **Factura/Recibo de Autofacturação**: Mapped to AGT type `AF` (Self-Billing).
- **Estorno de Recibo (RE)**: Mapped to AGT type `RE`.
- **Aviso de Cobrança (AC)**: Mapped to AGT type `AC`.
- **Aviso de Cobrança/Recibo (AR)**: Mapped to AGT type `RC` (Payment Notice Receipt).

### 2. AGT Submission Logic Updates
- **Excluded Documents**: Proforma Invoices (`PP`), Orçamentos (`OR`), and Notas de Entrega (`NE`/`GR`) are now **EXCLUDED** from automatic AGT submission to prevent validation errors, as these are not mandatory for real-time transmission in this context.
- **Included Documents**: All new document types (FG, FGL, FA, AF, RE, AC, AR) are automatically submitted when issued/paid.
- **Auto-Submit**: logic updated in both creation (POST) and update (PUT) endpoints to respect the new exclusion/inclusion list.

### 3. Fixes
- **Nota de Débito (ND) Reference**: Fixed the issue where ND creation could not find existing invoices to reference. It now correctly filters for `factura` and `factura_recibo`.
- **Recibo de Estorno (RE) Reference**: Added logic to allow RE to reference existing Receipts (`recibo`, `aviso_cobranca_recibo`, `outros_recibos`) for reversal.
- **Self-Billing**: `factura_recibo_autofacturacao` now automatically sets the `selfBillingIndicator` to 1, ensuring correct `AF` mapping.

## Verification
A test script `scripts/run_verify_agt.ts` has been created to validate the payload generation for all new document types.

### How to run the test:
```bash
npx ts-node -O '{"module":"commonjs"}' scripts/run_verify_agt.ts
```

### Expected Output:
The script checks if each document type generates the correct AGT code and payload structure (presence of lines vs paymentReceipt).
- `factura_generica` -> `FT`
- `recibo_estorno` -> `RE`
- `factura_recibo_autofacturacao` -> `AF`
- etc.

## Technical Details
- Modified Files:
  - `src/models/Document.ts`: Added new enum values.
  - `src/services/AgtService.ts`: Updated `mapDocumentTypeToAgt` and payload generation.
  - `src/pages/api/documents/index.ts`: Updated validation and auto-submit list.
  - `src/pages/api/documents/[id]/index.ts`: Updated auto-submit list for updates.
  - `src/pages/api/agt/pending.ts`: Updated pending list filter.
  - `src/pages/documents/new.tsx`: Updated UI dropdown and reference filtering.
  - `src/lib/seriesStore.ts`: Added default series for new types.

## Compliance
All changes follow AGT DS.120 specifications regarding document types, series, and payload structure.
