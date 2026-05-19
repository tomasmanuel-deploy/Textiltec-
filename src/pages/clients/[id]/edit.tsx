import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import Button from '@/components/ui/Button';

interface Client {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email?: string;
  phone?: string;
  clientType: 'individual' | 'company';
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function EditClient() {
  const router = useRouter();
 const toast = useToast();
  const { id } = router.query;
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [formData, setFormData] = useState<{
    name: string;
    tradeName: string;
    nif: string;
    email: string;
    phone: string;
    address: string;
    clientType: 'individual' | 'company';
    status: 'active' | 'inactive';
    notes: string;
  }>({
    name: '',
    tradeName: '',
    nif: '',
    email: '',
    phone: '',
    address: '',
    clientType: 'company',
    status: 'active',
    notes: ''
  });

  const fetchClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      const data = await response.json();
      
      if (response.ok) {
        setClient(data.client);
        setFormData({
          name: data.client.name || '',
          tradeName: data.client.tradeName || '',
          nif: data.client.nif || '',
          email: data.client.email || '',
          phone: data.client.phone || '',
          address: data.client.address || '',
          clientType: data.client.clientType || 'company',
          status: data.client.status || 'active',
          notes: data.client.notes || ''
        });
      } else {
        setError(data.error || 'Cliente não encontrado');
      }
    } catch (error) {
      console.error('Error fetching client:', error);
      setError('Erro ao carregar cliente');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      const clientId = Array.isArray(id) ? id[0] : id;
      fetchClient(clientId);
    }
  }, [id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateNif = (nif: string): boolean => {
    // Basic NIF validation for Angola (9 digits for individuals, 10 for companies)
    return /^\d{9,10}$/.test(nif);
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true; // Phone is optional
    // Basic phone validation for Angola
    return /^\+244\s\d{3}\s\d{3}\s\d{3}$/.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!validateNif(formData.nif)) {
      toast.info('NIF deve ter 9 ou 10 dígitos.');
      return;
    }
    
    if (!validateEmail(formData.email)) {
      toast.info('Email inválido.');
      return;
    }
    
    if (!validatePhone(formData.phone)) {
      toast.info('Telefone deve estar no formato: +244 XXX XXX XXX');
      return;
    }
    
    setSaving(true);
    
    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        toast.info('Cliente atualizado com sucesso!');
        router.push(`/clients/${id}`);
      } else {
        toast.info(data.error || 'Erro ao atualizar cliente');
      }
    } catch (error) {
      console.error('Error updating client:', error);
      toast.info('Erro ao atualizar cliente. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Carregando...">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500 dark:text-white">Carregando cliente...</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!client || error) {
    return (
      <Layout title="Cliente não encontrado">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Cliente não encontrado</h1>
            <p className="text-gray-600 dark:text-white mb-6">{error || 'O cliente solicitado não existe.'}</p>
            <Link href="/clients">
              <Button variant="primary">Voltar para Clientes</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Editar Cliente: ${client.name} | Prakash Billing System`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Editar Cliente</h1>
            <p className="text-gray-600 dark:text-white">
              {client.name} - NIF: {client.nif}
            </p>
          </div>
          <div className="flex space-x-3">
            <Link href={`/clients/${client.id}`}>
              <Button variant="secondary">
                Cancelar
              </Button>
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-800 dark:text-white mb-4">Informações Básicas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Nome completo ou razão social"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Nome Comercial
                </label>
                <input
                  type="text"
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Nome comercial (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  NIF *
                </label>
                <input
                  type="text"
                  name="nif"
                  value={formData.nif}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="123456789"
                  maxLength={10}
                  required
                />
                <p className="text-xs text-gray-500 dark:text-white mt-1">9-10 dígitos</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Tipo de Cliente *
                </label>
                <select
                  name="clientType"
                  value={formData.clientType}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  required
                >
                  <option value="company">Empresa</option>
                  <option value="individual">Individual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="cliente@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="+244 923 456 789"
                />
                <p className="text-xs text-gray-500 dark:text-white mt-1">Formato: +244 XXX XXX XXX</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Endereço *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Rua, número, bairro, cidade"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-white mb-1">
                  Notas
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Notas adicionais sobre o cliente (opcional)"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Link href={`/clients/${client.id}`}>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </Link>
            <Button 
              variant="primary" 
              type="submit"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}