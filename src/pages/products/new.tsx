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

export default function NewProductPage() {
 const router = useRouter();
 const toast = useToast();
 const [form, setForm] = useState<ProductForm>({
 name: '',
 description: '',
 code: '',
 category: '',
 price: 0,
 unit: '',
 stock: 0,
 minStock: 0,
 status: 'active',
 taxRate: 14,
 notes: '',
 isService: false,
 });
 const [categories, setCategories] = useState<string[]>([]);
 const [saving, setSaving] = useState<boolean>(false);
 const [showNewCategory, setShowNewCategory] = useState<boolean>(false);
 const [newCategoryName, setNewCategoryName] = useState<string>('');
 const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
 const [categoryError, setCategoryError] = useState<string>('');
 // Valores anteriores para restauração inteligente ao desmarcar "É serviço?"
 const [prevValues, setPrevValues] = useState<{ unit: string; stock: number; minStock: number }>({ unit: '', stock: 0, minStock: 0 });

 useEffect(() => {
 const fetchCategories = async () => {
 try {
 const res = await fetch('/api/categories');
 const data = await res.json();
 const arr = Array.isArray(data.categories) ? data.categories : [];
 setCategories(arr.map((c: any) => c.name));
 } catch (error) {
 console.error('Erro ao carregar categorias:', error);
 }
 };
 fetchCategories();
 }, []);

 const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
 const target = e.target as HTMLInputElement;
 const { name } = target;
 const isCheckbox = target.type === 'checkbox';
 const rawValue = isCheckbox ? target.checked : target.value;
 const numericNames = new Set(['price', 'stock', 'minStock', 'taxRate']);
 const finalValue = numericNames.has(name) ? Number(rawValue) : rawValue;

 // Tratamento inteligente ao alternar "É serviço?"
 if (name === 'isService') {
 const isServ = !!finalValue;
 setForm(prev => {
 if (isServ) {
 // Guardar valores e limpar campos irrelevantes para serviços
 setPrevValues({ unit: prev.unit || '', stock: prev.stock || 0, minStock: prev.minStock || 0 });
 return { ...prev, isService: true, unit: '', stock: 0, minStock: 0 };
 }
 // Restaurar valores anteriores ao voltar a produto
 return { ...prev, isService: false, unit: prevValues.unit || '', stock: prevValues.stock || 0, minStock: prevValues.minStock || 0 };
 });
 return;
 }

 setForm(prev => ({
 ...prev,
 [name]: finalValue as any,
 }));
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSaving(true);
 try {
 // Garantir payload consistente: serviços não têm unidade/estoque
 const payload = form.isService
 ? { ...form, unit: '', stock: 0, minStock: 0 }
 : { ...form };

 const res = await fetch('/api/products', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload)
 });
 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 toast.info(data.error || 'Falha ao criar produto');
 return;
 }
 toast.success('Produto registado com sucesso!');
 router.push('/products');
 } catch (error) {
 console.error('Erro ao criar produto:', error);
 toast.info('Erro ao criar produto');
 } finally {
 setSaving(false);
 }
 };

 const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
 const value = e.target.value;
 if (value === '__nova__') {
 setShowNewCategory(true);
 setForm(prev => ({ ...prev, category: '' }));
 } else {
 setShowNewCategory(false);
 setForm(prev => ({ ...prev, category: value }));
 }
 };

 const handleCreateCategory = async () => {
 setCategoryError('');
 const name = newCategoryName.trim();
 if (!name) { setCategoryError('Indique o nome da categoria'); return; }
 setCreatingCategory(true);
 try {
 const res = await fetch('/api/categories', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name })
 });
 const data = await res.json();
 if (!res.ok && !data.category) {
 toast.info(data.error || 'Falha ao criar categoria');
 return;
 }
 const cat = data.category || data;
 setCategories(prev => Array.from(new Set([...prev, cat.name])));
 setForm(prev => ({ ...prev, category: cat.name }));
 setShowNewCategory(false);
 setNewCategoryName('');
 } catch (error) {
 console.error('Erro ao criar categoria:', error);
 toast.info('Erro ao criar categoria');
 } finally {
 setCreatingCategory(false);
 }
 };

 return (
 <Layout>
 <div className="max-w-3xl mx-auto px-4 py-8">
 <div className="flex items-center justify-between mb-6">
 <h1 className="text-2xl font-semibold">Novo Produto</h1>
 <div className="flex gap-2">
 <Button onClick={() => router.push('/products')}>Cancelar</Button>
 </div>
 </div>

 <form onSubmit={handleSubmit} className="bg-white shadow p-6 space-y-4">
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
 <select name="category" value={form.category} onChange={handleCategorySelect} className="w-full border border-gray-300 rounded px-3 py-2">
 <option value="">Selecione a categoria</option>
 {categories.map(cat => (
 <option key={cat} value={cat}>{cat}</option>
 ))}
 <option value="__nova__">+ Criar nova categoria...</option>
 </select>
 {(showNewCategory || categories.length === 0) && (
 <div className="mt-2 flex items-center gap-2">
 <input
 placeholder="Nome da nova categoria"
 value={newCategoryName}
 onChange={(e) => setNewCategoryName(e.target.value)}
 className="flex-1 border border-gray-300 rounded px-3 py-2"
 />
 <Button type="button" variant="secondary" onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}>Cancelar</Button>
 <Button type="button" variant="primary" onClick={handleCreateCategory} disabled={creatingCategory}>
 {creatingCategory ? 'Criando...' : 'Guardar Categoria'}
 </Button>
 </div>
 )}
 {categoryError && (
 <p className="text-xs text-red-600 mt-1">{categoryError}</p>
 )}
 </div>
 {!form.isService && (
 <div>
 <label className="block text-sm text-gray-600 mb-1">Unidade</label>
 <input name="unit" value={form.unit} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" placeholder="ex: peça, kg, litro" />
 </div>
 )}
 <div>
 <label className="block text-sm text-gray-600 mb-1">Preço</label>
 <input type="number" step="0.01" name="price" value={form.price} onChange={handleChange} required className="w-full border border-gray-300 rounded px-3 py-2" />
 </div>
 <div>
 <label className="block text-sm text-gray-600 mb-1">Taxa de Imposto (%)</label>
 <input type="number" step="0.01" name="taxRate" value={form.taxRate || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
 </div>
 {!form.isService && (
 <div>
 <label className="block text-sm text-gray-600 mb-1">Estoque</label>
 <input type="number" name="stock" value={form.stock || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
 </div>
 )}
 {!form.isService && (
 <div>
 <label className="block text-sm text-gray-600 mb-1">Estoque Mínimo</label>
 <input type="number" name="minStock" value={form.minStock || 0} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2" />
 </div>
 )}
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
 {form.isService && (
 <p className="text-xs text-gray-500 mt-1">Serviços não têm unidade nem estoque.</p>
 )}
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
 {saving ? 'Guardando...' : 'Criar Produto'}
 </Button>
 </div>
 </form>
 </div>
 </Layout>
 );
}
