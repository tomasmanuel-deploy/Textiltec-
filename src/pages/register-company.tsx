import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';

export default function RegisterCompany() {
  const router = useRouter();
  const { language } = useAppSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    nif: '',
    email: '',
    password: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateNIF = (nif: string) => {
    const cleanNif = nif.trim();
    return /^\d{9}$/.test(cleanNif) || cleanNif.length >= 8;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple validation
    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim() || !formData.nif.trim() || !formData.email.trim() || !formData.password.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!validateNIF(formData.nif)) {
      setError('NIF inválido. Deve conter pelo menos 9 dígitos.');
      return;
    }

    if (formData.password.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      // Register company & user owner
      const res = await fetch('/api/settings/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao cadastrar a empresa');
      }

      const result = await res.json();
      const createdCompany = result.company;

      // Automatically select the newly created company
      if (createdCompany && createdCompany.id) {
        await fetch('/api/settings/company/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: createdCompany.id }),
        }).catch(err => console.warn('Failed to auto-select company:', err));
      }

      // Save dummy login session in localStorage for auth mock
      localStorage.setItem('user_session', JSON.stringify({
        email: formData.email,
        name: formData.name,
        companyId: createdCompany?.id
      }));

      setSuccess(true);
      setTimeout(() => {
        router.push('/settings');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao registar a empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title={t('home.title', language)}>
      <Head>
        <title>REGISTRAR EMPRESA | PRAKASH SOFTWARE</title>
        <meta name="description" content="Cadastre sua empresa e comece a faturar em conformidade com as regras da AGT." />
      </Head>

      <div className="min-h-screen flex transition-colors duration-300">
        {/* Left Section: Image Cover (Hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/2 relative bg-blue-900">
          <img
            src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1200"
            alt="Faturação e Finanças"
            className="w-full h-full object-cover grayscale opacity-30"
          />
          <div className="absolute inset-0 flex flex-col justify-end p-12 text-white bg-blue-950/65">
            <h2 className="text-3xl font-bold uppercase tracking-wider mb-2">Prakash Software</h2>
            <p className="text-sm text-gray-300 max-w-md">
              Sistema de faturação profissional certificado pela AGT. Rápido, seguro e em conformidade com as normas fiscais vigentes.
            </p>
          </div>
        </div>

        {/* Right Section: Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full">
            {/* Header Title */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                Registrar Empresa
              </h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Preencha os 6 dados necessários para o cadastro da sua empresa.
              </p>
            </div>

            {/* Form Container */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
              {error && (
                <div className="border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-750 dark:text-red-400 p-3 mb-4 text-xs font-medium">
                  {error}
                </div>
              )}

              {success && (
                <div className="border border-green-300 bg-green-50 dark:bg-green-950/20 text-green-755 dark:text-green-400 p-3 mb-4 text-xs font-semibold">
                  Empresa registrada com sucesso! Redirecionando...
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">NOME DA EMPRESA *</label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Ex: Prakash Lda."
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">NIF (NÚMERO DE IDENTIFICAÇÃO FISCAL) *</label>
                  <input
                    type="text"
                    name="nif"
                    required
                    placeholder="Ex: 541000000"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.nif}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">TELEFONE *</label>
                  <input
                    type="text"
                    name="phone"
                    required
                    placeholder="Ex: 923 000 000"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ENDEREÇO COMPLETO *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    placeholder="Ex: Avenida Deolinda Rodrigues, Luanda"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">EMAIL ADMINISTRADOR *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="Ex: admin@empresa.ao"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">SENHA DE ACESSO *</label>
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-755 text-gray-900 dark:text-white text-sm"
                    value={formData.password}
                    onChange={handleChange}
                  />
                </div>

                <div className="pt-2 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-4 py-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
                  >
                    Voltar
                  </button>

                  <button
                    type="submit"
                    disabled={loading || success}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Registrando...' : 'Registrar Empresa'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
