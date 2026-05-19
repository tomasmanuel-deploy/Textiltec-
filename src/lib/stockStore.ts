import fs from 'fs';
import path from 'path';
import { resolveDataPath } from './dataPaths';

export interface StockRecord {
  warehouseId: string;
  productId: string;
  quantity: number;
}

class StockStore {
  private stocks: { [key: string]: number } = {}; // key = `${warehouseId}:${productId}`
  private dataFilePath: string;

  constructor() {
    this.dataFilePath = resolveDataPath('stocks.json');
    this.loadStocks();
  }

  private key(warehouseId: string, productId: string) {
    return `${warehouseId}:${productId}`;
  }

  private loadStocks() {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'));
        this.stocks = data.stocks || {};
      } else {
        // Initialize empty stocks
        this.stocks = {};
        this.saveStocks();
      }
    } catch (error) {
      console.error('Error loading stocks:', error);
      this.stocks = {};
    }
  }

  private saveStocks() {
    try {
      const dirPath = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(this.dataFilePath, JSON.stringify({ stocks: this.stocks }, null, 2));
    } catch (error) {
      console.error('Error saving stocks:', error);
    }
  }

  getAll(): StockRecord[] {
    return Object.entries(this.stocks).map(([k, qty]) => {
      const [warehouseId, productId] = k.split(':');
      return { warehouseId, productId, quantity: qty };
    });
  }

  getByWarehouse(warehouseId: string): StockRecord[] {
    return this.getAll().filter(r => r.warehouseId === warehouseId);
  }

  getQuantity(warehouseId: string, productId: string): number {
    return this.stocks[this.key(warehouseId, productId)] || 0;
  }

  setQuantity(warehouseId: string, productId: string, quantity: number) {
    if (quantity < 0) quantity = 0;
    this.stocks[this.key(warehouseId, productId)] = quantity;
    this.saveStocks();
  }

  adjust(warehouseId: string, productId: string, delta: number) {
    const current = this.getQuantity(warehouseId, productId);
    const next = current + delta;
    if (next < 0) {
      throw new Error('Insufficient stock');
    }
    this.setQuantity(warehouseId, productId, next);
  }

  applyTransfer(transfer: { originWarehouseId: string; destinationWarehouseId: string; lines: Array<{ productId: string; quantity: number }> }) {
    // Validate origin stock first (skip services at API layer; here assume all lines are stock-relevant)
    for (const line of transfer.lines) {
      const originQty = this.getQuantity(transfer.originWarehouseId, line.productId);
      if (originQty < line.quantity) {
        throw new Error(`Insufficient stock in origin for product ${line.productId}`);
      }
    }
    // Apply movements
    for (const line of transfer.lines) {
      this.adjust(transfer.originWarehouseId, line.productId, -line.quantity);
      this.adjust(transfer.destinationWarehouseId, line.productId, +line.quantity);
    }
  }

  revertTransfer(transfer: { originWarehouseId: string; destinationWarehouseId: string; lines: Array<{ productId: string; quantity: number }> }) {
    // Validate destination stock before revert
    for (const line of transfer.lines) {
      const destQty = this.getQuantity(transfer.destinationWarehouseId, line.productId);
      if (destQty < line.quantity) {
        throw new Error(`Insufficient stock in destination to revert for product ${line.productId}`);
      }
    }
    // Reverse movements
    for (const line of transfer.lines) {
      this.adjust(transfer.destinationWarehouseId, line.productId, -line.quantity);
      this.adjust(transfer.originWarehouseId, line.productId, +line.quantity);
    }
  }
}

export const stockStore = new StockStore();