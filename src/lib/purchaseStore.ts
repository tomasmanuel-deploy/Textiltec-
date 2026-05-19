import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface PurchaseLine {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export interface Purchase {
  id: string;
  warehouseId: string;
  supplierId?: string;
  supplierName: string;
  supplierNif?: string;
  status: 'draft' | 'posted';
  date: string;
  reference?: string;
  lines: PurchaseLine[];
}

interface PurchaseDataFile {
  nextId: number;
  records: Purchase[];
}

const DATA_PATH = resolveDataPath('purchases.json');

class PurchaseStore {
  private records: Map<string, Purchase> = new Map();
  private nextId = 1;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_PATH)) {
        const init: PurchaseDataFile = { nextId: 1, records: [] };
        fs.writeFileSync(DATA_PATH, JSON.stringify(init, null, 2), 'utf-8');
      }
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const data: PurchaseDataFile = JSON.parse(raw);
      this.records = new Map((data.records || []).map(r => [r.id, r]));
      this.nextId = data.nextId || 1;
    } catch (e) {
      console.error('Failed to load purchases.json', e);
      this.records = new Map();
      this.nextId = 1;
    }
  }

  private save() {
    const payload: PurchaseDataFile = {
      nextId: this.nextId,
      records: Array.from(this.records.values()),
    };
    const dirPath = path.dirname(DATA_PATH);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  }

  list(status?: 'draft' | 'posted') {
    const arr = Array.from(this.records.values());
    return status ? arr.filter(r => r.status === status) : arr;
  }

  get(id: string) {
    return this.records.get(id) || null;
  }

  create(input: Omit<Purchase, 'id' | 'status' | 'date'> & { status?: 'draft' | 'posted'; date?: string }) {
    if (!input.warehouseId) throw new Error('warehouseId is required');
    if (!input.supplierName) throw new Error('supplierName is required');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('At least one line is required');
    for (const l of input.lines) {
      if (!l.productId || typeof l.quantity !== 'number' || l.quantity <= 0) {
        throw new Error('Invalid line item');
      }
    }
    const id = String(this.nextId++);
    const record: Purchase = {
      id,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      supplierNif: input.supplierNif,
      status: input.status || 'draft',
      date: input.date || new Date().toISOString().slice(0, 10),
      reference: input.reference,
      lines: input.lines,
    };
    this.records.set(id, record);
    this.save();
    return record;
  }

  update(id: string, updates: Partial<Purchase>) {
    const current = this.records.get(id);
    if (!current) return null;
    const next: Purchase = {
      ...current,
      warehouseId: updates.warehouseId ?? current.warehouseId,
      supplierId: updates.supplierId ?? current.supplierId,
      supplierName: updates.supplierName ?? current.supplierName,
      supplierNif: updates.supplierNif ?? current.supplierNif,
      status: updates.status ?? current.status,
      date: updates.date ?? current.date,
      reference: updates.reference ?? current.reference,
      lines: updates.lines ?? current.lines,
    };
    if (!next.warehouseId) throw new Error('warehouseId is required');
    if (!next.supplierName) throw new Error('supplierName is required');
    if (!Array.isArray(next.lines) || next.lines.length === 0) throw new Error('At least one line is required');
    for (const l of next.lines) {
      if (!l.productId || typeof l.quantity !== 'number' || l.quantity <= 0) {
        throw new Error('Invalid line item');
      }
    }
    this.records.set(id, next);
    this.save();
    return next;
  }

  delete(id: string) {
    const existed = this.records.delete(id);
    this.save();
    return existed;
  }
}

export const purchaseStore = new PurchaseStore();