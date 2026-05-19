import fs from 'fs';
import { resolveDataPath } from './dataPaths';

export type MovementSource = 'manual' | 'stock_in' | 'purchase' | 'transfer_in' | 'transfer_out';

export interface MovementRecord {
  id: string;
  warehouseId: string;
  productId: string;
  delta: number;
  source: MovementSource;
  reference?: string;
  createdAt: string; // ISO timestamp
  status?: 'active' | 'cancelled';
  cancelledAt?: string;
}

interface MovementDataFile {
  nextId: number;
  records: MovementRecord[];
}

const DATA_PATH = resolveDataPath('movements.json');

class MovementStore {
  private records: Map<string, MovementRecord> = new Map();
  private nextId = 1;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_PATH)) {
        const init: MovementDataFile = { nextId: 1, records: [] };
        fs.writeFileSync(DATA_PATH, JSON.stringify(init, null, 2), 'utf-8');
      }
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const data: MovementDataFile = JSON.parse(raw);
      this.records = new Map((data.records || []).map((r) => [r.id, r]));
      this.nextId = data.nextId || 1;
    } catch (e) {
      console.error('Failed to load movements.json', e);
      this.records = new Map();
      this.nextId = 1;
    }
  }

  private save() {
    const payload: MovementDataFile = {
      nextId: this.nextId,
      records: Array.from(this.records.values()),
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  }

  record(input: Omit<MovementRecord, 'id' | 'createdAt'> & { createdAt?: string }): MovementRecord {
    const id = String(this.nextId++);
    const movement: MovementRecord = {
      id,
      warehouseId: input.warehouseId,
      productId: input.productId,
      delta: input.delta,
      source: input.source,
      reference: input.reference,
      createdAt: input.createdAt || new Date().toISOString(),
      status: 'active',
    };
    this.records.set(id, movement);
    this.save();
    return movement;
  }

  list(filter?: {
    warehouseId?: string;
    productId?: string;
    source?: MovementSource;
    limit?: number;
    offset?: number;
  }): { movements: MovementRecord[]; total: number } {
    let arr = Array.from(this.records.values());
    if (filter?.warehouseId) arr = arr.filter((m) => m.warehouseId === filter.warehouseId);
    if (filter?.productId) arr = arr.filter((m) => m.productId === filter.productId);
    if (filter?.source) arr = arr.filter((m) => m.source === filter.source);
    arr = arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = arr.length;
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    arr = arr.slice(offset, offset + limit);
    return { movements: arr, total };
  }

  cancelByReference(source: MovementSource, reference: string): number {
    let count = 0;
    const now = new Date().toISOString();
    this.records.forEach((m) => {
      if (m.source === source && m.reference === reference && m.status !== 'cancelled' && m.delta > 0) {
        m.status = 'cancelled';
        m.cancelledAt = now;
        this.records.set(m.id, m);
        count += 1;
      }
    });
    if (count > 0) this.save();
    return count;
  }
}

export const movementStore = new MovementStore();