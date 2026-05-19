import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';

export default function LicensePage() {
 const [key, setKey] = useState('');
 const [status, setStatus] = useState<'idle'|'checking'|'valid'|'invalid'>('idle');
 const [message, setMessage] = useState('');
 const [expiresAt, setExpiresAt] = useState<string | undefined>();
 const [machineCode, setMachineCode] = useState<string>('');
 const [showAdd, setShowAdd] = useState(false);

 const router = useRouter();
 const { language } = useAppSettings();

 useEffect(() => {
 const check = async () => {
 setStatus('checking');
 try {
 const [statusRes, codeRes] = await Promise.all([
 fetch('/api/license/status'),
 fetch('/api/license/machine-code')
 ]);
 const j = await statusRes.json();
 const c = await codeRes.json();
 setMachineCode(c?.code || '');
 if (j.valid) {
 setStatus('valid');
 setExpiresAt(j.expiresAt);
 setMessage(t('license.message.active', language));
 } else {
 setStatus('invalid');
 setMessage(j.message || t('license.message.noValidPrompt', language));
 }
 } catch {
 setStatus('invalid');
 setMessage(t('license.message.statusError', language));
 }
 };
 check();
 }, [language]);

 const onSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setMessage('');
 try {
 const res = await fetch('/api/license/install', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ key }),
 });
 const j = await res.json();
 if (j.ok) {
 setStatus('valid');
 setExpiresAt(j.expiresAt);
 setMessage(j.message || t('license.message.success', language));
 setKey('');
 setShowAdd(false);
 } else {
 setStatus('invalid');
 setMessage(j.message || t('license.message.invalidKey', language));
 }
 } catch {
 setStatus('invalid');
 setMessage(t('license.message.submitError', language));
 }
 };

 const copyCode = async () => {
 try {
 await navigator.clipboard.writeText(machineCode);
 setMessage(t('license.copySuccess', language));
 } catch {
 setMessage(t('license.copyFail', language));
 }
 };

 const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : undefined;

 return (
 <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
 <Head>
 <title>{t('license.pageTitle', language)}</title>
 </Head>
 <div className="w-full max-w-md p-8 rounded-2xl bg-black/40 backdrop-blur border border-white/10 shadow-xl">
 <div className="text-center mb-6">
 <h1 className="text-2xl font-semibold">{t('license.activateTitle', language)}</h1>
 <p className="text-sm text-gray-300 mt-2">{t('license.description', language)}</p>
 </div>

 {/* Computer code display */}
 <div className="mb-6">
 <div className="text-xs text-gray-300 mb-1">{t('license.computerCodeLabel', language)}</div>
 <div className="flex items-center gap-2">
 <div className="flex-1 font-mono text-sm bg-gray-900 border border-white/10 rounded-md px-3 py-2 select-all">
 {machineCode || '…'}
 </div>
 <button
 onClick={copyCode}
 className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 border border-white/10 text-sm"
 >
 {t('actions.copy', language)}
 </button>
 </div>
 <p className="text-xs text-gray-400 mt-2">{t('licensing.codeNote', language)}</p>
 </div>

 {status === 'valid' ? (
 <div className="bg-green-900/30 border border-green-600/40 text-green-200 p-4 mb-4">
 <p className="font-medium">{message}</p>
 {expiresAt && (
 <p className="text-sm mt-1">{t('license.expiry', language)} {new Date(expiresAt).toLocaleString()}</p>
 )}
 {typeof daysLeft === 'number' && (
 <p className="text-sm mt-1">{t('license.daysRemaining', language)} {daysLeft}</p>
 )}
 <div className="mt-3 flex gap-3">
 <button
 type="button"
 onClick={() => router.replace('/')}
 className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors font-medium"
 >
 {t('license.continue', language)}
 </button>
 <button
 type="button"
 onClick={() => setShowAdd(v => !v)}
 className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 border border-white/10 transition-colors font-medium"
 >
 {showAdd ? t('actions.cancel', language) : t('license.addNewTitle', language)}
 </button>
 </div>
 {showAdd && (
 <div className="mt-6">
 <div className="text-sm font-semibold mb-2">{t('license.addNewTitle', language)}</div>
 <form onSubmit={onSubmit} className="space-y-3">
 <label className="block">
 <span className="text-sm text-gray-200">{t('license.serialKeyLabel', language)}</span>
 <input
 value={key}
 onChange={(e) => setKey(e.target.value)}
 placeholder={t('license.serialKeyPlaceholder', language)}
 className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </label>
 <button
 type="submit"
 className="w-full py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors font-medium"
 >
 {t('license.activateButton', language)}
 </button>
 </form>
 </div>
 )}
 </div>
 ) : (
 <>
 {message && (
 <div className="bg-yellow-900/30 border border-yellow-600/40 text-yellow-200 p-3 mb-4">
 <p className="text-sm">{message}</p>
 </div>
 )}

 <form onSubmit={onSubmit} className="space-y-4">
 <label className="block">
 <span className="text-sm text-gray-200">{t('license.serialKeyLabel', language)}</span>
 <input
 value={key}
 onChange={(e) => setKey(e.target.value)}
 placeholder={t('license.serialKeyPlaceholder', language)}
 className="mt-1 w-full px-4 py-2 rounded-md bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </label>

 <button
 type="submit"
 className="w-full py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors font-medium"
 >
 {t('license.activateButton', language)}
 </button>
 </form>

 <div className="mt-6 text-xs text-gray-400">
 <p>{t('license.computerCodeLabel', language)}</p>
 </div>
 </>
 )}
 </div>
 </div>
 );
}

