import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/DialogContext';

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

const EMPTY_FORM = {
  name: '',
  tradeName: '',
  nif: '',
  address: '',
  email: '',
  phone: '',
  clientType: 'company' as 'company' | 'individual',
};

export default function ClientsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [clients, setClients] = useState<IClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline form state
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '10',
        offset: String((currentPage - 1) * 10),
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });
      const response = await fetch(`/api/clients?${params}`);
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        const total = data.pagination?.total ?? 0;
        setTotalPages(Math.max(1, Math.ceil(total / 10)));
      }
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, statusFilter]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);
    if (!form.name.trim() || !form.nif.trim() || !form.address.trim()) {
      setFormError('Nome, NIF e Endereço são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Falha ao criar cliente');
        return;
      }
      setForm({ ...EMPTY_FORM });
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
      setCurrentPage(1);
      await fetchClients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao criar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ message: 'Eliminar este cliente? Esta acção não pode ser revertida.', variant: 'danger', confirmText: 'Eliminar' });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Falha ao eliminar cliente');
        return;
      }
      await fetchClients();
    } catch {
      toast.error('Erro ao eliminar cliente');
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusLabel = (s: string) =>
    s === 'active' ? 'Ativo' : s === 'inactive' ? 'Inativo' : s;

  const getTypeLabel = (t: string) =>
    t === 'individual' ? 'Individual' : t === 'company' ? 'Empresa' : t;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-AO');

  return (
    <Layout title="Clientes">
      <Head>
        <title>Clientes</title>
      </Head>
      <div className="p-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Clientes</h1>
            <p className="text-gray-600">Registo e gestão de clientes da empresa.</p>
          </div>
        </div>

        {/* Main grid: form left (1/3) + list right (2/3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* --- Inline registration form --- */}
          <div className="md:col-span-1 border border-gray-200 p-4 bg-gray-50 self-start">
            <h2 className="font-medium mb-3 text-gray-800">Novo Cliente</h2>
            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 mb-3">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 mb-3">
                Cliente criado com sucesso.
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <select
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  value={form.clientType}
                  onChange={e => setForm({ ...form, clientType: e.target.value as 'company' | 'individual' })}
                >
                  <option value="company">Empresa</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome *</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Nome completo"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome Comercial</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Opcional"
                  value={form.tradeName}
                  onChange={e => setForm({ ...form, tradeName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">NIF *</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Número de identificação fiscal"
                  value={form.nif}
                  onChange={e => setForm({ ...form, nif: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Endereço *</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Endereço"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Telefone</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                  placeholder="+244 9xx xxx xxx"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'A guardar...' : 'Criar Cliente'}
              </button>
            </form>
          </div>

          {/* --- Clients list --- */}
          <div className="md:col-span-2">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <input
                type="text"
                placeholder="Pesquisar por nome ou NIF..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[160px]"
              />
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
              <button
                onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCurrentPage(1); }}
                className="border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Limpar
              </button>
            </div>

            {/* Table */}
            <div className="border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2 font-medium text-gray-600">Cliente</th>
                    <th className="px-4 py-2 font-medium text-gray-600">NIF</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Contacto</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Criado</th>
                    <th className="px-4 py-2 font-medium text-gray-600 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        A carregar...
                      </td>
                    </tr>
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Nenhum cliente encontrado. Use o formulário ao lado para criar.
                      </td>
                    </tr>
                  ) : (
                    clients.map(client => (
                      <tr key={client.id} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{client.name}</div>
                          {client.tradeName && client.tradeName !== client.name && (
                            <div className="text-xs text-gray-500">{client.tradeName}</div>
                          )}
                          {client.email && (
                            <div className="text-xs text-gray-400">{client.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono text-xs">{client.nif}</td>
                        <td className="px-4 py-3 text-gray-600">{getTypeLabel(client.clientType)}</td>
                        <td className="px-4 py-3 text-gray-600">{client.phone || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-medium ${
                            client.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {getStatusLabel(client.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(client.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/clients/${client.id}/edit`}
                              className="border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 transition-colors"
                            >
                              Editar
                            </Link>
                            <button
                              onClick={() => handleDelete(client.id)}
                              disabled={deletingId === client.id}
                              className="border border-gray-300 px-3 py-1 text-xs hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              {deletingId === client.id ? '...' : 'Eliminar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                <span>Página {currentPage} de {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
