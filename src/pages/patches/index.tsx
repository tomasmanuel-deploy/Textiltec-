import { useState } from 'react';
import Layout from '@/components/Layout';
import Button from '@/components/ui/Button';

type ChangedFile = { file: string; changes: number };

type PatchResult = {
 id: string;
 description: string;
 changedFiles: ChangedFile[];
 applied: boolean;
 skipped?: boolean;
 error?: string;
};

type PatchSummary = { applied: number; skipped: number; errors: number };

type PatchRunResponse = {
 dryRun: boolean;
 force?: boolean;
 summary: PatchSummary;
 results: PatchResult[];
};

export default function PatchesPage() {
 const [dryRun, setDryRun] = useState(false);
 const [force, setForce] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [result, setResult] = useState<PatchRunResponse | null>(null);
 const [token, setToken] = useState<string>('');

 const runPatches = async () => {
 setLoading(true); setError(null); setResult(null);
 try {
 const params = new URLSearchParams();
 if (dryRun) params.set('dry', '1');
 if (force) params.set('force', '1');
 const url = `/api/patches/run${params.toString() ? `?${params.toString()}` : ''}`;
 const headers: Record<string, string> = {};
 if (token) headers['Authorization'] = `Bearer ${token}`;
 const res = await fetch(url, { headers });
 if (!res.ok) throw new Error(`Request failed: ${res.status}`);
 const json: PatchRunResponse = await res.json();
 setResult(json);
 } catch (e: any) {
 setError(e?.message || 'Failed to run patches');
 } finally {
 setLoading(false);
 }
 };

 const SummaryView = ({ summary }: { summary: PatchSummary }) => (
 <div className="grid grid-cols-3 gap-4 mt-4">
 <div className=" bg-green-50 dark:bg-green-900/30 p-4 text-green-700 dark:text-green-200">
 <div className="text-sm">Applied</div>
 <div className="text-2xl font-semibold">{summary.applied}</div>
 </div>
 <div className=" bg-yellow-50 dark:bg-yellow-900/30 p-4 text-yellow-700 dark:text-yellow-200">
 <div className="text-sm">Skipped</div>
 <div className="text-2xl font-semibold">{summary.skipped}</div>
 </div>
 <div className=" bg-red-50 dark:bg-red-900/30 p-4 text-red-700 dark:text-red-200">
 <div className="text-sm">Errors</div>
 <div className="text-2xl font-semibold">{summary.errors}</div>
 </div>
 </div>
 );

 const ResultsTable = ({ results }: { results: PatchResult[] }) => (
 <div className="mt-6 overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
 <thead className="bg-gray-50 dark:bg-gray-800">
 <tr>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Patch</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Applied</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Skipped</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Error</th>
 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Changed Files</th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
 {results.map((r) => (
 <tr key={r.id}>
 <td className="px-4 py-2 text-sm font-mono">{r.id}</td>
 <td className="px-4 py-2 text-sm">{r.description}</td>
 <td className="px-4 py-2 text-sm">{r.applied ? 'Yes' : 'No'}</td>
 <td className="px-4 py-2 text-sm">{r.skipped ? 'Yes' : 'No'}</td>
 <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{r.error || ''}</td>
 <td className="px-4 py-2 text-sm">
 {r.changedFiles && r.changedFiles.length > 0 ? (
 <ul className="list-disc ml-5">
 {r.changedFiles.map((cf, i) => (
 <li key={`${r.id}-${i}`}>{cf.file} · {cf.changes} changes</li>
 ))}
 </ul>
 ) : (
 <span className="text-gray-400">—</span>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );

 return (
 <Layout>
 <div className="max-w-6xl mx-auto px-4 py-6">
 <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Patching</h1>
 <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Run built-in data patches and review the results.</p>

 <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="col-span-1 bg-white dark:bg-gray-800 p-4 shadow">
 <div className="flex items-center justify-between">
 <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
 <input type="checkbox" className="h-4 w-4" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
 <span>Dry run</span>
 </label>
 <span className="text-xs text-gray-500">Do not write history</span>
 </div>
 <div className="mt-3 flex items-center justify-between">
 <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
 <input type="checkbox" className="h-4 w-4" checked={force} onChange={(e) => setForce(e.target.checked)} />
 <span>Force apply</span>
 </label>
 <span className="text-xs text-gray-500">Ignore applied history</span>
 </div>
 <div className="mt-3">
 <label className="block text-sm text-gray-700 dark:text-gray-200 mb-1">Token (Bearer)</label>
 <input
 type="password"
 className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
 placeholder="Optional; required on VPS when not dry-run"
 value={token}
 onChange={(e) => setToken(e.target.value)}
 />
 </div>
 <div className="mt-4">
 <Button onClick={runPatches} disabled={loading}>
 {loading ? 'Running…' : 'Run patches'}
 </Button>
 </div>
 {error && (
 <div className="mt-3 rounded bg-red-50 dark:bg-red-900/30 p-2 text-red-700 dark:text-red-200 text-sm">{error}</div>
 )}
 </div>

 <div className="col-span-2 bg-white dark:bg-gray-800 p-4 shadow">
 {result ? (
 <div>
 <div className="text-sm text-gray-600 dark:text-gray-300">Mode: {result.dryRun ? 'Dry run' : 'Apply'}{result.force ? ' · Force' : ''}</div>
 <SummaryView summary={result.summary} />
 <ResultsTable results={result.results} />
 </div>
 ) : (
 <div className="text-sm text-gray-500 dark:text-gray-400">No results yet. Click "Run patches".</div>
 )}
 </div>
 </div>
 </div>
 </Layout>
 );
}
