import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';

interface IClient {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email?: string;
  phone?: string;
  clientType: 'individual' | 'company';
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export default function ClientDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [client, setClient] = useState<IClient | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (id) {
      fetchClient();
    }
  }, [id]);

  const fetchClient = async () => {
    setLoading(true);
    try {
      const clientId = Array.isArray(id) ? id[0] : id;
      const response = await fetch(`/api/clients/${clientId}`);
      
      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
      } else {
        console.error('Cliente não encontrado');
      }
    } catch (error) {
      console.error('Erro ao carregar cliente:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status: string): string => {
    switch(status) {
      case 'active': return 'bg-success/20 text-success';
      case 'inactive': return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch(status) {
      case 'active': return 'Ativo';
      case 'inactive': return 'Inativo';
      default: return status;
    }
  };

  const getClientTypeLabel = (type: string): string => {
    switch(type) {
      case 'individual': return 'Individual';
      case 'company': return 'Empresa';
      default: return type;
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('pt-AO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500 dark:text-white">Carregando cliente...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">Cliente não encontrado</h2>
          <p className="text-gray-600 dark:text-white mb-4">O cliente solicitado não existe ou foi removido.</p>
          <Link href="/clients">
            <Button variant="primary">
              Voltar para Clientes
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{client.name} | Prakash</title>
      </Head>
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{client.name}</h1>
            <div className="flex items-center mt-1">
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusClass(client.status)} mr-2`}>
                {getStatusLabel(client.status)}
              </span>
              <span className="text-gray-600 dark:text-white">{getClientTypeLabel(client.clientType)}</span>
            </div>
          </div>
          
          <div className="mt-4 md:mt-0 flex space-x-3">
            <Link href={`/clients/${client.id}/edit`}>
              <Button variant="secondary">
                Editar
              </Button>
            </Link>
            <Link href="/clients">
              <Button variant="secondary">
                Voltar
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Informações Básicas</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Nome:</span>
                  <span className="font-medium">{client.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">NIF:</span>
                  <span className="font-medium">{client.nif}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Tipo:</span>
                  <span>{getClientTypeLabel(client.clientType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Estado:</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusClass(client.status)}`}>
                    {getStatusLabel(client.status)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Informações de Contacto</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Email:</span>
                  <span className="font-medium">{client.email || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Telefone:</span>
                  <span className="font-medium">{client.phone || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Endereço</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Endereço:</span>
                  <span className="font-medium">{client.address}</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-800 dark:text-white">Informações do Sistema</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Criado em:</span>
                  <span className="font-medium">{formatDate(client.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-white">Última atualização:</span>
                  <span className="font-medium">{formatDate(client.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Documents Section */}
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-800 dark:text-white">Documentos Relacionados</h2>
          </div>
          <div className="p-6">
            <p className="text-gray-500 dark:text-white text-center py-8">
              Funcionalidade de documentos relacionados será implementada em breve.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}