import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Inter } from 'next/font/google';
import { AppSettingsProvider } from '@/context/AppSettingsContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ToastProvider } from '@/context/ToastContext';
import { DialogProvider } from '@/context/DialogContext';
import { NotificationToast } from '@/components/ui/NotificationToast';
import { AgtSyncStatus } from '@/components/AgtSyncStatus';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const inter = Inter({ subsets: ['latin'] });

export default function App({ Component, pageProps }: AppProps) {
 const router = useRouter();
 const [checked, setChecked] = useState(false);
 const [valid, setValid] = useState<boolean | null>(null);
 const [licenseError, setLicenseError] = useState<string | null>(null);
 const [checkingLicense, setCheckingLicense] = useState(false);
 const [loading, setLoading] = useState(false);

 useEffect(() => {
   const handleStart = () => setLoading(true);
   const handleComplete = () => setLoading(false);

   router.events.on('routeChangeStart', handleStart);
   router.events.on('routeChangeComplete', handleComplete);
   router.events.on('routeChangeError', handleComplete);

   return () => {
     router.events.off('routeChangeStart', handleStart);
     router.events.off('routeChangeComplete', handleComplete);
     router.events.off('routeChangeError', handleComplete);
   };
 }, [router]);

 useEffect(() => {
 if (typeof window === 'undefined') return;
 let reloaded = false;
 const shouldReload = (msg: string) => {
 const m = String(msg || '').toLowerCase();
 return m.includes('chunkloaderror') || m.includes('loading chunk') || m.includes('failed to fetch dynamically imported module');
 };
 const onError = (e: any) => {
 const message = e?.message || e?.error?.message || '';
 if (reloaded) return;
 if (shouldReload(message)) {
 reloaded = true;
 window.location.reload();
 }
 };
 const onRejection = (e: any) => {
 const message = e?.reason?.message || e?.reason || '';
 if (reloaded) return;
 if (shouldReload(message)) {
 reloaded = true;
 window.location.reload();
 }
 };
 window.addEventListener('error', onError);
 window.addEventListener('unhandledrejection', onRejection);
 return () => {
 window.removeEventListener('error', onError);
 window.removeEventListener('unhandledrejection', onRejection);
 };
 }, []);

 useEffect(() => {
 let cancelled = false;
 const check = async (attempt = 1): Promise<void> => {
 if (cancelled) return;
 setCheckingLicense(true);
 setLicenseError(null);
 try {
 const ac = new AbortController();
 const timeout = setTimeout(() => ac.abort(), 8000);
 const res = await fetch('/api/license/status', { signal: ac.signal, cache: 'no-store' });
 clearTimeout(timeout);
 const j = await res.json();
 if (cancelled) return;
 const isValid = !!j.valid;
 setValid(isValid);
 setChecked(true);
 setCheckingLicense(false);
 setLicenseError(null);
 if (!isValid && router.pathname !== '/license') {
 router.replace('/license');
 }
 } catch (e: any) {
 if (cancelled) return;
 const msg = String(e?.message || '');
 if (msg.includes('AbortError') || msg.includes('aborted')) {
 if (attempt < 4) {
 const delay = attempt * 600;
 setTimeout(() => check(attempt + 1), delay);
 return;
 }
 setValid(null);
 setChecked(true);
 setCheckingLicense(false);
 setLicenseError('License check timed out. Retrying automatically.');
 return;
 }
 if (attempt < 3) {
 const delay = attempt * 400;
 setTimeout(() => check(attempt + 1), delay);
 return;
 }
 setValid(null);
 setChecked(true);
 setCheckingLicense(false);
 setLicenseError(e?.message || 'Unable to verify license right now');
 }
 };
 // Only run client-side
 if (typeof window !== 'undefined') {
 check();
 }
 return () => { cancelled = true; };
 }, [router.pathname]);

 return (
 <AppSettingsProvider>
 <NotificationProvider>
 <ToastProvider>
 <DialogProvider>
 <NotificationToast />
 <AgtSyncStatus />
 {checked && valid === null && (
 <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 w-[min(720px,calc(100%-24px))] rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-900 shadow dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-100">
 <div className="flex items-center justify-between gap-3">
 <div className="truncate">
 {licenseError || 'License check is temporarily unavailable.'}
 </div>
 <button
 type="button"
 className="shrink-0 rounded bg-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-300 dark:bg-yellow-800 dark:text-yellow-100 dark:hover:bg-yellow-700"
 onClick={() => {
 setChecked(false);
 setValid(null);
 setLicenseError(null);
 setCheckingLicense(true);
 fetch('/api/license/status', { cache: 'no-store' })
 .then(r => r.json())
 .then(j => {
 setValid(!!j.valid);
 setChecked(true);
 setCheckingLicense(false);
 setLicenseError(null);
 if (!j.valid && router.pathname !== '/license') router.replace('/license');
 })
 .catch((e: any) => {
 setValid(null);
 setChecked(true);
 setCheckingLicense(false);
 setLicenseError(e?.message || 'Unable to verify license right now');
 });
 }}
 disabled={checkingLicense}
 >
 Retry
 </button>
 </div>
 </div>
 )}
 <main className={`${inter.className} min-h-screen bg-gray-50 dark:bg-gray-900`}>
 <Component {...pageProps} />
 </main>
 {loading && (
   <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-3 py-1.5 text-xs font-mono tracking-widest border border-blue-700 animate-pulse">
     CARREGANDO...
   </div>
 )}
 </DialogProvider>
 </ToastProvider>
 </NotificationProvider>
 </AppSettingsProvider>
 );
}
