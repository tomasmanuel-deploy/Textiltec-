import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useAppSettings } from '@/context/AppSettingsContext';

export default function NewCompany() {
 const router = useRouter();
 const { language } = useAppSettings();
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const [formData, setFormData] = useState({
 name: '',
 tradeName: '',
 nif: '',
 email: '',
 phone: '',
 address: '',
 city: '',
 province: '',
 seriesBase: new Date().getFullYear().toString(),
 regime: 'Geral',
 });

 const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
 setFormData({ ...formData, [e.target.name]: e.target.value });
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setLoading(true);
 setError(null);

 try {
 const res = await fetch('/api/admin/companies', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(formData),
 });

 if (!res.ok) {
 const data = await res.json();
 throw new Error(data.error || 'Erro ao criar empresa');
 }

 router.push('/admin/dashboard');
 } catch (err: any) {
 setError(err.message);
 } finally {
 setLoading(false);
 }
 };

 return (
 <Layout>
 <Head>
 <title>Nova Empresa | Admin</title>
 </Head>

 <div className="max-w-2xl mx-auto py-8">
 <h1 className="text-2xl font-bold mb-6">Cadastrar Nova Empresa</h1>

 {error && (
 <div className="bg-red-50 text-red-700 p-4 rounded mb-6">
 {error}
 </div>
 )}

 <form onSubmit={handleSubmit} className="bg-white shadow p-6 space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome da Empresa *</label>
 <input
 type="text"
 name="name"
 required
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.name}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome Comercial</label>
 <input
 type="text"
 name="tradeName"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.tradeName}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">NIF *</label>
 <input
 type="text"
 name="nif"
 required
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.nif}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Email</label>
 <input
 type="email"
 name="email"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.email}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Telefone</label>
 <input
 type="text"
 name="phone"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.phone}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Cidade</label>
 <input
 type="text"
 name="city"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.city}
 onChange={handleChange}
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700">Endereço</label>
 <input
 type="text"
 name="address"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.address}
 onChange={handleChange}
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
 <div>
 <label className="block text-sm font-medium text-gray-700">Série Base (Ano)</label>
 <input
 type="number"
 name="seriesBase"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.seriesBase}
 onChange={handleChange}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Regime Fiscal</label>
 <select
 name="regime"
 className="mt-1 block w-full border border-gray-300 rounded-md p-2"
 value={formData.regime}
 onChange={handleChange}
 >
 <option value="Geral">Regime Geral</option>
 <option value="Simplificado">Regime Simplificado</option>
 <option value="Exclusão">Regime de Exclusão</option>
 </select>
 </div>
 </div>

 <div className="flex justify-end pt-4">
 <button
 type="button"
 onClick={() => router.back()}
 className="mr-3 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
 >
 Cancelar
 </button>
 <button
 type="submit"
 disabled={loading}
 className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
 >
 {loading ? 'Salvando...' : 'Cadastrar Empresa'}
 </button>
 </div>
 </form>
 </div>
 </Layout>
 );
}

