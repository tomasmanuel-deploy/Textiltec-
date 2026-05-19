import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Link from 'next/link';

interface Company {
  id: string;
  name: string;
  nif: string;
  email?: string;
  phone?: string;
  address?: string;
  seriesBase?: string;
  regime?: string;
  createdAt: string;
  recentDocuments?: any[];
}

export default function CompanyDetails() {
  const router = useRouter();
  const { id } = router.query;
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/companies/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load company');
        return res.json();
      })
      .then(setCompany)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Layout><div>Carregando...</div></Layout>;
  if (!company) return <Layout><div>Empresa não encontrada</div></Layout>;

  return (
    <Layout>
      <Head>
        <title>{company.name} | Admin</title>
      </Head>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">{company.name}</h1>
          <div className="space-x-2">
            <Link href={`/admin/companies/${id}/settings`} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Configurações
            </Link>
            <Link href={`/admin/companies/${id}/license`} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
              Gerenciar Licença
            </Link>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Informações Gerais</h3>
          </div>
          <dl className="divide-y divide-gray-200">
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">NIF</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.nif}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.email || '-'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Telefone</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.phone || '-'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Endereço</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.address || '-'}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Série Base</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.seriesBase}</dd>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
              <dt className="text-sm font-medium text-gray-500">Regime</dt>
              <dd className="text-sm text-gray-900 col-span-2">{company.regime}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Histórico de Documentos</h3>
            {company.recentDocuments && company.recentDocuments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status AGT</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hash</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {company.recentDocuments.map((doc: any) => (
                      <tr key={doc.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {doc.documentType} {doc.series}/{doc.sequentialNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(doc.issueDate).toLocaleString('pt-PT')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(doc.totals.total)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${doc.agtSubmission?.status === 'success' ? 'bg-green-100 text-green-800' : 
                              doc.agtSubmission?.status === 'error' ? 'bg-red-100 text-red-800' : 
                              doc.agtSubmission?.status === 'offline_pending' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-100 text-yellow-800'}`}>
                            {doc.agtSubmission?.status || 'pendente'}
                          </span>
                        </td>
                         <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                          {doc.hash ? doc.hash.substring(0, 4) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">Nenhum documento recente.</p>
            )}
        </div>
      </div>
    </Layout>
  );
}
