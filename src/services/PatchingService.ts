import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '@/lib/dataPaths';

export type PatchRunContext = {
  dryRun?: boolean;
  force?: boolean;
  log?: (msg: string) => void;
};

export type PatchResult = {
  id: string;
  description: string;
  changedFiles: Array<{ file: string; changes: number }>;
  applied: boolean;
  skipped?: boolean;
  error?: string;
};

export type Patch = {
  id: string;
  description: string;
  run: (ctx: PatchRunContext) => Promise<PatchResult> | PatchResult;
};

interface PatchState {
  applied: Array<{ id: string; appliedAt: string; info?: any }>;
}

function readJsonSafe<T = any>(p: string, fallback: T): T {
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      return raw ? JSON.parse(raw) : fallback;
    }
  } catch (e) {
    // ignore
  }
  return fallback;
}

function writeJsonSafe(p: string, data: any) {
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write JSON:', p, e);
  }
}

export class PatchingService {
  private statePath: string;

  constructor() {
    this.statePath = resolveDataPath('patches.json');
    // initialize state file if missing
    if (!fs.existsSync(this.statePath)) {
      writeJsonSafe(this.statePath, { applied: [] } as PatchState);
    }
  }

  private getState(): PatchState {
    return readJsonSafe<PatchState>(this.statePath, { applied: [] });
  }

  private isApplied(id: string): boolean {
    const st = this.getState();
    return st.applied.some((a) => a.id === id);
  }

  private markApplied(id: string, info?: any) {
    const st = this.getState();
    st.applied.push({ id, appliedAt: new Date().toISOString(), info });
    writeJsonSafe(this.statePath, st);
  }

  async applyAll(patches: Patch[], ctx: PatchRunContext = {}): Promise<{ results: PatchResult[]; summary: { applied: number; skipped: number; errors: number } }> {
    const results: PatchResult[] = [];
    let applied = 0, skipped = 0, errors = 0;

    for (const p of patches) {
      try {
        if (!ctx.force && this.isApplied(p.id)) {
          const r: PatchResult = { id: p.id, description: p.description, changedFiles: [], applied: false, skipped: true };
          results.push(r);
          skipped++;
          ctx.log?.(`Skipped patch already applied: ${p.id}`);
          continue;
        }
        const res = await p.run(ctx);
        if (!ctx.dryRun) this.markApplied(p.id, { changedFiles: res.changedFiles });
        results.push({ ...res, applied: !ctx.dryRun });
        applied++;
        ctx.log?.(`Applied patch: ${p.id}`);
      } catch (e: any) {
        const r: PatchResult = { id: p.id, description: p.description, changedFiles: [], applied: false, error: e?.message || String(e) };
        results.push(r);
        errors++;
        console.error(`Error applying patch ${p.id}:`, e);
      }
    }

    return { results, summary: { applied, skipped, errors } };
  }
}

// Helpers for built-in patches
function updateDocuments(mutator: (doc: any) => boolean): { file: string; changes: number } {
  const docPath = resolveDataPath('documents.json');
  const data = readJsonSafe<any>(docPath, { documents: {}, nextId: 1 });
  let changes = 0;
  const docs = data.documents || {};
  for (const id of Object.keys(docs)) {
    const d = docs[id];
    const changed = mutator(d);
    if (changed) changes++;
  }
  writeJsonSafe(docPath, data);
  return { file: docPath, changes };
}

function normalizePaymentMethod(value: any): string {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'bank_transfer';
  const map: Record<string, string> = {
    'transferência bancária': 'bank_transfer',
    'transferencia bancaria': 'bank_transfer',
    'transferencia': 'bank_transfer',
    'bank transfer': 'bank_transfer',
    'bancária': 'bank_transfer',
    'dinheiro': 'cash',
    'cash': 'cash',
    'cartão': 'card',
    'cartao': 'card',
    'card': 'card',
    'dinheiro móvel': 'mobile_money',
    'dinheiro movel': 'mobile_money',
    'mobile money': 'mobile_money',
    'm-pesa': 'mobile_money',
  };
  return map[v] || (['cash','bank_transfer','card','mobile_money','other'].includes(v) ? v : 'other');
}

export const builtInPatches: Patch[] = [
  {
    id: '2025-10-19-normalize-payment-methods',
    description: 'Normalize document.payment.method to standard codes and default status',
    run: async (ctx: PatchRunContext) => {
      const changed = updateDocuments((d: any) => {
        let didChange = false;
        if (d && d.payment) {
          const before = d.payment.method;
          const after = normalizePaymentMethod(before);
          if (before !== after) { d.payment.method = after; didChange = true; }
          const st = String(d.payment.status || '').trim().toLowerCase();
          if (!['pending','partial','paid'].includes(st)) { d.payment.status = 'pending'; didChange = true; }
        }
        return didChange;
      });
      return { id: '2025-10-19-normalize-payment-methods', description: 'Normalize document.payment.method to standard codes and default status', changedFiles: [changed], applied: true };
    }
  },
  {
    id: '2025-10-19-add-totals-currency',
    description: 'Ensure document.totals.currency is present and set to AOA',
    run: async (ctx: PatchRunContext) => {
      const changed = updateDocuments((d: any) => {
        let didChange = false;
        if (d && d.totals) {
          const cur = (d.totals as any).currency;
          if (!cur) { (d.totals as any).currency = 'AOA'; didChange = true; }
        }
        return didChange;
      });
      return { id: '2025-10-19-add-totals-currency', description: 'Ensure document.totals.currency is present and set to AOA', changedFiles: [changed], applied: true };
    }
  }
];

export default PatchingService;