# AGT Technical Implementation Summary - Validation & Compliance

## Overview
This document outlines the professional implementation of strict validation rules for the AGT-certified billing system. The goal is to ensure data integrity, prevent the creation of invalid documents (zero value, no lines), and maintain full compliance with AGT DS.120 standards.

## Core Validation Logic (`src/lib/documentStore.ts`)

A centralized validation mechanism has been implemented within the `DocumentStore` class to enforce business rules at the data persistence layer. This ensures that no matter which API endpoint or UI component attempts to create or update a document, the rules are applied consistently.

### 1. Mandatory Content Validation
The system now enforces that every document must contain meaningful content:
- **Line Items Required**: No document can be created without at least one line item (product or service).
- **Description Mandate**: Every line item must have a valid, non-empty description.

### 2. Value Integrity
Strict financial validation rules are applied to prevent "zero-value" documents:
- **Positive Quantities**: Standard documents (FT, FR, etc.) must have `quantity > 0`.
- **Non-Negative Prices**: Unit prices cannot be negative.
- **Total Value Check**: The calculated total of the document must be strictly greater than zero (or non-zero for Credit Notes).
- **Credit Note Handling**: Special logic for `Nota de Crédito` (NC) allows for negative quantities/totals as per system design, but strictly prohibits zero-value documents.

### 3. Implementation Details

#### `validateDocumentContent` Method
A private helper method encapsulates the validation logic:

```typescript
private validateDocumentContent(lines: LineItem[], type: string): void {
  // 1. Structure Check
  if (!lines || lines.length === 0) {
    throw new Error('O documento deve conter pelo menos um produto ou serviço.');
  }

  let totalCheck = 0;
  const isCreditNote = type === 'nota_de_credito' || type === 'NC';

  // 2. Line-by-Line Validation
  for (const line of lines) {
    // Description Check
    if (!line.description || !line.description.trim()) {
      throw new Error('Todos os itens devem ter uma descrição válida.');
    }
    
    // Price Integrity
    if (Number(line.unitPrice) < 0) {
      throw new Error(`O item "${line.description}" não pode ter preço unitário negativo.`);
    }

    // Quantity Logic (Type-Aware)
    const q = Number(line.quantity);
    if (isCreditNote) {
      if (q === 0) throw new Error(`O item "${line.description}" deve ter uma quantidade diferente de zero.`);
    } else {
      if (q <= 0) throw new Error(`O item "${line.description}" deve ter uma quantidade maior que zero.`);
    }

    // Total Accumulation (Net + Tax)
    // ... calculation logic ...
    totalCheck += (val + tax);
  }

  // 3. Document Total Validation
  if (Math.abs(totalCheck) === 0) {
     throw new Error('O documento não pode ter valor total zero.');
  }
  
  if (!isCreditNote && totalCheck < 0) {
      throw new Error('O documento não pode ter valor total negativo (exceto Notas de Crédito).');
  }
}
```

### 4. Integration Points

- **Creation (`createDocument`)**: Validation runs immediately before any document ID is assigned or data is persisted.
- **Updates (`updateDocument`)**: Validation runs whenever:
    - Line items are modified.
    - Document status changes to `issued` (finalization), ensuring no draft can be finalized in an invalid state.

## Benefits
- **Compliance**: Meets AGT requirements for document validity.
- **Data Quality**: Prevents database pollution with empty or meaningless records.
- **User Experience**: Provides clear, descriptive error messages (e.g., specific item names in errors) to guide users in correcting mistakes.
- **Robustness**: Handles edge cases like Credit Notes and varying tax rates correctly.

This implementation ensures a brilliant and professional foundation for the billing system's document management.
