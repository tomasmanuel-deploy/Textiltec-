import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useAppSettings } from '@/context/AppSettingsContext';

export default function ActivateAccount() {
  const router = useRouter();
  const { language } = useAppSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    code: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.email.trim() || !formData.code.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);

    try {
      // Mock activation check
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao ativar a conta.');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Código de ativação inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Ativar Conta | Prakash Software">
      <Head>
        <title>ATIVAR CONTA | PRAKASH SOFTWARE</title>
      </Head>

      <div className="min-h-screen flex transition-colors duration-300">
        {/* Left Section: Image Cover (Hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/2 relative bg-blue-900">
          <img
            src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1200"
            alt="Faturação e Finanças"
            className="w-full h-full object-cover grayscale opacity-30"
          />
          <div className="absolute inset-0 flex flex-col justify-end p-12 text-white bg-blue-955/65">
            <h2 className="text-3xl font-bold uppercase tracking-wider mb-2">Prakash Software</h2>
            <p className="text-sm text-gray-300 max-w-md">
              Ativação de conta rápida. Insira seu e-mail e o código recebido para ativar permanentemente sua empresa no sistema de faturação.
            </p>
          </div>
        </div>

        {/* Right Section: Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full">
            {/* Header Title */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                Ativar Conta
              </h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Insira o seu email e o código de ativação enviado para o seu correio eletrônico.
              </p>
            </div>

            {/* Form Container */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
              {error && (
                <div className="border border-red-300 bg-red-50 dark:bg-red-955/20 text-red-750 dark:text-red-400 p-3 mb-4 text-xs font-medium">
                  {error}
                </div>
              )}

              {success && (
                <div className="border border-green-300 bg-green-50 dark:bg-green-955/20 text-green-755 dark:text-green-400 p-3 mb-4 text-xs font-semibold">
                  Conta ativada com sucesso! Redirecionando para o login...
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">EMAIL DA CONTA *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="admin@empresa.ao"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">CÓDIGO DE ATIVAÇÃO *</label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="Insira o código de ativação"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.code}
                    onChange={handleChange}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || success}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Ativando...' : 'Ativar Minha Conta'}
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                  <span className="flex-shrink mx-2 text-gray-400 text-xs font-semibold uppercase">ou</span>
                  <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                </div>

                <Link href="/login" className="block w-full text-center py-2 border border-gray-300 bg-white text-gray-750 hover:bg-gray-50 text-sm font-medium transition-colors">
                  Voltar para o Login
                </Link>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
