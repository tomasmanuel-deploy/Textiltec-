import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useConfirm, usePrompt } from '@/context/DialogContext';

type SupportedDocumentType = 'factura' | 'orçamento' | 'nota_de_entrega' | 'recibo' | string;
interface SeriesConfig {
  code: string;
  name: string;
  documentType: SupportedDocumentType;
  year: number;
  startNumber: number;
  currentNumber: number;
  active: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SeriesPage() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const router = useRouter();
  const [series, setSeries] = useState<SeriesConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    code: string;
    name: string;
    documentType: SupportedDocumentType;
    year: number;
    startNumber: number;
    active: boolean;
    isDefault: boolean;
  }>({
    code: '',
    name: '',
    documentType: 'factura',
    year: new Date().getFullYear(),
    startNumber: 1,
    active: true,
    isDefault: false,
  });

  const nextPreview = (s: SeriesConfig) => Math.max(0, s.currentNumber) + 1;
  const types = useMemo(() => [
    { value: 'factura', label: 'Factura (FT)' },
    { value: 'orçamento', label: 'Orçamento (OR)' },
    { value: 'nota_de_entrega', label: 'Guia de Remessa (GR)' },
    { value: 'recibo', label: 'Recibo (RC)' },
  ], []);

  const fetchSeries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/series');
      const data = await res.json();
      const list: SeriesConfig[] = data.series || [];
      // Ordena padrões primeiro
      setSeries(list.sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault)));
    } catch (e) {
      console.error('Erro ao carregar séries:', e);
      setError('Falha ao carregar séries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, []);

  const resetForm = () => setForm({ code: '', name: '', documentType: 'factura', year: new Date().getFullYear(), startNumber: 1, active: true, isDefault: false });

  const createSeries = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = { ...form, currentNumber: 0 };
      const res = await fetch('/api/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao criar série');
      resetForm();
      await fetchSeries();
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar série');
    } finally {
      setLoading(false);
    }
  };

  const updateSeries = async (code: string, year: number, patch: Partial<SeriesConfig>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${encodeURIComponent(code)}?year=${year}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar série');
      await fetchSeries();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar série');
    } finally {
      setLoading(false);
    }
  };

  const deleteSeries = async (code: string, year: number) => {
    if (!await confirm(`Apagar série ${code}/${year}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/series/${encodeURIComponent(code)}?year=${year}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao apagar série');
      await fetchSeries();
    } catch (e: any) {
      setError(e?.message || 'Erro ao apagar série');
    } finally {
      setLoading(false);
    }
  };

  const resetSeries = async (code: string, year: number) => {
    if (!await confirm(`Resetar numeração da série ${code}/${year} para início?`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/series/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, year }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao resetar série');
      await fetchSeries();
    } catch (e: any) {
      setError(e?.message || 'Erro ao resetar série');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Séries de Documentos">
      <Head>
        <title>Séries de Documentos</title>
      </Head>
      <div className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold">Séries de Documentos</h1>
          <button onClick={() => router.back()} className="inline-flex items-center gap-2 px-3 py-2 border rounded hover:bg-gray-50">
            <span>←</span>
            <span>Voltar</span>
          </button>
        </div>
        <p className="text-gray-600 mb-6">Defina códigos, tipos e numeração anual conforme AGT.</p>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {/* Criar nova série */}
        <div className="border rounded p-4 bg-white mb-6">
          <h2 className="text-lg font-semibold mb-3">Nova Série</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600">Código</label>
              <input className="mt-1 w-full border rounded p-2" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="FT, OR, NE, RC" />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Nome</label>
              <input className="mt-1 w-full border rounded p-2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Factura" />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Tipo</label>
              <select className="mt-1 w-full border rounded p-2" value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value }))}>
                {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600">Ano</label>
              <input type="number" className="mt-1 w-full border rounded p-2" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Início</label>
              <input type="number" className="mt-1 w-full border rounded p-2" value={form.startNumber} onChange={e => setForm(f => ({ ...f, startNumber: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2">
              <input id="active" type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="active" className="text-xs text-gray-600">Ativa</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="isDefault" type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
              <label htmlFor="isDefault" className="text-xs text-gray-600">Definir como padrão</label>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="px-3 py-2 border rounded bg-gray-50" onClick={resetForm} disabled={loading}>Limpar</button>
            <button className="px-3 py-2 border rounded bg-blue-600 text-white" onClick={createSeries} disabled={loading || !form.code || !form.documentType}>Criar Série</button>
          </div>
        </div>

        {/* Lista de séries */}
        <div className="border rounded bg-white">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-medium">Séries configuradas</h2>
            <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
          </div>
          <div className="p-4 overflow-x-auto">
            {loading ? (
              <div className="text-gray-500 text-sm">A carregar…</div>
            ) : series.length === 0 ? (
              <div className="text-gray-500 text-sm">Sem séries configuradas.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Nome</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Ano</th>
                    <th className="px-2 py-2">Início</th>
                    <th className="px-2 py-2">Atual</th>
                    <th className="px-2 py-2">Próximo</th>
                    <th className="px-2 py-2">Ativa</th>
                    <th className="px-2 py-2">Padrão</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map(s => (
                    <tr key={`${s.code}-${s.year}`} className="border-t">
                      <td className="px-2 py-2 font-medium flex items-center gap-2">
                        <span>{s.code}</span>
                        {s.isDefault ? <span title="Série padrão" className="text-yellow-500">★</span> : <span title="Não padrão" className="text-gray-300">☆</span>}
                      </td>
                      <td className="px-2 py-2">
                        <input className="border rounded p-1 w-40" defaultValue={s.name} onBlur={e => updateSeries(s.code, s.year, { name: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <select className="border rounded p-1" defaultValue={s.documentType} onChange={e => updateSeries(s.code, s.year, { documentType: e.target.value })}>
                          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">{s.year}</td>
                      <td className="px-2 py-2">
                        <input type="number" className="border rounded p-1 w-24" defaultValue={s.startNumber} onBlur={e => updateSeries(s.code, s.year, { startNumber: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" className="border rounded p-1 w-24" defaultValue={s.currentNumber} onBlur={e => updateSeries(s.code, s.year, { currentNumber: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2 text-gray-700">{nextPreview(s)}</td>
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={s.active} onChange={e => updateSeries(s.code, s.year, { active: e.target.checked })} />
                      </td>
                      <td className="px-2 py-2">
                        {s.isDefault ? (
                          <span className="px-2 py-1 rounded bg-green-50 text-green-700 text-xs">Padrão</span>
                        ) : (
                          <button className="px-2 py-1 border rounded text-xs" onClick={() => updateSeries(s.code, s.year, { isDefault: true })}>Definir padrão</button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="px-2 py-1 border rounded" onClick={() => resetSeries(s.code, s.year)}>Reset</button>
                          <button className="px-2 py-1 border rounded text-red-600" onClick={() => deleteSeries(s.code, s.year)}>Apagar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}