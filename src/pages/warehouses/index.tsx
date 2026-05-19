import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useConfirm, usePrompt } from '@/context/DialogContext';

interface Warehouse {
 id: string;
 name: string;
 code: string;
 address?: string;
 status: 'active' | 'inactive';
}

export default function WarehousesPage() {
  const confirm = useConfirm();
  const prompt = usePrompt();
 const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
 const [loading, setLoading] = useState(false);
 const [form, setForm] = useState({ name: '', code: '', address: '', status: 'active' as 'active' | 'inactive' });
 const [error, setError] = useState<string | null>(null);
 const [search, setSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

 const fetchWarehouses = async () => {
 setLoading(true);
 setError(null);
 try {
 const params = new URLSearchParams();
 if (search.trim()) params.set('search', search.trim());
 if (statusFilter !== 'all') params.set('status', statusFilter);
 const res = await fetch(`/api/warehouses?${params.toString()}`);
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao carregar armazéns');
 setWarehouses(data.warehouses || []);
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro interno');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchWarehouses();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 const onSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setError(null);
 try {
 const res = await fetch('/api/warehouses', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(form)
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao criar armazém');
 setForm({ name: '', code: '', address: '', status: 'active' });
 await fetchWarehouses();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro ao criar');
 }
 };

 const toggleStatus = async (w: Warehouse) => {
 setError(null);
 try {
 const res = await fetch(`/api/warehouses/${w.id}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ status: w.status === 'active' ? 'inactive' : 'active' })
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao atualizar estado');
 await fetchWarehouses();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro ao atualizar');
 }
 };

 const deleteWarehouse = async (w: Warehouse) => {
 if (!await confirm(`Remover armazém "${w.name}"?`)) return;
 setError(null);
 try {
 const res = await fetch(`/api/warehouses/${w.id}`, { method: 'DELETE' });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao remover');
 await fetchWarehouses();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Erro ao remover');
 }
 };

 return (
 <Layout>
 <Head>
 <title>Armazéns</title>
 </Head>
 <div className="p-6">
 {/* Breadcrumbs e voltar */}
 <div className="flex items-center justify-between mb-4">
 <nav className="text-sm text-gray-600">
 <Link href="/" className="hover:underline">Início</Link>
 <span className="mx-2">/</span>
 <Link href="/warehouse" className="hover:underline">Gestão de Armazém</Link>
 <span className="mx-2">/</span>
 <span className="text-gray-900">Armazéns</span>
 </nav>
 <Link href="/warehouse" className="inline-flex items-center gap-2 px-3 py-2 border rounded hover:bg-gray-50">
 <span>←</span>
 <span>Voltar</span>
 </Link>
 </div>

 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-semibold mb-1">Armazéns</h1>
 <p className="text-gray-600">Gestão de locais e endereços de stock.</p>
 </div>
 <div className="flex gap-2">
 <Link href="/inventory" className="text-blue-600 hover:underline">Ver Inventário</Link>
 <Link href="/transfers" className="text-blue-600 hover:underline">Transferências</Link>
 </div>
 </div>

 <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="md:col-span-1 border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Novo Armazém</h2>
 {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
 <form onSubmit={onSubmit} className="space-y-3">
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
 <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Guardar</button>
 </form>
 </div>

 <div className="md:col-span-2">
 <div className="flex gap-2 mb-3">
 <input placeholder="Pesquisar..." className="border rounded px-3 py-2 flex-1" value={search} onChange={e => setSearch(e.target.value)} />
 <select className="border rounded px-3 py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
 <option value="all">Todos</option>
 <option value="active">Ativos</option>
 <option value="inactive">Inativos</option>
 </select>
 <button onClick={fetchWarehouses} className="border px-3 py-2 rounded">Filtrar</button>
 </div>

 <div className="border rounded">
 <table className="w-full">
 <thead>
 <tr className="bg-gray-100 text-left">
 <th className="px-4 py-2">Nome</th>
 <th className="px-4 py-2">Código</th>
 <th className="px-4 py-2">Endereço</th>
 <th className="px-4 py-2">Estado</th>
 <th className="px-4 py-2">Ações</th>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
 ) : warehouses.length === 0 ? (
 <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nenhum armazém encontrado</td></tr>
 ) : (
 warehouses.map(w => (
 <tr key={w.id} className="border-t">
 <td className="px-4 py-2">
 <Link href={`/warehouses/${w.id}`} className="text-blue-700 hover:underline">{w.name}</Link>
 </td>
 <td className="px-4 py-2">{w.code}</td>
 <td className="px-4 py-2">{w.address || '-'}</td>
 <td className="px-4 py-2">
 <span className={w.status === 'active' ? 'text-green-700' : 'text-gray-500'}>{w.status === 'active' ? 'Ativo' : 'Inativo'}</span>
 </td>
 <td className="px-4 py-2 flex gap-3 items-center">
 <button onClick={() => toggleStatus(w)} className="text-blue-600 hover:underline">Alternar estado</button>
 <Link href={`/inventory?warehouse=${encodeURIComponent(w.id)}`} className="text-blue-600 hover:underline">Abrir inventário</Link>
 <button onClick={() => deleteWarehouse(w)} className="text-red-600 hover:underline">Remover</button>
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
