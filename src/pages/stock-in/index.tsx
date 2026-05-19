import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/DialogContext';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; unit?: string; isService?: boolean; }
interface Line { productId: string; quantity: number; productName?: string; }
interface StockInRecord {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  status: 'draft' | 'posted';
  date: string;
  reference?: string;
  lines: Line[];
  totalQuantity?: number;
}

export default function StockInPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<StockInRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<{ warehouseId: string; reference?: string; lines: Line[] }>({ warehouseId: '', reference: '', lines: [{ productId: '', quantity: 1, productName: '' }] });

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

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/stock-in?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar entradas de stock');
      setRecords(data.stockIns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
    fetchRecords();
  }, []);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { productId: '', quantity: 1, productName: '' }] });
  const removeLine = (idx: number) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const preparedLines: Line[] = JSON.parse(JSON.stringify(form.lines));
      for (let i = 0; i < preparedLines.length; i++) {
        const ln = preparedLines[i];
        const name = (ln.productName || '').trim();
        if (!ln.productId && name) {
          const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const code = `AUTO-${slug}-${Date.now().toString().slice(-6)}`;
          const payload = {
            name,
            description: '',
            code,
            category: 'Geral',
            price: 0,
            unit: 'un',
            stock: 0,
            status: 'active',
          };
          const resP = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const prod = await resP.json();
          if (!resP.ok) {
            throw new Error(prod.error || 'Falha ao criar produto novo');
          }
          preparedLines[i].productId = prod.id;
          setProducts(prev => [...prev, { id: prod.id, name: prod.name, unit: prod.unit, isService: !!prod.isService }]);
        }
        if (!preparedLines[i].productId) {
          throw new Error('Selecione um produto existente ou escreva o nome de um novo');
        }
      }

      const res = await fetch('/api/stock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: form.warehouseId,
          reference: form.reference,
          lines: preparedLines.map(l => ({ productId: l.productId, quantity: l.quantity }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar entrada de stock');
      setForm({ warehouseId: '', reference: '', lines: [{ productId: '', quantity: 1, productName: '' }] });
      toast.success('Entrada de stock registada com sucesso!');
      await fetchRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar');
    }
  };

  const toggleStatus = async (rec: StockInRecord) => {
    setError(null);
    try {
      const res = await fetch(`/api/stock-in/${rec.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: rec.status === 'draft' ? 'posted' : 'draft' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao alternar estado');
      await fetchRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alternar estado');
    }
  };

  const onDelete = async (rec: StockInRecord) => {
    const ok = await confirm({ message: 'Eliminar esta entrada de stock?', variant: 'danger', confirmText: 'Eliminar' });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(`/api/stock-in/${rec.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao eliminar');
      }
      await fetchRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao eliminar');
    }
  };

  return (
    <Layout>
      <Head>
        <title>Entrada de Stock</title>
      </Head>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Entrada de Stock</h1>
            <p className="text-gray-600">Registo de receções e entrada em armazém.</p>
          </div>
          <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 border rounded p-4 bg-gray-50">
            <h2 className="font-medium mb-2">Nova Entrada</h2>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            <form onSubmit={onCreate} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Armazém</label>
                <select className="w-full border rounded px-3 py-2" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Referência</label>
                <input className="w-full border rounded px-3 py-2" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Linhas</span>
                  <button type="button" className="text-sm text-blue-600" onClick={addLine}>Adicionar linha</button>
                </div>
                {form.lines.map((ln, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2">
                    <select
                      className="border rounded px-3 py-2 flex-1 min-w-[200px]"
                      value={ln.productId}
                      onChange={e => {
                        const lines = [...form.lines];
                        lines[idx] = { ...lines[idx], productId: e.target.value };
                        setForm({ ...form, lines });
                      }}
                    >
                      <option value="">Produto existente...</option>
                      {products.filter(p => !p.isService).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                    <input
                      type="text"
                      className="border rounded px-3 py-2 flex-1 min-w-[200px]"
                      placeholder="Ou escrever nome de novo produto"
                      value={ln.productName || ''}
                      onChange={e => {
                        const lines = [...form.lines];
                        lines[idx] = { ...lines[idx], productName: e.target.value };
                        setForm({ ...form, lines });
                      }}
                      disabled={!!ln.productId}
                    />
                    <input
                      type="number"
                      min={1}
                      className="border rounded px-3 py-2 w-24"
                      value={ln.quantity}
                      onChange={e => {
                        const lines = [...form.lines];
                        lines[idx] = { ...lines[idx], quantity: parseInt(e.target.value || '1', 10) };
                        setForm({ ...form, lines });
                      }}
                      required
                    />
                    <button type="button" className="border rounded px-3 py-2" onClick={() => removeLine(idx)}>Remover</button>
                    <p className="basis-full text-xs text-gray-500">Se não escolher um produto existente, pode escrever o nome de um novo.</p>
                  </div>
                ))}
              </div>
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Criar</button>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="flex gap-2 mb-3">
              <select className="border rounded px-3 py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="posted">Emitido</option>
              </select>
              <button onClick={fetchRecords} className="border px-3 py-2 rounded">Filtrar</button>
            </div>

            <div className="border rounded overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Referência</th>
                    <th className="px-4 py-2">Armazém</th>
                    <th className="px-4 py-2">Linhas</th>
                    <th className="px-4 py-2">Qt Total</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
                  ) : records.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Sem entradas de stock</td></tr>
                  ) : (
                    records.map(rec => (
                      <tr key={rec.id} className="border-t">
                        <td className="px-4 py-2">{rec.date}</td>
                        <td className="px-4 py-2">{rec.reference || '-'}</td>
                        <td className="px-4 py-2">{rec.warehouseName || rec.warehouseId}</td>
                        <td className="px-4 py-2">{rec.lines.length}</td>
                        <td className="px-4 py-2">{rec.totalQuantity ?? rec.lines.reduce((s, l) => s + l.quantity, 0)}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${rec.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{rec.status}</span>
                        </td>
                        <td className="px-4 py-2 flex gap-2">
                          <button onClick={() => toggleStatus(rec)} className="border px-3 py-1 rounded">
                            {rec.status === 'draft' ? 'Emitir' : 'Reverter'}
                          </button>
                          <button onClick={() => onDelete(rec)} className="border px-3 py-1 rounded">Eliminar</button>
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