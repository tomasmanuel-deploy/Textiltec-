import fs from 'fs';
import path from 'path';

// Resolve a writable data directory. In Electron packaged builds,
// set process.env.DATA_DIR from the main process to app.getPath('userData')/data
export function getDataDir(): string {
  const ensure = (dir: string) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Ignore directory creation errors
    }
    return dir;
  };

  if (process.env.DATA_DIR) {
    return ensure(path.resolve(process.env.DATA_DIR));
  }

  // Extra safety: when running under Electron, prefer userData/data even if env is missing
  try {
    // process.versions.electron is defined under Electron runtime
    if ((process.versions as any)?.electron) {
      // Lazy require to avoid bundling electron in web builds
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      if (app && typeof app.getPath === 'function') {
        return ensure(path.join(app.getPath('userData'), 'data'));
      }
    }
  } catch {
    // Ignore errors and fall back to cwd
  }

  // Fallback for non-Electron/dev environments
  return ensure(path.join(process.cwd(), 'data'));
}

export function resolveDataPath(...segments: string[]): string {
  return path.join(getDataDir(), ...segments);
}

export const companyJsonPath = (): string => resolveDataPath('company.json');
export const companiesJsonPath = (): string => resolveDataPath('companies.json');
export const systemJsonPath = (): string => resolveDataPath('system.json');
// Licensing
export const licenseJsonPath = (): string => resolveDataPath('license.json');
// Registry of generated PDFs / print counts
export const printsJsonPath = (): string => resolveDataPath('prints.json');