import { spawn } from 'child_process';
import os from 'os';

export interface PythonSaftInput {
  startDate: string;
  endDate: string;
  company: any;
  documents: any[];
}

function pickPythonBinary(): string[] {
  // Try python3 first, then python
  return ['python3', 'python'];
}

function defaultScriptPath(): string {
  // Allow env overrides, else use the provided absolute path relative to cwd
  const envPath = process.env.AGT_PYTHON_SCRIPT_PATH || process.env.NEXT_PUBLIC_AGT_PYTHON_SCRIPT_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  
  // Use path relative to current working directory
  const path = require('path');
  return path.join(process.cwd(), 'data', 'agt_keys', 'agt python try code.py');
}

export async function generateSaftXmlWithPython(input: PythonSaftInput, opts?: { scriptPath?: string; timeoutMs?: number }): Promise<string> {
  const scriptPath = (opts?.scriptPath || defaultScriptPath()).trim();
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const payload = JSON.stringify(input);

  const bins = pickPythonBinary();

  let lastError: any;
  for (const bin of bins) {
    try {
      const xml = await new Promise<string>((resolve, reject) => {
        const child = spawn(bin, [scriptPath], {
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
          reject(new Error(`Python generator timed out after ${timeoutMs}ms`));
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
          if (code === 0 && stdout && stdout.includes('<AuditFile')) {
            resolve(stdout);
          } else {
            reject(new Error(`Python exited with code ${code}. Stderr: ${stderr || 'n/a'}`));
          }
        });

        try {
          child.stdin.write(payload);
          child.stdin.end();
        } catch (err) {
          // If stdin write fails, reject so we can try next bin or fallback
          // Some scripts might not read stdin; we still try but if it errors we bail
        }
      });

      return xml;
    } catch (err) {
      lastError = err;
      // try next bin or fallback to TS generator
    }
  }

  throw lastError || new Error('Failed to run Python SAF-T generator');
}