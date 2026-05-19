import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface Supplier {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email?: string;
  phone?: string;
  clientType?: 'individual' | 'company';
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const initialMockSuppliers: { [key: string]: Supplier } = {
  '1': {
    id: '1',
    name: 'Tecnofortes',
    tradeName: 'Tecnofortes',
    nif: '423425',
    address: 'Luanda',
    email: 'info@tecnofortes.co.ao',
    phone: '+244 923 000 000',
    clientType: 'company',
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  '2': {
    id: '2',
    name: 'Fornecedor Geral, Lda',
    tradeName: 'Fornecedor Geral',
    nif: '5000123456',
    address: 'Zona Industrial, Luanda',
    email: 'contacto@fornecedorgeral.ao',
    phone: '+244 923 111 222',
    clientType: 'company',
    status: 'active',
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-02-10')
  }
};

class SupplierStore {
  private suppliers: { [key: string]: Supplier } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('suppliers.json');
    this.loadSuppliers();
  }

  private loadSuppliers(): void {
    try {
      const dataDir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

      if (fs.existsSync(this.dataFilePath)) {
        const content = fs.readFileSync(this.dataFilePath, 'utf-8');
        const data = JSON.parse(content || '{}');
        this.suppliers = data.suppliers || {};
        this.nextId = data.nextId || 1;
      } else {
        this.suppliers = {};
        this.nextId = 1;
        this.saveSuppliers();
      }
    } catch (e) {
      console.error('Error loading suppliers:', e);
      this.suppliers = {};
      this.nextId = 1;
    }
  }

  private saveSuppliers(): void {
    try {
      const data = { suppliers: this.suppliers, nextId: this.nextId, lastUpdated: new Date().toISOString() };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Error saving suppliers:', e);
    }
  }

  getAllSuppliers(): Supplier[] {
    return Object.values(this.suppliers).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getSupplierById(id: string): Supplier | null {
    return this.suppliers[id] || null;
  }

  createSupplier(input: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Supplier {
    const id = String(this.nextId++);
    const now = new Date();
    const supplier: Supplier = { ...input, clientType: input.clientType || 'company', id, createdAt: now, updatedAt: now };
    this.suppliers[id] = supplier;
    this.saveSuppliers();
    return supplier;
  }

  updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Supplier | null {
    const current = this.suppliers[id];
    if (!current) return null;
    const updated: Supplier = { ...current, ...updates, updatedAt: new Date() };
    this.suppliers[id] = updated;
    this.saveSuppliers();
    return updated;
  }

  deleteSupplier(id: string): boolean {
    if (!this.suppliers[id]) return false;
    delete this.suppliers[id];
    this.saveSuppliers();
    return true;
  }

  nifExists(nif: string, excludeId?: string): boolean {
    const target = (nif || '').trim();
    return Object.values(this.suppliers).some(s => s.nif === target && s.id !== excludeId);
  }

  filterSuppliers(options: { status?: 'active' | 'inactive'; clientType?: 'individual' | 'company'; search?: string; limit?: number; offset?: number }): { suppliers: Supplier[]; total: number } {
    let list = Object.values(this.suppliers);
    if (options.status) list = list.filter(s => s.status === options.status);
    if (options.clientType) list = list.filter(s => s.clientType === options.clientType);
    if (options.search) {
      const term = options.search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(term) || s.nif.toLowerCase().includes(term));
    }
    list = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = list.length;
    if (options.offset !== undefined && options.limit !== undefined) {
      list = list.slice(options.offset, options.offset + options.limit);
    }
    return { suppliers: list, total };
  }
}

export const supplierStore = new SupplierStore();