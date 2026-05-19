import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useConfirm, usePrompt } from '@/context/DialogContext';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; unit?: string; isService?: boolean; }
interface Transfer { id: string; originWarehouseId: string; destinationWarehouseId: string; status: 'draft' | 'posted'; lines: Array<{ productId: string; quantity: number; unit?: string }>; }

export default function TransfersPage() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ originWarehouseId: '', destinationWarehouseId: '', lines: [{ productId: '', quantity: 1, unit: 'un' }], status: 'draft' as 'draft' | 'posted', notes: '' });
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted'>('all');

  const fetchWarehouses = async () => {
    const res = await fetch('/api/warehouses');
    const data = await res.json();
    setWarehouses((data.warehouses || []).map((w: any) => ({ id: w.id, name: w.name })));
  };

  const fetchProducts = async () => {
    const res = await fetch('/api/products?status=active&limit=100');
    const data = await res.json();
    setProducts((data.products || []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit, isService: !!p.isService })));
  };

  const fetchTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/transfers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar transferências');
      setTransfers(data.transfers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
    fetchTransfers();
  }, []);

  const updateLine = (idx: number, patch: Partial<{ productId: string; quantity: number; unit?: string }>) => {
    setForm(f => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, ...patch } : l) }));
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { productId: '', quantity: 1, unit: 'un' }] }));
  const removeLine = (idx: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar transferência');
      setForm({ originWarehouseId: '', destinationWarehouseId: '', lines: [{ productId: '', quantity: 1, unit: 'un' }], status: 'draft', notes: '' });
      await fetchTransfers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar');
    }
  };

  const toggleStatus = async (t: Transfer) => {
    setError(null);
    try {
      const res = await fetch(`/api/transfers/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: t.status === 'draft' ? 'posted' : 'draft' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar estado');
      await fetchTransfers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar');
    }
  };

  const deleteTransfer = async (t: Transfer) => {
    if (!await confirm('Remover transferência?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/transfers/${t.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover');
      await fetchTransfers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover');
    }
  };

  return (
    <Layout>
      <Head>
        <title>Transferências de Stock</title>
      </Head>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Transferências de Stock</h1>
            <p className="text-gray-600">Movimentos entre armazéns com documentos de transferência.</p>
          </div>
          <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 border rounded p-4 bg-gray-50">
            <h2 className="font-medium mb-2">Nova Transferência</h2>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Origem</label>
                <select className="w-full border rounded px-3 py-2" value={form.originWarehouseId} onChange={e => setForm({ ...form, originWarehouseId: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Destino</label>
                <select className="w-full border rounded px-3 py-2" value={form.destinationWarehouseId} onChange={e => setForm({ ...form, destinationWarehouseId: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Linhas</label>
                <div className="space-y-2">
                  {form.lines.map((line, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select className="border rounded px-2 py-2 flex-1" value={line.productId} onChange={e => updateLine(idx, { productId: e.target.value, unit: products.find(p => p.id === e.target.value)?.unit })} required>
                        <option value="">Produto...</option>
                        {products.filter(p => !p.isService).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                      <input type="number" min={1} className="border rounded px-2 py-2 w-24" value={line.quantity} onChange={e => updateLine(idx, { quantity: parseInt(e.target.value || '1', 10) })} required />
                      <input placeholder="un" className="border rounded px-2 py-2 w-20" value={line.unit || ''} onChange={e => updateLine(idx, { unit: e.target.value })} />
                      <button type="button" onClick={() => removeLine(idx)} className="text-red-600">Remover</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addLine} className="text-blue-600 hover:underline mt-1">Adicionar linha</button>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Estado</label>
                <select className="w-full border rounded px-3 py-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'draft' | 'posted' })}>
                  <option value="draft">Rascunho</option>
                  <option value="posted">Lançada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Notas</label>
                <textarea className="w-full border rounded px-3 py-2" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Guardar</button>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="flex gap-2 mb-3">
              <select className="border rounded px-3 py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'draft' | 'posted')}>
                <option value="all">Todas</option>
                <option value="draft">Rascunhos</option>
                <option value="posted">Lançadas</option>
              </select>
              <button onClick={fetchTransfers} className="border px-3 py-2 rounded">Filtrar</button>
            </div>

            <div className="border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">Origem</th>
                    <th className="px-4 py-2">Destino</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Linhas</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
                  ) : transfers.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nenhuma transferência encontrada</td></tr>
                  ) : (
                    transfers.map(t => (
                      <tr key={t.id} className="border-t">
                        <td className="px-4 py-2">{warehouses.find(w => w.id === t.originWarehouseId)?.name || t.originWarehouseId}</td>
                        <td className="px-4 py-2">{warehouses.find(w => w.id === t.destinationWarehouseId)?.name || t.destinationWarehouseId}</td>
                        <td className="px-4 py-2">
                          <span className={t.status === 'posted' ? 'text-green-700' : 'text-gray-700'}>{t.status === 'posted' ? 'Lançada' : 'Rascunho'}</span>
                        </td>
                        <td className="px-4 py-2">{t.lines.length} linha(s)</td>
                        <td className="px-4 py-2 flex gap-2">
                          <button onClick={() => toggleStatus(t)} className="text-blue-600 hover:underline">Alternar estado</button>
                          <button onClick={() => deleteTransfer(t)} className="text-red-600 hover:underline">Remover</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}