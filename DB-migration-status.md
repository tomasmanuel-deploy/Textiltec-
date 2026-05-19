# DB Migration Status — MongoDB Multitenancy

Last updated: 2026-05-18

## ✅ Completed

### Models
| Model | companyId | Scoped unique index |
|-------|-----------|---------------------|
| `Product` | ✅ | `{ companyId, sku }` |
| `Client` | ✅ | `{ companyId, nif }` |
| `Company` | — | `{ nif }` (global) |
| `Document` | via `seller.nif` | — |

### API Routes — Fully migrated to Mongoose
| Route | GET | POST | PUT | DELETE |
|-------|-----|------|-----|--------|
| `/api/products` | ✅ | ✅ | ✅ | ✅ |
| `/api/products/categories` | ✅ | — | — | — |
| `/api/clients` | ✅ | ✅ | ✅ | ✅ |
| `/api/documents` (listing + creation) | ✅ | ✅ | — | — |
| `/api/inventory` | ✅ | ✅ | — | — |
| `/api/inventory/movements` | ✅ | — | — | — |
| `/api/stock-in` | ✅ | ✅ | ✅ | ✅ |
| `/api/purchases` | ✅ | ✅ | ✅ | ✅ |
| `/api/transfers` | ✅ | ✅ | ✅ | ✅ |
| `/api/settings/company` | ✅ | ✅ | — | — |

### Helper Utility
- `src/lib/mongooseProductHelper.ts` — resolves products from MongoDB first, falls back to legacy JSON store for backwards compatibility during transition period.

## ⚠️ Still uses legacy JSON stores (by design)
These modules are config/infrastructure, not tenant data — no migration needed:
- `seriesStore` — billing series config (local, per-device)
- `warehouseStore` — warehouse config
- `documentStore` — fiscal documents (flat-file, AGT compliance)
- `stockStore` / `movementStore` — stock ledger (flat-file)

## How company scoping works
- All Mongoose queries use `Company.findOne({ isDefault: true })` to resolve the active tenant.
- `Product` and `Client` records have a `companyId` ObjectId reference — queries are always filtered `{ companyId: activeCompany._id }`.
- `Document` records are scoped via `{ "seller.nif": activeCompany.nif }`.
- A new company with no data will always see empty lists — no cross-tenant data leakage.
