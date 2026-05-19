import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Button from '@/components/ui/Button';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';

interface FormData {
 name: string;
 tradeName: string;
 nif: string;
 address: string;
 email: string;
 phone: string;
 clientType: 'individual' | 'company';
 notes: string;
}

export default function NewClient() {
 const router = useRouter();
 const toast = useToast();
 const [saving, setSaving] = useState(false);
 const [formData, setFormData] = useState<FormData>({
 name: '',
 tradeName: '',
 nif: '',
 address: '',
 email: '',
 phone: '',
 clientType: 'company',
 notes: ''
 });

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
 const { name, value } = e.target;
 setFormData({
 ...formData,
 [name]: value
 });
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSaving(true);
 
 try {
 const response = await fetch('/api/clients', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(formData),
 });

 if (!response.ok) {
 const errorData = await response.json();
 throw new Error(errorData.error || 'Erro ao criar cliente');
 }

 const result = await response.json();
 console.log('Cliente criado com sucesso:', result);
 
 // Show success message
 toast.success('Cliente criado com sucesso!');
 
 // Redirect to the clients list page
 router.push('/clients');
 } catch (error) {
 console.error('Erro ao criar cliente:', error);
 toast.info(`Erro ao criar cliente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
 } finally {
 setSaving(false);
 }
 };

 return (
 <Layout>
 <Head>
 <title>Novo Cliente - Prakash</title>
 </Head>

 <div className="max-w-4xl mx-auto">
 {/* Header */}
 <div className="mb-8">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Novo Cliente</h1>
 <p className="mt-2 text-gray-600 dark:text-white">Criar um novo cliente no sistema</p>
 </div>
 <Link href="/clients">
 <Button variant="secondary">
 Voltar à Lista
 </Button>
 </Link>
 </div>
 </div>

 {/* Form */}
 <div className="bg-white dark:bg-gray-900 ">
 <form onSubmit={handleSubmit} className="p-6 space-y-6">
 {/* Client Type */}
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Tipo de Cliente *
 </label>
 <select
 name="clientType"
 value={formData.clientType}
 onChange={handleInputChange}
 required
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 >
 <option value="company">Empresa</option>
 <option value="individual">Pessoa Física</option>
 </select>
 </div>

 {/* Basic Information */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Nome {formData.clientType === 'company' ? 'da Empresa' : 'Completo'} *
 </label>
 <input
 type="text"
 name="name"
 value={formData.name}
 onChange={handleInputChange}
 required
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder={formData.clientType === 'company' ? 'Nome oficial da empresa' : 'Nome completo do cliente'}
 />
 </div>

 {formData.clientType === 'company' && (
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Nome Comercial
 </label>
 <input
 type="text"
 name="tradeName"
 value={formData.tradeName}
 onChange={handleInputChange}
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder="Nome comercial ou fantasia"
 />
 </div>
 )}

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 NIF *
 </label>
 <input
 type="text"
 name="nif"
 value={formData.nif}
 onChange={handleInputChange}
 required
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder={formData.clientType === 'company' ? 'NIF da empresa' : 'NIF do cliente'}
 />
 </div>
 </div>

 {/* Address */}
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Endereço *
 </label>
 <input
 type="text"
 name="address"
 value={formData.address}
 onChange={handleInputChange}
 required
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder="Endereço completo"
 />
 </div>

 {/* Contact Information */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Email
 </label>
 <input
 type="email"
 name="email"
 value={formData.email}
 onChange={handleInputChange}
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder="email@exemplo.com"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Telefone
 </label>
 <input
 type="tel"
 name="phone"
 value={formData.phone}
 onChange={handleInputChange}
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder="+244 9XX XXX XXX"
 />
 </div>
 </div>

 {/* Notes */}
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
 Observações
 </label>
 <textarea
 name="notes"
 value={formData.notes}
 onChange={handleInputChange}
 rows={4}
 className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
 placeholder="Informações adicionais sobre o cliente..."
 />
 </div>

 {/* Form Actions */}
 <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
 <Link href="/clients">
 <Button variant="secondary" type="button">
 Cancelar
 </Button>
 </Link>
 <Button 
 type="submit" 
 variant="primary"
 disabled={saving}
 >
 {saving ? 'Criando...' : 'Criar Cliente'}
 </Button>
 </div>
 </form>
 </div>
 </div>
 </Layout>
 );
}
