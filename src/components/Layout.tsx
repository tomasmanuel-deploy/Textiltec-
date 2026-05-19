import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useState, useEffect } from 'react';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { OnlineStatus } from '@/components/OnlineStatus';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title = 'Prakash' }: LayoutProps) {
  const router = useRouter();
  const isHome = router.pathname === '/';
  const { language } = useAppSettings();
  
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const isPublicRoute = ['/login', '/register-company', '/license', '/forgot-password', '/activate-account'].includes(router.pathname);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const session = localStorage.getItem('user_session');
      const active = !!session;
      setHasSession(active);
      setCheckingSession(false);

      if (!active && !isPublicRoute) {
        router.replace('/login');
      }
    }
  }, [router.pathname, isPublicRoute]);

  const handleLogout = () => {
    localStorage.removeItem('user_session');
    setHasSession(false);
    router.push('/login');
  };

  const isActive = (path: string) => {
    return router.pathname.startsWith(path);
  };

  // If page is private and session is checking/not present, prevent mounting content and show loading
  if (!isPublicRoute && (checkingSession || !hasSession)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-sm font-mono text-gray-500 dark:text-gray-400">Verificando sessão...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Prakash · Sistema de Faturação profissional certificado pela AGT" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Navigation Header only shown for authenticated private routes */}
        {!isPublicRoute && hasSession && (
          <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
            <div className="container mx-auto px-4">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center space-x-6 md:space-x-8">
                  <div className="flex items-center gap-3">
                    {!isHome && (
                      <button
                        type="button"
                        onClick={() => router.push('/')}
                        aria-label={t('nav.back', language)}
                        className="inline-flex h-8 w-8 items-center justify-center border border-gray-300 bg-white text-gray-700 dark:text-gray-100 dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    <Link href="/" className="ml-1 md:ml-2 text-2xl md:text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                      Prakash
                    </Link>
                    <span className="hidden sm:inline-flex items-center border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-900">
                      {t('nav.agtCertified', language)}
                    </span>
                  </div>

                  <div className="hidden md:flex space-x-1">
                    <Link
                      href="/clients"
                      className={`px-3 py-2 text-sm font-medium transition-colors ${isActive('/clients')
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-b-2 border-blue-600'
                          : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                    >
                      {t('nav.clients', language)}
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <OnlineStatus />
                  <Link
                    href="/settings"
                    className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${isActive('/settings')
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    title={t('nav.settings', language)}
                  >
                    <span className="hidden sm:inline">{t('nav.settings', language)}</span>
                  </Link>


                  <Link
                    href="/documents/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium transition-colors dark:bg-blue-600 dark:hover:bg-blue-700"
                  >
                    {t('nav.newInvoice', language)}
                  </Link>
                  
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 text-sm font-semibold text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 transition-colors flex items-center gap-1.5 border border-transparent"
                    title="Sair da Conta"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="hidden sm:inline">Sair</span>
                  </button>


                </div>
              </div>
            </div>
          </nav>
        )}

        {/* Main Content */}
        <main className={isPublicRoute ? "" : "container mx-auto px-4 py-6 text-gray-900 dark:text-gray-100"}>
          {children}
        </main>
      </div>
    </>
  );
}
