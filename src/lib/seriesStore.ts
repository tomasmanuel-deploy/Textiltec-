import fs from 'fs';
import { resolveDataPath } from './dataPaths';
import { getComputerCode } from '../services/MachineIdService';

export type SupportedDocumentType = 'factura' | 'orçamento' | 'nota_de_entrega' | 'recibo' | 'nota_de_credito' | 'nota_de_debito' | 'factura_recibo' | 'proforma' | string;

export interface SeriesConfig {
  code: string; // e.g., FT, OR, NE, RC
  name: string; // friendly name
  documentType: SupportedDocumentType;
  year: number; // year scope for numbering
  startNumber: number; // starting sequence number for the year
  currentNumber: number; // last issued number for the year
  active: boolean;
  isDefault?: boolean; // default series for this type/year
  device?: string | null; // Lock series to a specific device ID
  companyId?: string; // Company ID for multi-tenant isolation
  createdAt: string;
  updatedAt: string;
}

interface SeriesFileData {
  series: SeriesConfig[];
  lastUpdated: string;
}

export class SeriesStore {
  private series: SeriesConfig[] = [];
  private dataFilePath: string;

  constructor(customPath?: string) {
    this.dataFilePath = customPath ? resolveDataPath(customPath) : resolveDataPath('series.json');
    this.loadSeries();
  }

  private loadSeries(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        if (!raw.trim()) {
          this.series = [];
        } else {
          const json: SeriesFileData = JSON.parse(raw);
          this.series = Array.isArray(json.series) ? json.series : [];
        }
      } else {
        // Initialize empty series list on first launch
        this.series = [];
        this.saveSeries();
      }
    } catch (e) {
      console.error('Error loading series:', e);
      // Critical: Do not reset to empty on error, to prevent overwriting valid data
      throw new Error('Failed to load series.json: ' + (e as any).message);
    }

    // Seed default series if none present
    if (this.series.length === 0) {
      const year = new Date().getFullYear();
      this.seedDefaults(year);
      this.saveSeries();
    }
  }

  private saveSeries(): void {
    try {
      const data: SeriesFileData = {
        series: this.series,
        lastUpdated: new Date().toISOString(),
      };
      
      const tempPath = `${this.dataFilePath}.tmp`;
      const jsonContent = JSON.stringify(data, null, 2);
      
      // Atomic write
      fs.writeFileSync(tempPath, jsonContent);
      fs.renameSync(tempPath, this.dataFilePath);
      
    } catch (e) {
      console.error('Error saving series:', e);
    }
  }

  public ensureDefaults(year: number): void {
    const defaults: Array<{ documentType: SupportedDocumentType; code: string; name: string }> = [
      { documentType: 'factura', code: 'FT', name: 'Factura' },
      { documentType: 'orçamento', code: 'OR', name: 'Orçamento' },
      { documentType: 'nota_de_entrega', code: 'GR', name: 'Guia de Remessa' },
      { documentType: 'recibo', code: 'RC', name: 'Recibo' },
      { documentType: 'nota_de_credito', code: 'NC', name: 'Nota de Crédito' },
      { documentType: 'nota_de_debito', code: 'ND', name: 'Nota de Débito' },
      { documentType: 'factura_recibo', code: 'FR', name: 'Factura-Recibo' },
      { documentType: 'proforma', code: 'PP', name: 'Proforma' },
      { documentType: 'factura_generica', code: 'FG', name: 'Factura Genérica' },
      { documentType: 'factura_global', code: 'FGL', name: 'Factura Global' },
      { documentType: 'factura_adiantamento', code: 'FA', name: 'Factura de Adiantamento' },
      { documentType: 'factura_recibo_autofacturacao', code: 'AF', name: 'Autofacturação' },
      { documentType: 'recibo_estorno', code: 'RE', name: 'Recibo de Estorno' },
      { documentType: 'aviso_cobranca', code: 'AC', name: 'Aviso de Cobrança' },
      { documentType: 'aviso_cobranca_recibo', code: 'AR', name: 'Aviso de Cobrança/Recibo' },
      { documentType: 'outros_recibos', code: 'RG', name: 'Outros Recibos' },
    ];
    
    let changed = false;
    for (const { documentType, code, name } of defaults) {
      // Check if series exists for this code/year
      const existing = this.series.find(s => s.code === code && s.year === year);
      if (!existing) {
        this.series.push({
          code,
          name: `${code} · ${name}`,
          documentType,
          year,
          startNumber: 1,
          currentNumber: 0,
          active: true,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        changed = true;
      }
    }
    
    if (changed) {
      this.saveSeries();
    }
  }

  private seedDefaults(year: number): void {
    this.ensureDefaults(year);
  }

  getAllSeries(): SeriesConfig[] {
    // Sort by document type then code then year desc
    return [...this.series].sort((a, b) => (
      a.documentType.localeCompare(b.documentType) || a.code.localeCompare(b.code) || b.year - a.year
    ));
  }

  getActiveSeriesByType(documentType?: SupportedDocumentType): SeriesConfig[] {
    return this.series
      .filter(s => s.active && (!documentType || s.documentType === documentType))
      .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));
  }

  getSeries(code: string, year?: number): SeriesConfig | undefined {
    const y = year ?? new Date().getFullYear();
    return this.series.find(s => s.code === code && s.year === y);
  }

  createSeries(input: Omit<SeriesConfig, 'createdAt' | 'updatedAt'>): SeriesConfig {
    this.loadSeries(); // Reload state
    const exists = this.getSeries(input.code, input.year);
    if (exists) {
      throw new Error(`Série ${input.code}/${input.year} já existe`);
    }
    // If marked as default, clear existing defaults for that type/year
    if (input.isDefault) {
      this.series = this.series.map(s => {
        if (s.documentType === input.documentType && s.year === input.year) {
          return { ...s, isDefault: false };
        }
        return s;
      });
      // Ensure active when default
      input.active = true;
    }
    const cfg: SeriesConfig = {
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.series.push(cfg);
    this.saveSeries();
    return cfg;
  }

  updateSeries(code: string, year: number, patch: Partial<Omit<SeriesConfig, 'code' | 'year'>>): SeriesConfig {
    this.loadSeries(); // Reload state
    const idx = this.series.findIndex(s => s.code === code && s.year === year);
    if (idx === -1) {
      throw new Error(`Série ${code}/${year} não encontrada`);
    }
    const prev = this.series[idx];
    let next: SeriesConfig = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    // If explicitly setting as default, unset others for same type/year
    if (patch.isDefault) {
      next.active = true; // default must be active
      this.series = this.series.map(s => {
        if (s.documentType === prev.documentType && s.year === prev.year && s.code !== prev.code) {
          return { ...s, isDefault: false };
        }
        return s;
      });
    }
    // If deactivating a default series, clear default flag
    if (patch.active === false && prev.isDefault) {
      next.isDefault = false;
    }
    this.series[idx] = next;
    this.saveSeries();
    return next;
  }

  deleteSeries(code: string, year: number): boolean {
    this.loadSeries(); // Reload state
    const before = this.series.length;
    this.series = this.series.filter(s => !(s.code === code && s.year === year));
    const after = this.series.length;
    if (after !== before) {
      this.saveSeries();
      return true;
    }
    return false;
  }

  /**
   * Get the next sequence number without incrementing.
   */
  previewNextNumber(code: string, year?: number): number {
    const s = this.getSeries(code, year);
    if (!s) {
      throw new Error(`Série ${code}/${year ?? new Date().getFullYear()} não encontrada`);
    }
    const base = Math.max(0, s.currentNumber);
    return base + 1;
  }

  /**
   * Assign next number (increments currentNumber and returns assigned value).
   */
  assignNextNumber(code: string, year?: number): number {
    this.loadSeries(); // Reload state
    const y = year ?? new Date().getFullYear();
    const idx = this.series.findIndex(s => s.code === code && s.year === y);
    if (idx === -1) {
      throw new Error(`Série ${code}/${y} não encontrada`);
    }
    const s = this.series[idx];

    // Check device lock
    const currentDevice = getComputerCode();
    if (s.device && s.device !== currentDevice) {
      throw new Error(`Série ${code}/${y} está bloqueada para outro dispositivo (${s.device}). Este dispositivo: ${currentDevice}`);
    }

    // Auto-lock on first use if not set
    let deviceUpdate = {};
    if (!s.device) {
      deviceUpdate = { device: currentDevice };
    }

    const next = Math.max(s.currentNumber, s.startNumber - 1) + 1;
    this.series[idx] = { ...s, ...deviceUpdate, currentNumber: next, updatedAt: new Date().toISOString() };
    this.saveSeries();
    return next;
  }

  /** Reset currentNumber to (startNumber - 1) */
  resetSeries(code: string, year?: number): SeriesConfig {
    this.loadSeries(); // Reload state
    const y = year ?? new Date().toISOString();
    const yy = typeof y === 'string' ? new Date().getFullYear() : (y as number);
    const idx = this.series.findIndex(s => s.code === code && s.year === yy);
    if (idx === -1) {
      throw new Error(`Série ${code}/${yy} não encontrada`);
    }
    const s = this.series[idx];
    const next = { ...s, currentNumber: Math.max(0, s.startNumber - 1), updatedAt: new Date().toISOString() };
    this.series[idx] = next;
    this.saveSeries();
    return next;
  }

  /** Get default series for a given type/year */
  getDefaultSeries(documentType: SupportedDocumentType, year?: number): SeriesConfig | undefined {
    const y = year ?? new Date().getFullYear();
    return this.series.find(s => s.active && s.documentType === documentType && s.year === y && s.isDefault);
  }

  /** Set a series as default for its type/year */
  setDefault(code: string, year?: number): SeriesConfig {
    this.loadSeries(); // Reload state
    const y = year ?? new Date().getFullYear();
    const idx = this.series.findIndex(s => s.code === code && s.year === y);
    if (idx === -1) throw new Error(`Série ${code}/${y} não encontrada`);
    const target = this.series[idx];
    // Unset others
    this.series = this.series.map(s => {
      if (s.documentType === target.documentType && s.year === target.year) {
        return { ...s, isDefault: s.code === target.code ? true : false, active: s.code === target.code ? true : s.active };
      }
      return s;
    });
    this.saveSeries();
    return this.series[idx];
  }
}

export const seriesStore = new SeriesStore();