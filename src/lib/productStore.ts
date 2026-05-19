import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface Product {
  id: string;
  name: string;
  description?: string;
  code: string; // Código do produto
  category: string;
  price: number;
  unit: string; // unidade (kg, litro, peça, etc.)
  stock?: number;
  minStock?: number;
  status: 'active' | 'inactive';
  taxRate?: number; // Taxa de imposto (%)
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Flag para indicar se o produto é um serviço
  isService?: boolean;
}

// Initial mock products
const initialMockProducts: { [key: string]: Product } = {
  '1': {
    id: '1',
    name: 'Produto Exemplo A',
    description: 'Descrição do produto exemplo A',
    code: 'PROD001',
    category: 'Categoria A',
    price: 1500.00,
    unit: 'peça',
    stock: 100,
    minStock: 10,
    status: 'active',
    taxRate: 14,
    createdAt: new Date('2023-01-15'),
    updatedAt: new Date('2023-01-15'),
    isService: false,
  },
  '2': {
    id: '2',
    name: 'Produto Exemplo B',
    description: 'Descrição do produto exemplo B',
    code: 'PROD002',
    category: 'Categoria B',
    price: 2500.00,
    unit: 'kg',
    stock: 50,
    minStock: 5,
    status: 'active',
    taxRate: 14,
    createdAt: new Date('2023-02-10'),
    updatedAt: new Date('2023-02-10'),
    isService: false,
  },
  '3': {
    id: '3',
    name: 'Produto Exemplo C',
    description: 'Descrição do produto exemplo C',
    code: 'PROD003',
    category: 'Categoria A',
    price: 750.00,
    unit: 'litro',
    stock: 200,
    minStock: 20,
    status: 'active',
    taxRate: 14,
    createdAt: new Date('2023-03-05'),
    updatedAt: new Date('2023-03-05'),
    isService: false,
  }
};

class ProductStore {
  private products: { [key: string]: Product } = {};
  private nextId: number = 1;
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('products.json');
    this.loadProducts();
  }

  // Load products from file
  private loadProducts(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = fs.readFileSync(this.dataFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Convert date strings back to Date objects
        Object.keys(parsedData.products || {}).forEach(key => {
          const product = parsedData.products[key];
          product.createdAt = new Date(product.createdAt);
          product.updatedAt = new Date(product.updatedAt);
          // Garantir campo isService para dados antigos
          if (product.isService === undefined) product.isService = false;
        });
        
        this.products = parsedData.products || {};
        this.nextId = parsedData.nextId || 1;
      } else {
        // Initialize with empty data if file doesn't exist
        this.products = {};
        this.nextId = 1;
        this.saveProducts();
      }
    } catch (error) {
      console.error('Error loading products:', error);
      // Fallback to empty data
      this.products = {};
      this.nextId = 1;
    }
  }

  // Save products to file
  private saveProducts(): void {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {
        products: this.products,
        nextId: this.nextId
      };
      
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving products:', error);
    }
  }

  // Get all products (sorted by most recent first)
  getAllProducts(): Product[] {
    return Object.values(this.products).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  // Get product by ID
  getProductById(id: string): Product | null {
    return this.products[id] || null;
  }

  // Create new product
  createProduct(productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const id = this.nextId.toString();
    const now = new Date();
    
    const product: Product = {
      ...productData,
      id,
      createdAt: now,
      updatedAt: now,
      isService: productData.isService ?? false,
    };
    
    this.products[id] = product;
    this.nextId++;
    this.saveProducts();
    
    return product;
  }

  // Update product
  updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'createdAt'>>): Product | null {
    const product = this.products[id];
    if (!product) return null;
    
    const updatedProduct = {
      ...product,
      ...updates,
      updatedAt: new Date(),
      isService: updates.isService ?? product.isService ?? false,
    };
    
    this.products[id] = updatedProduct;
    this.saveProducts();
    
    return updatedProduct;
  }

  // Delete product
  deleteProduct(id: string): boolean {
    if (this.products[id]) {
      delete this.products[id];
      this.saveProducts();
      return true;
    }
    return false;
  }

  // Check if product code exists (excluding specific product ID)
  codeExists(code: string, excludeId?: string): boolean {
    return Object.values(this.products).some(product => 
      product.code === code && product.id !== excludeId
    );
  }

  // Filter products
  filterProducts(options: {
    status?: 'active' | 'inactive';
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { products: Product[]; total: number } {
    let arr = this.getAllProducts();

    if (options.status) {
      arr = arr.filter(p => p.status === options.status);
    }
    if (options.category) {
      arr = arr.filter(p => p.category === options.category);
    }
    if (options.search) {
      const s = options.search.toLowerCase();
      arr = arr.filter(p => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s));
    }

    const total = arr.length;
    const start = Math.max(0, options.offset || 0);
    const end = Math.min(total, start + (options.limit || 10));

    return { products: arr.slice(start, end), total };
  }

  getCategories(): string[] {
    const set = new Set<string>();
    Object.values(this.products).forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set);
  }
}

export const productStore = new ProductStore();