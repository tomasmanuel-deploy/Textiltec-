import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';

export default function LicenseManager() {
  const router = useRouter();
 const toast = useToast();
  const { id } = router.query;
  const [license, setLicense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newExpiry, setNewExpiry] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/companies/${id}/license`)
      .then(res => res.json())
      .then(data => {
        setLicense(data);
        if (data.expiresAt) {
          setNewExpiry(new Date(data.expiresAt).toISOString().split('T')[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpdate = async () => {
    try {
      const res = await fetch(`/api/admin/companies/${id}/license`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          expiresAt: new Date(newExpiry).toISOString(),
          type: license.type,
          status: 'active'
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setLicense(updated);
        toast.info('Licença atualizada com sucesso!');
      } else {
        toast.info('Erro ao atualizar licença');
      }
    } catch (e) {
      console.error(e);
      toast.info('Erro ao atualizar licença');
    }
  };

  if (loading) return <Layout><div>Carregando...</div></Layout>;

  return (
    <Layout>
      <Head>
        <title>Gerenciar Licença | Admin</title>
      </Head>

      <div className="max-w-2xl mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Gerenciamento de Licença</h1>

        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Chave da Licença</label>
            <div className="mt-1 p-2 bg-gray-50 border rounded text-xs font-mono break-all">
              {license?.key || 'Nenhuma chave gerada'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de Licença</label>
              <select 
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                value={license?.type || 'TRIAL'}
                onChange={(e) => setLicense({...license, type: e.target.value})}
              >
                <option value="TRIAL">Trial (Teste)</option>
                <option value="STANDARD">Standard</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data de Expiração</label>
              <input
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={() => router.back()}
              className="mr-3 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              onClick={handleUpdate}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
