import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';

interface Warehouse { id: string; name: string; code: string; address?: string; status: 'active' | 'inactive'; }
interface StockRow { warehouseId: string; productId: string; productName?: string; productUnit?: string; quantity: number; }
interface TransferLine { productId: string; quantity: number; }
interface Transfer { id: string; originWarehouseId: string; destinationWarehouseId: string; status: 'draft' | 'posted'; lines: TransferLine[]; createdAt?: string; updatedAt?: string; notes?: string; }

type TabKey = 'overview' | 'inventory' | 'movements' | 'settings';

export default function WarehouseDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  // Settings form
  const [form, setForm] = useState<{ name: string; code: string; address: string; status: 'active' | 'inactive' }>({ name: '', code: '', address: '', status: 'active' });
  const [saving, setSaving] = useState(false);

  const title = useMemo(() => warehouse ? `${warehouse.name} · Armazém` : 'Armazém', [warehouse]);

  const fetchWarehouse = async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/warehouses/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar armazém');
      const w = data.warehouse as Warehouse;
      setWarehouse(w);
      setForm({ name: w.name, code: w.code, address: w.address || '', status: w.status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    }
  };

  const fetchInventory = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory?warehouseId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar inventário');
      setStocks(data.stocks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransfers = async () => {
    setError(null);
    try {
      const res = await fetch('/api/transfers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar transferências');
      const list: Transfer[] = data.transfers || [];
      const filt = id ? list.filter(t => t.originWarehouseId === id || t.destinationWarehouseId === id) : [];
      setTransfers(filt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    }
  };

  useEffect(() => {
    fetchWarehouse();
    fetchInventory();
    fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalSKUs = useMemo(() => stocks.length, [stocks]);
  const totalQuantity = useMemo(() => stocks.reduce((sum, r) => sum + (r.quantity || 0), 0), [stocks]);
  const movementsCount = useMemo(() => transfers.length, [transfers]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/warehouses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao guardar');
      await fetchWarehouse();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="p-6">
        {/* Breadcrumbs e voltar */}
        <div className="flex items-center justify-between mb-4">
          <nav className="text-sm text-gray-600">
            <Link href="/" className="hover:underline">Início</Link>
            <span className="mx-2">/</span>
            <Link href="/warehouse" className="hover:underline">Gestão de Armazém</Link>
            <span className="mx-2">/</span>
            <Link href="/warehouses" className="hover:underline">Armazéns</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">{warehouse?.name || 'Detalhe'}</span>
          </nav>
          <Link href="/warehouses" className="inline-flex items-center gap-2 px-3 py-2 border rounded hover:bg-gray-50">
            <span>←</span>
            <span>Voltar</span>
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">{warehouse?.name || 'Armazém'}</h1>
            <p className="text-gray-600">Código: {warehouse?.code || '-'}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/inventory?warehouseId=${encodeURIComponent(id || '')}`} className="text-blue-600 hover:underline">Ver Inventário</Link>
            <Link href="/transfers" className="text-blue-600 hover:underline">Transferências</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 border-b">
          {(['overview','inventory','movements','settings'] as TabKey[]).map(k => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 mr-2 border-b-2 ${tab === k ? 'border-primary text-primary' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
              {k === 'overview' ? 'Visão Geral' : k === 'inventory' ? 'Inventário' : k === 'movements' ? 'Movimentos' : 'Configurações'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-4">
          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded p-4 bg-gray-50">
                <h2 className="font-medium mb-2">Resumo</h2>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li><span className="text-gray-500">Estado:</span> {warehouse?.status === 'active' ? 'Ativo' : 'Inativo'}</li>
                  <li><span className="text-gray-500">Endereço:</span> {warehouse?.address || '-'}</li>
                </ul>
              </div>
              <div className="border rounded p-4 bg-gray-50">
                <h2 className="font-medium mb-2">Inventário</h2>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li><span className="text-gray-500">SKU distintos:</span> {totalSKUs}</li>
                  <li><span className="text-gray-500">Quantidade total:</span> {totalQuantity}</li>
                </ul>
              </div>
              <div className="border rounded p-4 bg-gray-50">
                <h2 className="font-medium mb-2">Movimentos</h2>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li><span className="text-gray-500">Transferências relacionadas:</span> {movementsCount}</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'inventory' && (
            <div>
              {loading ? (
                <div className="text-gray-500">Carregando inventário...</div>
              ) : (
                <div className="border rounded">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100 text-left">
                        <th className="px-4 py-2">Produto</th>
                        <th className="px-4 py-2">Unidade</th>
                        <th className="px-4 py-2">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocks.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">Nenhum registo</td></tr>
                      ) : (
                        stocks.map((s, idx) => (
                          <tr key={`${s.productId}:${idx}`} className="border-t">
                            <td className="px-4 py-2">{s.productName || s.productId}</td>
                            <td className="px-4 py-2">{s.productUnit || '-'}</td>
                            <td className="px-4 py-2">{s.quantity}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'movements' && (
            <div className="border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Origem → Destino</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Linhas</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nenhuma transferência</td></tr>
                  ) : (
                    transfers.map(t => (
                      <tr key={t.id} className="border-t">
                        <td className="px-4 py-2">{t.id}</td>
                        <td className="px-4 py-2">{t.originWarehouseId} → {t.destinationWarehouseId}</td>
                        <td className="px-4 py-2">{t.status === 'posted' ? 'Lançada' : 'Rascunho'}</td>
                        <td className="px-4 py-2">{t.lines.length}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'settings' && (
            <div className="max-w-xl border rounded p-4 bg-gray-50">
              <h2 className="font-medium mb-2">Configurações</h2>
              {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
              <form onSubmit={onSave} className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nome</label>
                  <input className="w-full border rounded px-3 py-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Código</label>
                  <input className="w-full border rounded px-3 py-2" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Endereço</label>
                  <input className="w-full border rounded px-3 py-2" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Estado</label>
                  <select className="w-full border rounded px-3 py-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded" disabled={saving}>{saving ? 'A guardar...' : 'Guardar'}</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}