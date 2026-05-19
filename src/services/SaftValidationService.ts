import { spawn } from 'child_process';
import path from 'path';

export async function validateSaftXml(xml: string, opts?: { xsdPath?: string; timeoutMs?: number }): Promise<{ valid: boolean; errors?: string[] }>{
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const xsdPath = opts?.xsdPath ?? process.env.SAFT_XSD_PATH ?? process.env.NEXT_PUBLIC_SAFT_XSD_PATH ?? path.resolve(process.cwd(), 'src/lib/schemas/SAFTAO1.01_01.xsd');
  const bins = ['python3', 'python'];

  let lastError: any;
  for (const bin of bins) {
    try {
      const result = await new Promise<{ valid: boolean; errors?: string[] }>((resolve, reject) => {
        const child = spawn(bin, [path.resolve(process.cwd(), 'scripts/validate_saft.py'), xsdPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
          shell: false,
        });

        let stdout = '';
        let stderr = '';
        let done = false;
        const to = setTimeout(() => {
          if (done) return;
          done = true;
          try { child.kill(); } catch {}
          reject(new Error(`SAF-T validation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err) => {
          if (done) return;
          done = true;
          clearTimeout(to);
          reject(err);
        });

        child.on('close', (code) => {
          if (done) return;
          done = true;
          clearTimeout(to);
          if (code === 0 && stdout.includes('OK')) {
            resolve({ valid: true });
          } else {
            const errors = stdout
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0 && s !== 'OK');
            resolve({ valid: false, errors: errors.length ? errors : [stderr || 'unknown error'] });
          }
        });

        try {
          child.stdin.write(xml);
          child.stdin.end();
        } catch (err) {
          // If stdin write fails, try next python bin
        }
      });

      return result;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to run SAF-T validator');
}