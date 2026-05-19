import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useConfirm, usePrompt } from '@/context/DialogContext';

interface Warehouse { id: string; name: string; }
interface Product { id: string; name: string; unit?: string; }
interface Line { productId: string; quantity: number; unitCost?: number; productName?: string; }
interface SupplierOption { id: string; name: string; nif?: string; }
interface PurchaseRecord {
 id: string;
 warehouseId: string;
 warehouseName?: string;
 supplierId?: string;
 supplierName: string;
 supplierNif?: string;
 status: 'draft' | 'posted';
 date: string;
 reference?: string;
 lines: Line[];
 totalQuantity?: number;
}

export default function PurchasesPage() {
  const confirm = useConfirm();
  const prompt = usePrompt();
 const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
 const [products, setProducts] = useState<Product[]>([]);
 const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
 const [supplierSearch, setSupplierSearch] = useState<string>('');
 const [newSupplierType, setNewSupplierType] = useState<'company' | 'individual'>('company');
 const [records, setRecords] = useState<PurchaseRecord[]>([]);
 const [statusFilter, setStatusFilter] = useState('');
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const [form, setForm] = useState<{ warehouseId: string; supplierName: string; supplierNif?: string; supplierAddress?: string; reference?: string; lines: Line[] }>({ warehouseId: '', supplierName: '', supplierNif: '', supplierAddress: '', reference: '', lines: [{ productId: '', quantity: 1, productName: '' }] });
 const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

 const fetchWarehouses = async () => {
 const res = await fetch('/api/warehouses');
 const data = await res.json();
 setWarehouses((data.warehouses || []).map((w: any) => ({ id: w.id, name: w.name })));
 };

 const fetchProducts = async () => {
 const res = await fetch('/api/products?status=active&limit=100');
 const data = await res.json();
 setProducts((data.products || []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit })));
 };

 const fetchSuppliers = async (term?: string) => {
 const params = new URLSearchParams();
 params.set('limit', '100');
 params.set('offset', '0');
 params.set('status', 'active');
 if (term && term.trim()) params.set('search', term.trim());
 const res = await fetch(`/api/suppliers?${params.toString()}`);
 const data = await res.json();
 setSuppliers((data.suppliers || []).map((s: any) => ({ id: s.id, name: s.name, nif: s.nif })));
 };

 const fetchRecords = async () => {
 setLoading(true);
 setError(null);
 try {
 const params = new URLSearchParams();
 if (statusFilter) params.set('status', statusFilter);
 const res = await fetch(`/api/purchases?${params.toString()}`);
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao carregar compras');
 setRecords(data.purchases || []);
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro interno');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchWarehouses();
 fetchProducts();
 fetchSuppliers();
 fetchRecords();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const addLine = () => setForm({ ...form, lines: [...form.lines, { productId: '', quantity: 1, productName: '' }] });
 const removeLine = (idx: number) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

 const onCreate = async (e: React.FormEvent) => {
 e.preventDefault();
 setError(null);
 try {
 // Pré-criar produtos novos caso o utilizador tenha escrito um nome
 const preparedLines: Line[] = JSON.parse(JSON.stringify(form.lines));
 for (let i = 0; i < preparedLines.length; i++) {
 const ln = preparedLines[i];
 const name = (ln.productName || '').trim();
 if (!ln.productId && name) {
 // Gerar código automático único baseado no nome
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
 // Atualizar lista local de produtos para aparecer nas próximas seleções
 setProducts(prev => [...prev, { id: prod.id, name: prod.name, unit: prod.unit }]);
 }
 if (!preparedLines[i].productId) {
 throw new Error('Selecione um produto existente ou escreva o nome de um novo');
 }
 }

 const res = await fetch('/api/purchases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 warehouseId: form.warehouseId,
 supplierId: (selectedSupplierId && selectedSupplierId !== '__new') ? selectedSupplierId : undefined,
 supplierName: form.supplierName,
 supplierNif: form.supplierNif,
 reference: form.reference,
 lines: preparedLines.map(l => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }))
 })
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao criar compra');
 setForm({ warehouseId: '', supplierName: '', supplierNif: '', reference: '', lines: [{ productId: '', quantity: 1, productName: '' }] });
 await fetchRecords();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro ao criar');
 }
 };

 const toggleStatus = async (rec: PurchaseRecord) => {
 setError(null);
 try {
 const res = await fetch(`/api/purchases/${rec.id}`, {
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

 const onDelete = async (rec: PurchaseRecord) => {
 if (!await confirm('Eliminar esta compra?')) return;
 setError(null);
 try {
 const res = await fetch(`/api/purchases/${rec.id}`, { method: 'DELETE' });
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
 <title>Compras a Fornecedores</title>
 </Head>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-semibold mb-1">Compras a Fornecedores</h1>
 <p className="text-gray-600">Registo de compras e entrada em armazém.</p>
 </div>
 <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
 </div>

 <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="md:col-span-1 border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Nova Compra</h2>
 {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
 <form onSubmit={onCreate} className="space-y-3">
 <div>
 <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">Selecionar fornecedor existente</label>
 <div className="flex gap-2 items-center mb-2">
 <input
 type="text"
 className="flex-1 border rounded px-3 py-2"
 placeholder="Buscar por nome ou NIF"
 value={supplierSearch}
 onChange={e => { setSupplierSearch(e.target.value); fetchSuppliers(e.target.value); }}
 />
 <button type="button" className="border rounded px-3 py-2" onClick={() => fetchSuppliers(supplierSearch)}>Buscar</button>
 </div>
 <select
 className="w-full border rounded px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
 value={selectedSupplierId}
 onChange={e => {
 const val = e.target.value;
 setSelectedSupplierId(val);
 if (!val || val === '__new') {
 setForm({ ...form, supplierName: '', supplierNif: '' });
 return;
 }
 const s = suppliers.find(s => s.id === val);
 setForm({ ...form, supplierName: s?.name || '', supplierNif: s?.nif || '' });
 }}
 >
 <option value="">— Nenhum selecionado —</option>
 {suppliers.map(s => (<option key={s.id} value={s.id}>{s.name}{s.nif ? ` (NIF ${s.nif})` : ''}</option>))}
 <option value="__new">Criar novo fornecedor…</option>
 </select>
 </div>
 <div>
 <label className="block text-sm text-gray-600 mb-1">Fornecedor</label>
 <input className="w-full border rounded px-3 py-2" value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} required disabled={!!selectedSupplierId && selectedSupplierId !== '__new'} />
 </div>
 <div>
 <label className="block text-sm text-gray-600 mb-1">NIF (Opcional)</label>
 <input className="w-full border rounded px-3 py-2" value={form.supplierNif} onChange={e => setForm({ ...form, supplierNif: e.target.value })} disabled={!!selectedSupplierId && selectedSupplierId !== '__new'} />
 </div>
 {(!selectedSupplierId || selectedSupplierId === '__new') && (
 <div>
 <label className="block text-sm text-gray-600 mb-1">Endereço (para criar fornecedor)</label>
 <input className="w-full border rounded px-3 py-2" value={form.supplierAddress || ''} onChange={e => setForm({ ...form, supplierAddress: e.target.value })} placeholder="Opcional (usarei 'Sem endereço' se vazio)" />
 </div>
 )}
 {selectedSupplierId === '__new' && (
 <div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
 <div>
 <label className="block text-sm text-gray-600 mb-1">Tipo</label>
 <select className="w-full border rounded px-3 py-2" value={newSupplierType} onChange={e => setNewSupplierType((e.target.value as 'company' | 'individual') || 'company')}>
 <option value="company">Empresa</option>
 <option value="individual">Individual</option>
 </select>
 </div>
 </div>
 <button
 type="button"
 className="border rounded px-3 py-2 text-sm"
 onClick={async () => {
 try {
 if (!form.supplierName?.trim()) {
 setError('Indique o nome do fornecedor para criar');
 return;
 }
 const payload = {
 name: form.supplierName.trim(),
 tradeName: form.supplierName.trim(),
 nif: (form.supplierNif || '').trim() || `NIF-${Date.now().toString().slice(-6)}`,
 address: (form.supplierAddress || '').trim() || 'Sem endereço',
 email: '',
 phone: '',
 clientType: newSupplierType,
 notes: 'Criado rapidamente no fluxo de Compras'
 };
 const res = await fetch('/api/suppliers', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload)
 });
 const data = await res.json();
 if (!res.ok) {
 throw new Error(data.error || 'Falha ao criar fornecedor');
 }
 const s = data.supplier || data; // algumas rotas retornam diretamente o objeto
 setSuppliers(prev => [{ id: s.id, name: s.name, nif: s.nif }, ...prev]);
 setSelectedSupplierId(s.id);
 setForm({ ...form, supplierName: s.name, supplierNif: s.nif });
 setError(null);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Erro ao criar fornecedor');
 }
 }}
 >Criar fornecedor e selecionar</button>
 </div>
 )}
 <div>
 <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">Armazém</label>
 <select className="w-full border rounded px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} required>
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
 <select className="border rounded px-3 py-2 flex-1 min-w-[200px] dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={ln.productId} onChange={e => {
 const lines = [...form.lines];
 lines[idx] = { ...lines[idx], productId: e.target.value };
 setForm({ ...form, lines });
 }}>
 <option value="">Produto existente...</option>
 {products.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
 </select>
 <input type="text" className="border rounded px-3 py-2 flex-1 min-w-[200px]" placeholder="Ou escrever nome de novo produto" value={ln.productName || ''} onChange={e => {
 const lines = [...form.lines];
 lines[idx] = { ...lines[idx], productName: e.target.value };
 setForm({ ...form, lines });
 }} disabled={!!ln.productId} />
 <input type="number" min={1} className="border rounded px-3 py-2 w-24" value={ln.quantity} onChange={e => {
 const lines = [...form.lines];
 lines[idx] = { ...lines[idx], quantity: parseInt(e.target.value || '1', 10) };
 setForm({ ...form, lines });
 }} required />
 <input type="number" step="0.01" className="border rounded px-3 py-2 w-28" value={ln.unitCost ?? ''} onChange={e => {
 const lines = [...form.lines];
 const v = e.target.value === '' ? undefined : parseFloat(e.target.value);
 lines[idx] = { ...lines[idx], unitCost: v };
 setForm({ ...form, lines });
 }} placeholder="Custo" />
 <div className="ml-auto flex items-center gap-2">
 {(ln.productId || ln.productName) && (
 <span
 className={`px-2 py-1 rounded text-sm ${ln.productId ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'}`}
 title={ln.productId ? (products.find(p => p.id === ln.productId)?.name || '') : (ln.productName || '')}
 >
 {ln.productId
 ? `Produto: ${products.find(p => p.id === ln.productId)?.name || '-'}`
 : `Novo: ${ln.productName}`}
 </span>
 )}
 <button type="button" className="border rounded px-3 py-2" onClick={() => removeLine(idx)}>Remover</button>
 </div>
 <p className="basis-full text-xs text-gray-500">Se não escolher um produto existente, pode escrever o nome de um novo.</p>
 </div>
 ))}
 </div>
 <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Criar</button>
 </form>
 </div>

 <div className="md:col-span-2">
 <div className="flex gap-2 mb-3">
 <select className="border rounded px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
 <option value="">Todos</option>
 <option value="draft">Rascunho</option>
 <option value="posted">Emitido</option>
 </select>
 <button onClick={fetchRecords} className="border px-3 py-2 rounded">Filtrar</button>
 </div>

 <div className="border rounded">
 <table className="w-full">
 <thead>
 <tr className="bg-gray-100 text-left">
 <th className="px-4 py-2">Data</th>
 <th className="px-4 py-2">Fornecedor</th>
 <th className="px-4 py-2">Armazém</th>
 <th className="px-4 py-2">Linhas</th>
 <th className="px-4 py-2">Produtos</th>
 <th className="px-4 py-2">Qt Total</th>
 <th className="px-4 py-2">Estado</th>
 <th className="px-4 py-2">Ações</th>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
 ) : records.length === 0 ? (
 <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Sem compras</td></tr>
 ) : (
 records.map(rec => (
 <tr key={rec.id} className="border-t">
 <td className="px-4 py-2">{rec.date}</td>
 <td className="px-4 py-2">{rec.supplierName}</td>
 <td className="px-4 py-2">{rec.warehouseName || rec.warehouseId}</td>
 <td className="px-4 py-2">{rec.lines.length}</td>
 <td className="px-4 py-2">
 {(() => {
 const nameById = (id: string) => products.find(p => p.id === id)?.name || id;
 const names = (rec.lines || []).map(l => nameById(l.productId));
 if (names.length === 0) return '-';
 const preview = names.slice(0, 3).join(', ');
 const extra = names.length > 3 ? ` +${names.length - 3} mais` : '';
 const full = names.join(', ');
 return <span title={full} className="text-sm text-gray-700">{preview}{extra}</span>;
 })()}
 </td>
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
