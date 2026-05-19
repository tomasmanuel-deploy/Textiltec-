import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import Button from '@/components/ui/Button';

interface ProductForm {
  name: string;
  description?: string;
  code: string;
  category: string;
  price: number;
  unit: string;
  stock?: number;
  minStock?: number;
  status: 'active' | 'inactive';
  taxRate?: number;
  notes?: string;
  isService?: boolean;
}

export default function EditProductPage() {
  const router = useRouter();
 const toast = useToast();
  const { id } = router.query;
  const [form, setForm] = useState<ProductForm | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/products/categories');
        const data = await res.json();
        setCategories(data.categories || []);
      } catch (error) {
        console.error('Erro ao carregar categorias:', error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      const productId = Array.isArray(id) ? id[0] : id as string;
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) {
        toast.info('Produto não encontrado');
        router.push('/products');
        return;
      }
      const data = await res.json();
      const p = data;
      setForm({
        name: p.name || '',
        description: p.description || '',
        code: p.code || '',
        category: p.category || '',
        price: p.price || 0,
        unit: p.unit || '',
        stock: p.stock || 0,
        minStock: p.minStock || 0,
        status: p.status || 'active',
        taxRate: p.taxRate || 14,
        notes: p.notes || '',
        isService: !!p.isService,
      });
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      toast.info('Erro ao carregar produto');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!form) return;
    const target = e.target as HTMLInputElement;
    const { name } = target;
    const isCheckbox = target.type === 'checkbox';
    const rawValue = isCheckbox ? target.checked : target.value;
    const numericNames = new Set(['price', 'stock', 'minStock', 'taxRate']);
    const finalValue = numericNames.has(name) ? Number(rawValue) : rawValue;
    setForm(prev => ({
      ...prev!,
      [name]: finalValue as any,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const productId = Array.isArray(id) ? id[0] : id as string;
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.info(data.error || 'Falha ao atualizar produto');
        return;
      }
      router.push('/products');
    } catch (error) {
      console.error('Erro ao atualizar produto:', error);
      toast.info('Erro ao atualizar produto');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <p className="text-gray-500">Carregando...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Editar Produto</h1>
          <div className="flex gap-2">
            <Button onClick={() => router.push('/products')}>Cancelar</Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nome</label>
              <input name="name" value={form.name} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Código</label>
              <input name="code" value={form.code} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Categoria</label>
              <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">Selecione a categoria</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Unidade</label>
              <input name="unit" value={form.unit} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" placeholder="ex: peça, kg, litro" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Preço</label>
              <input type="number" step="0.01" name="price" value={form.price} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Taxa de Imposto (%)</label>
              <input type="number" step="0.01" name="taxRate" value={form.taxRate || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Estoque</label>
              <input type="number" name="stock" value={form.stock || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Estoque Mínimo</label>
              <input type="number" name="minStock" value={form.minStock || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Estado</label>
              <select name="status" value={form.status} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="isService" checked={!!form.isService} onChange={handleChange} />
                É serviço?
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Descrição</label>
              <textarea name="description" value={form.description || ''} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" rows={3} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Notas</label>
              <textarea name="notes" value={form.notes || ''} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" rows={3} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}