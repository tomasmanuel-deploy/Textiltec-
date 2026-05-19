import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface Category {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

class CategoryStore {
  private categories: Record<string, Category> = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('categories.json');
    this.load();
  }

  private load(): void {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const cats: Record<string, Category> = parsed.categories || {};
        // Restore Date objects
        Object.keys(cats).forEach((id) => {
          cats[id].createdAt = new Date(cats[id].createdAt);
          cats[id].updatedAt = new Date(cats[id].updatedAt);
        });
        this.categories = cats;
        this.nextId = parsed.nextId || 1;
      } else {
        this.categories = {};
        this.nextId = 1;
        this.save();
      }
    } catch (err) {
      console.error('Error loading categories:', err);
      this.categories = {};
      this.nextId = 1;
    }
  }

  private save(): void {
    try {
      const payload = {
        categories: this.categories,
        nextId: this.nextId,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error('Error saving categories:', err);
    }
  }

  getAllCategories(): Category[] {
    return Object.values(this.categories).sort((a, b) => a.name.localeCompare(b.name));
  }

  getCategoryById(id: string): Category | null {
    return this.categories[id] || null;
  }

  findByName(name: string): Category | null {
    const n = name.trim().toLowerCase();
    const found = Object.values(this.categories).find((c) => c.name.trim().toLowerCase() === n);
    return found || null;
  }

  nameExists(name: string, excludeId?: string): boolean {
    const n = name.trim().toLowerCase();
    return Object.values(this.categories).some((c) => c.name.trim().toLowerCase() === n && c.id !== excludeId);
  }

  createCategory(data: { name: string; status?: 'active' | 'inactive' }): Category {
    const id = String(this.nextId);
    this.nextId++;
    const now = new Date();
    const cat: Category = {
      id,
      name: data.name.trim(),
      status: data.status || 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.categories[id] = cat;
    this.save();
    return cat;
  }

  updateCategory(id: string, updates: Partial<Pick<Category, 'name' | 'status'>>): Category | null {
    const existing = this.categories[id];
    if (!existing) return null;
    const updated: Category = {
      ...existing,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.status ? { status: updates.status } : {}),
      updatedAt: new Date(),
    };
    this.categories[id] = updated;
    this.save();
    return updated;
  }

  deleteCategory(id: string): boolean {
    if (!this.categories[id]) return false;
    delete this.categories[id];
    this.save();
    return true;
  }
}

export const categoryStore = new CategoryStore();