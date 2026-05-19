import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface TransferLine {
  productId: string;
  quantity: number;
  unit?: string;
}

export interface Transfer {
  id: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  status: 'draft' | 'posted';
  lines: TransferLine[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const initialMockTransfers: { [key: string]: Transfer } = {
  '1': {
    id: '1',
    originWarehouseId: '1',
    destinationWarehouseId: '2',
    status: 'draft',
    lines: [
      { productId: '1', quantity: 5, unit: 'un' }
    ],
    notes: 'Movimento inicial de teste',
    createdAt: new Date('2023-03-01'),
    updatedAt: new Date('2023-03-01')
  }
};

class TransferStore {
  private transfers: { [key: string]: Transfer } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('transfers.json');
    this.loadTransfers();
  }

  private loadTransfers() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'));
        this.transfers = data.transfers || {};
        this.nextId = data.nextId || Object.keys(this.transfers).length + 1;
      } else {
        this.transfers = {};
        this.nextId = 1;
        this.saveTransfers();
      }
    } catch (error) {
      console.error('Error loading transfers:', error);
      this.transfers = {};
      this.nextId = 1;
    }
  }

  private saveTransfers() {
    try {
      const dirPath = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(this.dataFilePath, JSON.stringify({
        transfers: this.transfers,
        nextId: this.nextId
      }, null, 2));
    } catch (error) {
      console.error('Error saving transfers:', error);
    }
  }

  getTransfers(filter?: { status?: 'draft' | 'posted' }) {
    let list = Object.values(this.transfers);
    if (filter?.status) list = list.filter(t => t.status === filter.status);
    return list;
  }

  getTransfer(id: string): Transfer | null {
    return this.transfers[id] || null;
  }

  createTransfer(data: { originWarehouseId: string; destinationWarehouseId: string; lines: TransferLine[]; notes?: string; status?: 'draft' | 'posted' }): Transfer {
    if (!data.originWarehouseId || !data.destinationWarehouseId) {
      throw new Error('Origin and destination are required');
    }
    if (data.originWarehouseId === data.destinationWarehouseId) {
      throw new Error('Origin and destination must be different');
    }
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw new Error('At least one line is required');
    }
    data.lines.forEach(line => {
      if (!line.productId || typeof line.quantity !== 'number' || line.quantity <= 0) {
        throw new Error('Invalid line item');
      }
    });
    const id = String(this.nextId++);
    const now = new Date();
    const transfer: Transfer = {
      id,
      originWarehouseId: data.originWarehouseId,
      destinationWarehouseId: data.destinationWarehouseId,
      status: data.status || 'draft',
      lines: data.lines,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };
    this.transfers[id] = transfer;
    this.saveTransfers();
    return transfer;
  }

  updateTransfer(id: string, updates: Partial<Omit<Transfer, 'id' | 'createdAt'>>): Transfer | null {
    const current = this.transfers[id];
    if (!current) return null;
    const updated: Transfer = {
      ...current,
      ...updates,
      status: updates.status || current.status,
      lines: updates.lines || current.lines,
      notes: updates.notes !== undefined ? updates.notes : current.notes,
      originWarehouseId: updates.originWarehouseId || current.originWarehouseId,
      destinationWarehouseId: updates.destinationWarehouseId || current.destinationWarehouseId,
      updatedAt: new Date()
    };
    if (updated.originWarehouseId === updated.destinationWarehouseId) {
      throw new Error('Origin and destination must be different');
    }
    if (!Array.isArray(updated.lines) || updated.lines.length === 0) {
      throw new Error('At least one line is required');
    }
    updated.lines.forEach(line => {
      if (!line.productId || typeof line.quantity !== 'number' || line.quantity <= 0) {
        throw new Error('Invalid line item');
      }
    });
    this.transfers[id] = updated;
    this.saveTransfers();
    return updated;
  }

  deleteTransfer(id: string): boolean {
    if (!this.transfers[id]) return false;
    delete this.transfers[id];
    this.saveTransfers();
    return true;
  }
}

export const transferStore = new TransferStore();