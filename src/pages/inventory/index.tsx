import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; unit?: string; }
interface StockRow { warehouseId: string; warehouseName?: string; productId: string; productName?: string; productUnit?: string; quantity: number; }
interface MovementRow { id: string; createdAt: string; warehouseId: string; warehouseName?: string; productId: string; productName?: string; productUnit?: string; delta: number; source?: string; status?: 'active' | 'cancelled'; cancelledAt?: string; }

export default function InventoryPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [adjustForm, setAdjustForm] = useState({ warehouseId: '', productId: '', delta: 0 });
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState<string | null>(null);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    code: '',
    category: '',
    unit: '',
    price: 0,
    stock: 0,
    minStock: 0,
    status: 'active' as 'active' | 'inactive',
    taxRate: 14,
    notes: ''
  });

  const fetchWarehouses = async () => {
    const res = await fetch('/api/warehouses');
    const data = await res.json();
    setWarehouses((data.warehouses || []).map((w: any) => ({ id: w.id, name: w.name })));
  };

  const fetchProducts = async () => {
    const res = await fetch('/api/products');
    const data = await res.json();
    setProducts((data.products || []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit })));
  };

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (warehouseFilter) params.set('warehouseId', warehouseFilter);
      if (productFilter) params.set('productId', productFilter);
      const res = await fetch(`/api/inventory?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar inventário');
      setStocks(data.stocks || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    setMovLoading(true);
    setMovError(null);
    try {
      const params = new URLSearchParams();
      if (warehouseFilter) params.set('warehouseId', warehouseFilter);
      if (productFilter) params.set('productId', productFilter);
      params.set('limit', '50');
      const res = await fetch(`/api/inventory/movements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar movimentos');
      setMovements(data.movements || []);
    } catch (e) {
      setMovError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setMovLoading(false);
    }
  };

  // Carregar listas iniciais
  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ler filtros da query string inicialmente
  useEffect(() => {
    if (!router.isReady) return;
    const qProduct = router.query.productId;
    const qWarehouse = router.query.warehouseId;
    if (typeof qProduct === 'string') setProductFilter(qProduct);
    if (typeof qWarehouse === 'string') setWarehouseFilter(qWarehouse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Atualizar dados quando filtros mudam
  useEffect(() => {
    fetchInventory();
    fetchMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseFilter, productFilter]);

  const onAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao ajustar inventário');
      setAdjustForm({ warehouseId: '', productId: '', delta: 0 });
      await fetchInventory();
      await fetchMovements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ajustar');
    }
  };

  const onCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const { name, description, code, category, unit, price, stock, minStock, status, taxRate, notes } = newProduct;
      if (!name || !code || !category || !unit || price === undefined) {
        throw new Error('Preencha nome, código, categoria, unidade e preço');
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, code, category, unit, price, stock, minStock, status, taxRate, notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar produto');

      // Atualiza lista e pré-seleciona produto criado no ajuste
      await fetchProducts();
      setAdjustForm(prev => ({ ...prev, productId: data.id }));
      setShowCreateProduct(false);
      setNewProduct({ name: '', description: '', code: '', category: '', unit: '', price: 0, stock: 0, minStock: 0, status: 'active', taxRate: 14, notes: '' });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Erro ao criar produto');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <Layout>
      <Head>
        <title>Inventário</title>
      </Head>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Inventário</h1>
            <p className="text-gray-600">Contagens, reconciliações e ajustes.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                const date = new Date().toISOString().split('T')[0];
                window.open(`/api/agt/inventory-saft?date=${date}`);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
            >
              Exportar SAF-T de Inventário (AGT)
            </button>
            <Link href="/warehouse" className="text-blue-600 hover:underline flex items-center">Voltar à Gestão de Armazém</Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 border rounded p-4 bg-gray-50">
            <h2 className="font-medium mb-2">Ajuste Manual</h2>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
            <form onSubmit={onAdjust} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Armazém</label>
                <select className="w-full border rounded px-3 py-2" value={adjustForm.warehouseId} onChange={e => setAdjustForm({ ...adjustForm, warehouseId: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Produto</label>
                <select className="w-full border rounded px-3 py-2" value={adjustForm.productId} onChange={e => setAdjustForm({ ...adjustForm, productId: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {products.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <div className="mt-2">
                  <button type="button" className="text-blue-600 text-sm hover:underline" onClick={() => setShowCreateProduct(v => !v)}>
                    {showCreateProduct ? 'Cancelar' : 'Criar novo produto'}
                  </button>
                </div>
                {showCreateProduct && (
                  <div className="mt-3 border rounded p-3 bg-white">
                    <h3 className="font-medium text-sm mb-2">Novo Produto</h3>
                    {createError && <div className="text-xs text-red-600 mb-2">{createError}</div>}
                    <form onSubmit={onCreateProduct} className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        placeholder="Nome"
                        className="border rounded px-3 py-2"
                        value={newProduct.name}
                        onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                        required
                      />
                      <textarea
                        placeholder="Descrição"
                        className="border rounded px-3 py-2"
                        rows={2}
                        value={newProduct.description}
                        onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                      />
                      <input
                        type="text"
                        placeholder="Código"
                        className="border rounded px-3 py-2"
                        value={newProduct.code}
                        onChange={e => setNewProduct({ ...newProduct, code: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Categoria"
                        className="border rounded px-3 py-2"
                        value={newProduct.category}
                        onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                        required
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Unidade (ex: un, kg)"
                          className="border rounded px-3 py-2"
                          value={newProduct.unit}
                          onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })}
                          required
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Preço"
                          className="border rounded px-3 py-2"
                          value={newProduct.price}
                          onChange={e => setNewProduct({ ...newProduct, price: parseFloat(e.target.value || '0') })}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="1"
                          placeholder="Stock inicial"
                          className="border rounded px-3 py-2"
                          value={newProduct.stock}
                          onChange={e => setNewProduct({ ...newProduct, stock: parseInt(e.target.value || '0', 10) })}
                        />
                        <input
                          type="number"
                          step="1"
                          placeholder="Stock mínimo"
                          className="border rounded px-3 py-2"
                          value={newProduct.minStock}
                          onChange={e => setNewProduct({ ...newProduct, minStock: parseInt(e.target.value || '0', 10) })}
                        />
                        <input
                          type="number"
                          step="1"
                          placeholder="IVA (%)"
                          className="border rounded px-3 py-2"
                          value={newProduct.taxRate}
                          onChange={e => setNewProduct({ ...newProduct, taxRate: parseInt(e.target.value || '14', 10) })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="border rounded px-3 py-2"
                          value={newProduct.status}
                          onChange={e => setNewProduct({ ...newProduct, status: e.target.value as 'active' | 'inactive' })}
                        >
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                        </select>
                        <textarea
                          placeholder="Notas"
                          className="border rounded px-3 py-2"
                          rows={2}
                          value={newProduct.notes}
                          onChange={e => setNewProduct({ ...newProduct, notes: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="bg-primary text-white px-3 py-2 rounded" disabled={createLoading}>
                        {createLoading ? 'Criando...' : 'Criar Produto'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Delta</label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    className={`px-2 py-1 border rounded text-sm ${adjustForm.delta < 0 ? 'bg-red-50 border-red-600 text-red-700' : ''}`}
                    onClick={() => setAdjustForm({ ...adjustForm, delta: -Math.abs(adjustForm.delta || 1) })}
                    title="Selecionar baixa (valor negativo)"
                  >
                    Baixa (−)
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 border rounded text-sm ${adjustForm.delta >= 0 ? 'bg-green-50 border-green-600 text-green-700' : ''}`}
                    onClick={() => setAdjustForm({ ...adjustForm, delta: Math.abs(adjustForm.delta || 1) })}
                    title="Selecionar entrada (valor positivo)"
                  >
                    Entrada (+)
                  </button>
                </div>
                <input type="number" className="w-full border rounded px-3 py-2" value={adjustForm.delta} onChange={e => setAdjustForm({ ...adjustForm, delta: parseInt(e.target.value || '0', 10) })} required />
                <p className="text-xs text-gray-500">Use valores negativos para baixa, positivos para entrada. Pode alternar acima.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[-10, -5, -1, 1, 5, 10].map(step => (
                    <button
                      key={`step-${step}`}
                      type="button"
                      className="px-2 py-1 border rounded text-sm"
                      onClick={() => setAdjustForm({ ...adjustForm, delta: (adjustForm.delta || 0) + step })}
                      title={step > 0 ? `Adicionar +${step}` : `Subtrair ${step}`}
                    >
                      {step > 0 ? `+${step}` : step}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Aplicar</button>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="flex gap-2 mb-3">
              <select className="border rounded px-3 py-2" value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}>
                <option value="">Todos os Armazéns</option>
                {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
              <select className="border rounded px-3 py-2" value={productFilter} onChange={e => setProductFilter(e.target.value)}>
                <option value="">Todos os Produtos</option>
                {products.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              <button onClick={fetchInventory} className="border px-3 py-2 rounded">Filtrar</button>
            </div>

            <div className="border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">Armazém</th>
                    <th className="px-4 py-2">Produto</th>
                    <th className="px-4 py-2">Unidade</th>
                    <th className="px-4 py-2">Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
                  ) : stocks.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nenhum registo de stock</td></tr>
                  ) : (
                    stocks.map((s, idx) => (
                      <tr key={`${s.warehouseId}:${s.productId}:${idx}`} className="border-t">
                        <td className="px-4 py-2">{s.warehouseName || s.warehouseId}</td>
                        <td className="px-4 py-2">{s.productName || s.productId}</td>
                        <td className="px-4 py-2">{s.productUnit || '-'}</td>
                        <td className="px-4 py-2">{s.quantity}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border rounded mt-4">
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
                <h3 className="font-medium">Movimentos (entradas/saídas individuais)</h3>
                <button onClick={fetchMovements} className="text-sm text-blue-600 hover:underline">Atualizar</button>
              </div>
              {movError && <div className="px-4 py-2 text-sm text-red-600">{movError}</div>}
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">Data/Hora</th>
                    <th className="px-4 py-2">Produto</th>
                    <th className="px-4 py-2">Armazém</th>
                    <th className="px-4 py-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {movLoading ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Carregando movimentos...</td></tr>
                  ) : movements.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Sem movimentos para os filtros atuais</td></tr>
                  ) : (
                    movements.map((m) => (
                      <tr key={m.id} className={`border-t ${m.status === 'cancelled' ? 'line-through text-gray-500' : ''}`} title={m.status === 'cancelled' ? 'Movimento revertido' : ''}>
                        <td className="px-4 py-2">{new Date(m.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{m.productName || m.productId}</td>
                        <td className="px-4 py-2">{m.warehouseName || m.warehouseId}</td>
                        <td className={`px-4 py-2 ${m.status === 'cancelled' ? 'text-gray-500' : m.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>{m.delta}</td>
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