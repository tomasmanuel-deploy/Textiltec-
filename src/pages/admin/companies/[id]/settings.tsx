import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

interface Series {
  code: string;
  name: string;
  documentType: string;
  year: number;
  startNumber: number;
  currentNumber: number;
  active: boolean;
  isDefault?: boolean;
}

export default function CompanySettings() {
  const router = useRouter();
 const toast = useToast();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<Series[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      try {
        const [compRes, seriesRes] = await Promise.all([
          fetch(`/api/admin/companies/${id}`),
          fetch(`/api/admin/companies/${id}/series`)
        ]);

        if (!compRes.ok) throw new Error('Failed to load company');
        const compData = await compRes.json();
        setCompany(compData);

        if (seriesRes.ok) {
          const seriesData = await seriesRes.json();
          setSeries(seriesData.series || []);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const [showAddSeriesForm, setShowAddSeriesForm] = useState(false);
  const [newSeries, setNewSeries] = useState({
    code: '',
    name: '',
    documentType: 'FT',
    year: new Date().getFullYear(),
    startNumber: 1
  });

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/companies/${id}/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSeries),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create series');
      }
      
      const data = await res.json();
      setSeries([...series, data.series]);
      setShowAddSeriesForm(false);
      setNewSeries({
        code: '',
        name: '',
        documentType: 'FT',
        year: new Date().getFullYear(),
        startNumber: 1
      });
      toast.info('Série criada com sucesso!');
    } catch (err: any) {
      toast.info(err.message);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });

      if (!res.ok) throw new Error('Failed to update company');
      toast.info('Dados da empresa atualizados com sucesso!');
    } catch (err: any) {
      toast.info(err.message);
    }
  };

  const handleToggleSeries = async (s: Series) => {
    try {
      const res = await fetch(`/api/admin/companies/${id}/series`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: s.code,
          year: s.year,
          active: !s.active
        }),
      });

      if (!res.ok) throw new Error('Failed to update series');
      
      // Update local state
      setSeries(series.map(item => 
        item.code === s.code && item.year === s.year 
          ? { ...item, active: !item.active } 
          : item
      ));
    } catch (err: any) {
      toast.info(err.message);
    }
  };

  if (loading) return <Layout><div>Carregando...</div></Layout>;
  if (error) return <Layout><div className="text-red-600">{error}</div></Layout>;

  return (
    <Layout>
      <Head>
        <title>Configurações - {company?.name} | Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Configurações da Empresa</h1>
          <Link href={`/admin/companies/${id}`} className="text-blue-600 hover:text-blue-800">
            &larr; Voltar para Detalhes
          </Link>
        </div>

        {/* Company Info Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Dados Cadastrais</h2>
          <form onSubmit={handleUpdateCompany} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input
                  type="text"
                  value={company?.name || ''}
                  onChange={e => setCompany({...company, name: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nome Comercial</label>
                <input
                  type="text"
                  value={company?.tradeName || ''}
                  onChange={e => setCompany({...company, tradeName: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">NIF</label>
                <input
                  type="text"
                  value={company?.nif || ''}
                  onChange={e => setCompany({...company, nif: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-gray-50"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={company?.email || ''}
                  onChange={e => setCompany({...company, email: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Telefone</label>
                <input
                  type="text"
                  value={company?.phone || ''}
                  onChange={e => setCompany({...company, phone: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
               <div>
                <label className="block text-sm font-medium text-gray-700">Endereço</label>
                <input
                  type="text"
                  value={company?.address || ''}
                  onChange={e => setCompany({...company, address: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>

        {/* Series Management */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">Séries de Documentos</h2>
            <button
              onClick={() => setShowAddSeriesForm(!showAddSeriesForm)}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              {showAddSeriesForm ? 'Cancelar' : '+ Nova Série'}
            </button>
          </div>
          
          {showAddSeriesForm && (
            <div className="mb-6 bg-gray-50 p-4 rounded-md border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Nova Série</h3>
              <form onSubmit={handleCreateSeries} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500">Tipo Documento</label>
                  <select
                    value={newSeries.documentType}
                    onChange={e => setNewSeries({...newSeries, documentType: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                  >
                    {['FT', 'FR', 'NC', 'ND', 'RC', 'RG', 'VD'].map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Código da Série</label>
                  <input
                    type="text"
                    value={newSeries.code}
                    onChange={e => setNewSeries({...newSeries, code: e.target.value.toUpperCase()})}
                    placeholder="Ex: 2024"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Nome (Opcional)</label>
                  <input
                    type="text"
                    value={newSeries.name}
                    onChange={e => setNewSeries({...newSeries, name: e.target.value})}
                    placeholder="Ex: Série Principal"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Ano</label>
                  <input
                    type="number"
                    value={newSeries.year}
                    onChange={e => setNewSeries({...newSeries, year: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Número Inicial</label>
                  <input
                    type="number"
                    value={newSeries.startNumber}
                    onChange={e => setNewSeries({...newSeries, startNumber: parseInt(e.target.value)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                    min="1"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                  >
                    Criar Série
                  </button>
                </div>
              </form>
            </div>
          )}
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ano</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sequência Atual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {series.map((s, idx) => (
                  <tr key={`${s.code}-${s.year}-${idx}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">{s.documentType.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{s.code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.year}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.currentNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        s.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {s.active ? 'Ativo' : 'Inativo'}
                      </span>
                      {s.isDefault && (
                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          Padrão
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleToggleSeries(s)}
                        className={`text-${s.active ? 'red' : 'green'}-600 hover:text-${s.active ? 'red' : 'green'}-900`}
                      >
                        {s.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tbody className="bg-white divide-y divide-gray-200">
                {series.map((s) => (
                  <tr key={`${s.code}-${s.year}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.documentType}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.code}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.year}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.currentNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => handleToggleSeries(s)}
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          s.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {s.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                  </tr>
                ))}
                {series.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      Nenhuma série encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
