import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/DialogContext';

interface Product {
  id: string;
  name: string;
  description?: string;
  code: string;
  category: string;
  price: number;
  unit: string;
  stock?: number;
  minStock?: number;
  status: 'active' | 'inactive';
  vatRate?: number;
  isService?: boolean;
  createdAt: string;
  updatedAt: string;
}

const UNITS = ['UN', 'KG', 'L', 'M', 'M2', 'M3', 'CX', 'PCT', 'HR', 'DIA', 'MÊS'];
const EMPTY_FORM = {
  name: '',
  code: '',
  category: '',
  price: '',
  unit: 'UN',
  vatRate: '14',
  minStock: '',
  isService: false,
  description: '',
  status: 'active' as 'active' | 'inactive',
};

export default function ProductsPage() {
  const { language } = useAppSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, { total: number; breakdown?: Array<{ warehouseId: string; warehouseName?: string; quantity: number }> }>>({});
  const [lastMoves, setLastMoves] = useState<Record<string, { delta: number; createdAt?: string; warehouseName?: string; status?: string }>>({});

  // Form state — dual purpose (create + edit)
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
      const stockRes = await fetch('/api/stock/overview');
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        setStockMap(stockData.map || {});
        setLastMoves(stockData.lastMoves || {});
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Load product into form for editing
  const handleSelectEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      code: p.code,
      category: p.category,
      price: String(p.price),
      unit: p.unit,
      vatRate: String(p.vatRate ?? 14),
      minStock: p.minStock != null ? String(p.minStock) : '',
      isService: !!p.isService,
      description: p.description || '',
      status: p.status,
    });
    setFormError(null);
    setFormSuccess(null);
    // Scroll form into view on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!form.name.trim()) { setFormError('O nome é obrigatório.'); return; }
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) { setFormError('Preço inválido.'); return; }

    setSaving(true);
    try {
      const code = form.code.trim() || `P-${Date.now().toString().slice(-6)}`;
      const payload = {
        name: form.name.trim(),
        code,
        category: form.category.trim() || 'Geral',
        price: priceNum,
        unit: form.unit,
        vatRate: parseFloat(form.vatRate) || 0,
        minStock: form.minStock ? parseInt(form.minStock, 10) : 0,
        isService: form.isService,
        description: form.description.trim(),
        status: form.status,
      };

      if (editingId) {
        // UPDATE
        const res = await fetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || 'Falha ao actualizar produto'); return; }
        setFormSuccess('Produto actualizado com sucesso.');
        setEditingId(null);
        setForm({ ...EMPTY_FORM });
      } else {
        // CREATE
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || 'Falha ao criar produto'); return; }
        setFormSuccess('Produto criado com sucesso.');
        setForm({ ...EMPTY_FORM });
      }
      setTimeout(() => setFormSuccess(null), 3000);
      await loadProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro interno');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    const ok = await confirm({ message: `Eliminar "${p.name}"? Esta acção não pode ser revertida.`, variant: 'danger', confirmText: 'Eliminar' });
    if (!ok) return;
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Show a clear message if blocked by invoices/stock
        toast.error(data.error || 'Não é possível eliminar este produto.');
        return;
      }
      // If we were editing this product, reset form
      if (editingId === p.id) handleCancelEdit();
      await loadProducts();
    } catch {
      toast.error('Erro ao eliminar produto.');
    } finally {
      setDeletingId(null);
    }
  };

  const getQty = (id: string) => stockMap[id]?.total ?? 0;

  const isLowProd = (p: Product) => {
    if (p.isService) return false;
    return typeof p.minStock === 'number' && p.minStock > 0 && getQty(p.id) < p.minStock;
  };

  return (
    <Layout title={t('nav.products', language)}>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {t('nav.products', language)}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Registo e gestão de produtos e serviços.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* ── LEFT: Create / Edit form ── */}
          <div className="md:col-span-1 border border-gray-200 bg-gray-50 self-start">

            {/* Form header */}
            <div className={`px-4 py-3 border-b border-gray-200 flex items-center justify-between ${editingId ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <span className="font-medium text-gray-800 text-sm">
                {editingId ? '✏️  Editar Produto' : 'Novo Produto / Serviço'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <div className="p-4">
              {formError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 mb-3">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 mb-3">
                  {formSuccess}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Service toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isService"
                    checked={form.isService}
                    onChange={e => setForm({ ...form, isService: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="isService" className="text-sm text-gray-700">É um serviço</label>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Nome *</label>
                  <input
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Nome do produto ou serviço"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Código</label>
                  <input
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Auto-gerado se vazio"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Categoria</label>
                  <input
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Ex: Alimentação, Serviços…"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Preço (AOA) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 px-3 py-2 text-sm"
                      placeholder="0.00"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">IVA (%)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 px-3 py-2 text-sm"
                      placeholder="14"
                      value={form.vatRate}
                      onChange={e => setForm({ ...form, vatRate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Unidade</label>
                    <select
                      className="w-full border border-gray-300 px-3 py-2 text-sm"
                      value={form.unit}
                      onChange={e => setForm({ ...form, unit: e.target.value })}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {!form.isService && (
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Stock Mín.</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full border border-gray-300 px-3 py-2 text-sm"
                        placeholder="0"
                        value={form.minStock}
                        onChange={e => setForm({ ...form, minStock: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/* Status (only visible when editing) */}
                {editingId && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Estado</label>
                    <select
                      className="w-full border border-gray-300 px-3 py-2 text-sm"
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Descrição</label>
                  <textarea
                    rows={2}
                    className="w-full border border-gray-300 px-3 py-2 text-sm resize-none"
                    placeholder="Opcional"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className={`w-full text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    editingId
                      ? 'bg-blue-700 hover:bg-blue-800'
                      : 'bg-gray-900 hover:bg-gray-700'
                  }`}
                >
                  {saving
                    ? 'A guardar...'
                    : editingId ? 'Actualizar Produto' : 'Criar Produto'}
                </button>
              </form>
            </div>
          </div>

          {/* ── RIGHT: Products list ── */}
          <div className="md:col-span-2">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <input
                type="text"
                placeholder="Pesquisar por nome ou código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[160px]"
              />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>

            {/* Table */}
            <div className="border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.name', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.code', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.category', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.price', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.unit', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.stock', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600">{t('table.status', language)}</th>
                    <th className="px-4 py-2 font-medium text-gray-600 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        {t('common.loadingProducts', language)}
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        {t('messages.noProductsFound', language)}
                      </td>
                    </tr>
                  ) : (
                    products.map(p => {
                      const info = stockMap[p.id];
                      const total = info?.total ?? 0;
                      const isLow = isLowProd(p);
                      const breakdownText = (info?.breakdown || [])
                        .map(b => `${b.warehouseName || b.warehouseId}: ${b.quantity}`)
                        .join(', ');
                      const lastMove = lastMoves[p.id];
                      const deltaLabel = lastMove?.delta !== undefined
                        ? `${lastMove.delta >= 0 ? '+' : ''}${lastMove.delta}` : '';
                      const isEditing = editingId === p.id;

                      return (
                        <tr
                          key={p.id}
                          className={`border-t border-gray-200 ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 max-w-[180px] truncate" title={p.name}>
                              {p.name}
                            </div>
                            {p.description && (
                              <div className="text-xs text-gray-400 max-w-[180px] truncate" title={p.description}>
                                {p.description}
                              </div>
                            )}
                            {p.isService && (
                              <span className="mt-0.5 inline-block px-2 py-0.5 text-xs bg-purple-100 text-purple-700">
                                Serviço
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.code}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[100px] truncate" title={p.category}>
                            {p.category}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{p.price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-600">{p.unit}</td>
                          <td className="px-4 py-3">
                            {p.isService ? (
                              <span className="text-gray-400 text-xs">N/A</span>
                            ) : (
                              <div>
                                <div className={`font-medium ${isLow ? 'text-red-700' : 'text-gray-900'}`}>
                                  {total}
                                </div>
                                {isLow && (
                                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5">
                                    mín. {p.minStock}
                                  </span>
                                )}
                                {breakdownText && (
                                  <div className="text-xs text-gray-400 mt-0.5 max-w-[100px] truncate" title={breakdownText}>
                                    {breakdownText}
                                  </div>
                                )}
                                {lastMove && (
                                  <span className={`text-xs ${lastMove.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {lastMove.delta >= 0 ? '↑' : '↓'} {deltaLabel}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-medium ${
                              p.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {t(`status.${p.status}`, language)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => isEditing ? handleCancelEdit() : handleSelectEdit(p)}
                                className={`px-3 py-1 text-xs border transition-colors ${
                                  isEditing
                                    ? 'border-blue-400 text-blue-700 bg-blue-50'
                                    : 'border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {isEditing ? 'Cancelar' : 'Editar'}
                              </button>
                              <Link
                                href={`/inventory?productId=${p.id}`}
                                className="border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 transition-colors"
                              >
                                Stock
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDelete(p)}
                                disabled={deletingId === p.id}
                                className="border border-gray-300 px-3 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                                title="Não pode eliminar se existirem faturas ou stock"
                              >
                                {deletingId === p.id ? '...' : 'Eliminar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
