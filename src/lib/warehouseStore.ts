import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const initialMockWarehouses: { [key: string]: Warehouse } = {
  '1': {
    id: '1',
    name: 'Armazém Central',
    code: 'ARM-CENTRAL',
    address: 'Zona Industrial, Luanda',
    status: 'active',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  },
  '2': {
    id: '2',
    name: 'Armazém Norte',
    code: 'ARM-NORTE',
    address: 'Estrada Norte, Lubango',
    status: 'inactive',
    createdAt: new Date('2023-02-15'),
    updatedAt: new Date('2023-02-15')
  }
};

class WarehouseStore {
  private warehouses: { [key: string]: Warehouse } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('warehouses.json');
    this.loadWarehouses();
  }

  private loadWarehouses() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'));
        this.warehouses = data.warehouses || {};
        this.nextId = data.nextId || Object.keys(this.warehouses).length + 1;
      } else {
        // Initialize with empty data
        this.warehouses = {};
        this.nextId = 1;
        this.saveWarehouses();
      }
    } catch (error) {
      console.error('Error loading warehouses:', error);
      this.warehouses = {};
      this.nextId = 1;
    }
  }

  private saveWarehouses() {
    try {
      const dirPath = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(this.dataFilePath, JSON.stringify({
        warehouses: this.warehouses,
        nextId: this.nextId
      }, null, 2));
    } catch (error) {
      console.error('Error saving warehouses:', error);
    }
  }

  getWarehouses(filter?: { status?: 'active' | 'inactive'; search?: string }) {
    let list = Object.values(this.warehouses);
    if (filter?.status) {
      list = list.filter(w => w.status === filter.status);
    }
    if (filter?.search) {
      const term = filter.search.toLowerCase();
      list = list.filter(w => (
        w.name.toLowerCase().includes(term) ||
        w.code.toLowerCase().includes(term) ||
        (w.address || '').toLowerCase().includes(term)
      ));
    }
    return list;
  }

  getWarehouse(id: string): Warehouse | null {
    return this.warehouses[id] || null;
  }

  createWarehouse(data: { name: string; code: string; address?: string; status?: 'active' | 'inactive' }): Warehouse {
    const code = data.code.trim();
    // Unique code validation
    const exists = Object.values(this.warehouses).some(w => w.code.toLowerCase() === code.toLowerCase());
    if (exists) {
      throw new Error('Warehouse code must be unique');
    }
    const id = String(this.nextId++);
    const now = new Date();
    const warehouse: Warehouse = {
      id,
      name: data.name.trim(),
      code,
      address: data.address?.trim(),
      status: data.status || 'active',
      createdAt: now,
      updatedAt: now
    };
    this.warehouses[id] = warehouse;
    this.saveWarehouses();
    return warehouse;
  }

  updateWarehouse(id: string, updates: Partial<Omit<Warehouse, 'id' | 'createdAt'>>): Warehouse | null {
    const current = this.warehouses[id];
    if (!current) return null;
    // If code is changing, ensure uniqueness
    if (updates.code && updates.code.trim().toLowerCase() !== current.code.toLowerCase()) {
      const exists = Object.values(this.warehouses).some(w => w.code.toLowerCase() === updates.code!.trim().toLowerCase());
      if (exists) {
        throw new Error('Warehouse code must be unique');
      }
    }
    const updated: Warehouse = {
      ...current,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      code: updates.code !== undefined ? updates.code.trim() : current.code,
      address: updates.address !== undefined ? updates.address?.trim() : current.address,
      updatedAt: new Date()
    };
    this.warehouses[id] = updated;
    this.saveWarehouses();
    return updated;
  }

  deleteWarehouse(id: string): boolean {
    if (!this.warehouses[id]) return false;
    delete this.warehouses[id];
    this.saveWarehouses();
    return true;
  }
}

export const warehouseStore = new WarehouseStore();