import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Button from '@/components/ui/Button';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { useToast } from '@/context/ToastContext';

export default function SettingsPage() {
    const router = useRouter();
    const { theme, setTheme, language, setLanguage } = useAppSettings();
    const toast = useToast();
    // Payment defaults state
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other'>('bank_transfer');
    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'partial' | 'paid'>('pending');
    const [dueDays, setDueDays] = useState<number>(7);
    const [saved, setSaved] = useState<boolean>(false);
    const [bankAccounts, setBankAccounts] = useState<Array<{ bankName?: string; accountName?: string; accountNumber?: string; iban?: string; swift?: string }>>([]);
    // Documents migration state
    const [migratingDocs, setMigratingDocs] = useState<boolean>(false);
    const [migrateResult, setMigrateResult] = useState<string | null>(null);

    // Company & software config state
    const [company, setCompany] = useState({
        name: '',
        tradeName: '',
        nif: '',
        address: '',
        city: '',
        province: '',
        postalCode: '',
        email: '',
        phone: '',
        saftProductId: '',
        saftProductVersion: '',
        saftProductCompanyTaxId: '',
        saftSoftwareCertificateNumber: '',
        regime: '',
        isCabinda: false
    });
    const [savingCompany, setSavingCompany] = useState<boolean>(false);
    const [savedCompany, setSavedCompany] = useState<boolean>(false);

    // Initial setup modal para série e regime
    const [showInitialSetup, setShowInitialSetup] = useState<boolean>(false);
    const [setupInvoiceSeriesCode, setSetupInvoiceSeriesCode] = useState<string>('FT');
    const [setupStartNumber, setSetupStartNumber] = useState<number>(1);
    const [setupRegime, setSetupRegime] = useState<string>('');

    // Multi-company state
    const [companies, setCompanies] = useState<Array<{ id: string; name?: string; tradeName?: string; nif?: string }>>([]);
    const [activeCompanyId, setActiveCompanyId] = useState<string | undefined>(undefined);
    const [newCompanyName, setNewCompanyName] = useState<string>('');
    const [newCompanyNif, setNewCompanyNif] = useState<string>('');
    const [creatingCompany, setCreatingCompany] = useState<boolean>(false);
    const [autoSavingBank, setAutoSavingBank] = useState<boolean>(false);
    const [autoSavedBank, setAutoSavedBank] = useState<boolean>(false);

    // Licensing state
    const [license, setLicense] = useState<{ valid: boolean; message: string; expiresAt?: string; notBefore?: string; licenseId?: string }>({ valid: false, message: 'No license installed' });
    const [licenseCode, setLicenseCode] = useState<string>('');

    useEffect(() => {
        try {
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.method) setPaymentMethod(parsed.method);
                if (parsed?.status) setPaymentStatus(parsed.status);
                if (typeof parsed?.dueDays === 'number') setDueDays(parsed.dueDays);
            }
        } catch (err) {
            console.error('Erro ao carregar defaults de pagamento:', err);
        }
        // Load company configuration from API
        (async () => {
            try {
                const resp = await fetch('/api/settings/company');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data?.company) {
                        setCompany((prev) => ({ ...prev, ...data.company }));
                        if (Array.isArray(data.company?.bankAccounts)) {
                            setBankAccounts(data.company.bankAccounts);
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar configuração da empresa:', err);
            }
        })();

        // Overlay system-wide software overrides (version/certificate)
        (async () => {
            try {
                const resp = await fetch('/api/settings/system');
                if (resp.ok) {
                    const data = await resp.json();
                    const sys = data?.system || {};
                    setCompany(prev => ({
                        ...prev,
                        saftProductVersion: sys.saftProductVersion ?? prev.saftProductVersion,
                        saftSoftwareCertificateNumber: sys.saftSoftwareCertificateNumber ?? prev.saftSoftwareCertificateNumber,
                    }));
                }
            } catch (err) {
                console.error('Erro ao carregar configuração do sistema:', err);
            }
        })();

        // Load companies list
        (async () => {
            try {
                const resp = await fetch('/api/settings/companies');
                if (resp.ok) {
                    const data = await resp.json();
                    setCompanies(Array.isArray(data.companies) ? data.companies : []);
                    setActiveCompanyId(data.activeCompanyId);
                }
            } catch (err) {
                console.error('Erro ao carregar lista de empresas:', err);
            }
        })();

    }, []);

    // Load licensing status & computer code
    useEffect(() => {
        (async () => {
            try {
                const [statusRes, codeRes] = await Promise.all([
                    fetch('/api/license/status'),
                    fetch('/api/license/machine-code')
                ]);
                const s = await statusRes.json();
                const c = await codeRes.json();
                setLicense({
                    valid: !!s.valid,
                    message: s.message || (s.valid ? 'License valid' : 'Invalid license'),
                    expiresAt: s.expiresAt,
                    notBefore: s.notBefore,
                    licenseId: s.licenseId
                });
                setLicenseCode(c?.code || '');
            } catch (err) {
                console.error('Erro ao carregar estado da licença:', err);
                setLicense({ valid: false, message: 'Unable to read license status' });
            }
        })();
    }, []);

    const handleSave = () => {
        try {
            const payload = {
                method: paymentMethod,
                status: paymentStatus,
                dueDays: dueDays,
            };
            window.localStorage.setItem('paymentDefaults', JSON.stringify(payload));
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error('Erro ao guardar defaults de pagamento:', err);
            toast.error(t('errors.savePaymentDefaultsFailed', language));
        }
    };

    const handleSaveCompany = async () => {
        try {
            setSavingCompany(true);
            // Clean bank accounts: apenas trim; sem validações de formato
            const cleanedAccounts = bankAccounts
                .map(acc => ({
                    bankName: (acc.bankName || '').trim(),
                    accountName: (acc.accountName || '').trim(),
                    accountNumber: (acc.accountNumber || '').replace(/\D/g, '').slice(0, 14),
                    iban: (acc.iban || '').trim(),
                    swift: (acc.swift || '').trim(),
                }))
                .filter(acc => acc.bankName || acc.accountName || acc.accountNumber || acc.iban || acc.swift);

            const isBlank = (v: any) => !String(v || '').trim();
            const needsInitialSet = [company.nif, company.saftProductId, company.saftProductVersion, company.saftProductCompanyTaxId, company.saftSoftwareCertificateNumber].some(isBlank);
            const method: 'POST' | 'PUT' = needsInitialSet ? 'POST' : 'PUT';

            const resp = await fetch('/api/settings/company', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...company, bankAccounts: cleanedAccounts })
            });
            if (resp.ok) {
                // Also update record in companies.json if we know the active id
                if (activeCompanyId) {
                    try {
                        await fetch('/api/settings/companies', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: activeCompanyId, ...company, bankAccounts: cleanedAccounts })
                        });
                    } catch (e) {
                        console.warn('Falha ao atualizar lista de empresas:', e);
                    }
                }
                setSavedCompany(true);
                setTimeout(() => setSavedCompany(false), 2500);
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(t('errors.saveCompanyFailed', language, { error: err?.error || t('errors.unknown', language) }));
            }
        } catch (err) {
            console.error('Erro ao guardar configuração da empresa:', err);
            toast.error(t('errors.saveCompanyFailedGeneric', language));
        } finally {
            setSavingCompany(false);
        }
    };

    const handleSelectCompany = async (id: string) => {
        try {
            const resp = await fetch('/api/settings/company/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (resp.ok) {
                setActiveCompanyId(id);
                // Reload active company details
                const data = await resp.json();
                const active = data?.company || {};
                // Overlay system-wide software identification for the newly selected company
                try {
                    const sysResp = await fetch('/api/settings/system');
                    if (sysResp.ok) {
                        const sysData = await sysResp.json();
                        const sys = sysData?.system || {};
                        const merged = {
                            ...active,
                            saftProductVersion: sys.saftProductVersion ?? active.saftProductVersion,
                            saftSoftwareCertificateNumber: sys.saftSoftwareCertificateNumber ?? active.saftSoftwareCertificateNumber,
                        };
                        setCompany(prev => ({ ...prev, ...merged }));
                    } else {
                        setCompany(prev => ({ ...prev, ...active }));
                    }
                } catch {
                    setCompany(prev => ({ ...prev, ...active }));
                }
                setBankAccounts(Array.isArray(active.bankAccounts) ? active.bankAccounts : []);
                if (!active.regime) {
                    // Se a empresa não tiver regime definido, abrir configuração inicial
                    openInitialSetup();
                }
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(t('errors.selectCompanyFailed', language, { error: err?.error || t('errors.unknown', language) }));
            }
        } catch (err) {
            console.error('Erro ao selecionar empresa:', err);
            toast.error(t('errors.selectCompanyFailedGeneric', language));
        }
    };

    const openInitialSetup = () => {
        setSetupInvoiceSeriesCode('FT');
        setSetupStartNumber(1);
        setSetupRegime(company.regime || '');
        setShowInitialSetup(true);
    };

    const saveInitialSetup = async () => {
        try {
            await fetch('/api/settings/company', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...company, regime: setupRegime })
            });
            if (activeCompanyId) {
                await fetch('/api/settings/companies', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activeCompanyId, regime: setupRegime })
                }).catch(() => { });
            }
            const year = new Date().getFullYear();
            await fetch('/api/series', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: setupInvoiceSeriesCode.toUpperCase(),
                    name: 'Factura',
                    documentType: 'factura',
                    year,
                    startNumber: setupStartNumber,
                    currentNumber: 0,
                    active: true,
                    isDefault: true
                })
            }).catch(() => { });
            setCompany(prev => ({ ...prev, regime: setupRegime }));
            setShowInitialSetup(false);
            toast.success('Configuração inicial guardada: série e regime.');
        } catch (err) {
            console.error('Erro ao guardar configuração inicial:', err);
            toast.error('Falha ao guardar configuração inicial');
        }
    };

    const handleCreateCompany = async () => {
        try {
            setCreatingCompany(true);
            const payload = { name: newCompanyName, nif: newCompanyNif };
            const resp = await fetch('/api/settings/companies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (!resp.ok) {
                toast.error(data?.error || t('errors.createCompanyFailedGeneric', language));
                return;
            }
            const created = data.company;
            // Refresh list and select the newly created
            setCompanies(prev => [...prev, created]);
            setNewCompanyName('');
            setNewCompanyNif('');
            await handleSelectCompany(created.id);
        } catch (err) {
            console.error('Erro ao criar empresa:', err);
            toast.error(t('errors.createCompanyFailedGeneric', language));
        } finally {
            setCreatingCompany(false);
        }
    };

    const handleMigrateDocuments = async () => {
        try {
            setMigratingDocs(true);
            setMigrateResult(null);
            const resp = await fetch('/api/documents/migrate-seller', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                setMigrateResult(t('settings.migrateDocuments.failed', language, { error: data?.error || t('errors.unknown', language) }));
                return;
            }
            const count = data?.migratedCount || 0;
            setMigrateResult(t('settings.migrateDocuments.success', language, { count }));
        } catch (err) {
            console.error('Erro na migração de documentos:', err);
            setMigrateResult(t('errors.migrateDocumentsFailedGeneric', language));
        } finally {
            setMigratingDocs(false);
            setTimeout(() => setMigrateResult(null), 5000);
        }
    };

    const handleBankAccountChange = (index: number, field: keyof { bankName?: string; accountName?: string; accountNumber?: string; iban?: string; swift?: string }, value: string) => {
        setBankAccounts(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
        // Auto-add a blank slot if the last one has content
        setTimeout(() => {
            setBankAccounts(prev => {
                if (prev.length === 0) return [{ bankName: '', accountName: '', accountNumber: '', iban: '', swift: '' }];
                const last = prev[prev.length - 1] || {};
                const hasContent = !!(last.bankName || last.accountName || last.accountNumber || last.iban || last.swift);
                if (hasContent) {
                    // ensure there is an empty row at the end
                    const emptyExistsAtEnd = Object.values(last).every(v => !v);
                    if (!emptyExistsAtEnd) {
                        return [...prev, { bankName: '', accountName: '', accountNumber: '', iban: '', swift: '' }];
                    }
                }
                return prev;
            });
        }, 0);
    };

    const addBankAccount = () => {
        setBankAccounts(prev => [...prev, { bankName: '', accountName: '', accountNumber: '', iban: '', swift: '' }]);
    };

    const removeBankAccount = (index: number) => {
        setBankAccounts(prev => {
            const next = prev.filter((_, i) => i !== index);
            // Persist após remover
            persistBankAccountsNow(next);
            return next;
        });
    };

    const persistBankAccountsNow = async (accounts: Array<{ bankName?: string; accountName?: string; accountNumber?: string; iban?: string; swift?: string }>) => {
        try {
            setAutoSavingBank(true);
            const cleanedAccounts = accounts
                .map(acc => ({
                    bankName: (acc.bankName || '').trim(),
                    accountName: (acc.accountName || '').trim(),
                    accountNumber: (acc.accountNumber || '').trim(),
                    iban: (acc.iban || '').trim(),
                    swift: (acc.swift || '').trim(),
                }))
                .filter(acc => acc.bankName || acc.accountName || acc.accountNumber || acc.iban || acc.swift);

            // Atualiza a empresa ativa (snapshot)
            try {
                await fetch('/api/settings/company', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...company, bankAccounts: cleanedAccounts })
                });
            } catch { }

            // Atualiza o registo da empresa na lista, se tivermos o ID ativo
            if (activeCompanyId) {
                try {
                    await fetch('/api/settings/companies', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: activeCompanyId, bankAccounts: cleanedAccounts })
                    });
                } catch { }
            }

            setAutoSavedBank(true);
            setTimeout(() => setAutoSavedBank(false), 2000);
        } catch (err) {
            console.warn('Falha no auto‑save das contas bancárias:', err);
        } finally {
            setAutoSavingBank(false);
        }
    };

    const licenseDaysLeft = license.expiresAt ? Math.max(0, Math.ceil((new Date(license.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : undefined;
    const copyLicenseCode = async () => {
        try {
            if (licenseCode) await navigator.clipboard.writeText(licenseCode);
        } catch { }
    };

    return (
        <Layout title={t('settings.title', language)}>
            <Head>
                <title>{t('settings.title', language)}</title>
                <meta name="description" content={t('settings.metaDescription', language)} />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            {/* Initial setup modal: série + regime */}
            {showInitialSetup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                        <h2 className="text-lg font-semibold mb-2">Configuração Inicial</h2>
                        <p className="text-sm text-gray-600 mb-4">Defina a série padrão e o regime fiscal para a nova empresa.</p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Série de Factura (ex.: FT)</label>
                                <input className="w-full border rounded px-3 py-2" value={setupInvoiceSeriesCode} onChange={e => setSetupInvoiceSeriesCode(e.target.value.toUpperCase())} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Número inicial</label>
                                <input type="number" min={1} className="w-full border rounded px-3 py-2" value={setupStartNumber} onChange={e => setSetupStartNumber(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Regime</label>
                                <select className="w-full border rounded px-3 py-2" value={setupRegime} onChange={e => setSetupRegime(e.target.value)}>
                                    <option value="">--Selecionar--</option>
                                    <option value="Geral">Geral</option>
                                    <option value="Simplificado">Simplificado</option>
                                    <option value="Exclusão">Exclusão</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-5 flex gap-3 justify-end">
                            <button className="px-4 py-2 rounded border" onClick={() => setShowInitialSetup(false)}>Fechar</button>
                            <button className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50" onClick={saveInitialSetup} disabled={!setupInvoiceSeriesCode || setupStartNumber < 1 || !setupRegime}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="container mx-auto px-4 py-8">
                <header className="mb-6">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            aria-label={t('nav.back', language)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <h1 className="text-3xl font-bold text-primary">{t('settings.title', language)}</h1>
                    </div>
                    <p className="text-gray-600">{t('settings.headerDescription', language)}</p>
                </header>


                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coluna Esquerda (2/3 de largura) */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white border border-gray-200 p-6">
                            <h2 className="text-xl font-semibold mb-4">{t('settings.companySoftware.title', language)}</h2>
                            <p className="text-gray-600 mb-6">{t('settings.companySoftware.description', language)}</p>

                        {/* Seleção de empresa ativa */}
                        {false && (
                            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.activeCompany.label', language)}</label>
                                    <select
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                        value={activeCompanyId || ''}
                                        onChange={(e) => handleSelectCompany(e.target.value)}
                                    >
                                        <option value="">{t('settings.activeCompany.selectPlaceholder', language)}</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {(c.tradeName || c.name || t('bank.companyLabel', language))} {c.nif ? `· ${t('common.nifShort', language)} ${c.nif}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">{t('settings.activeCompany.note', language)}</p>
                                </div>
                                <div className="flex flex-col">
                                    <div className="rounded-md border bg-gray-50 p-3 shadow-sm">
                                        <div className="text-sm font-medium text-gray-700 mb-2">{t('settings.createCompany.title', language)}</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">{t('settings.createCompany.name', language)}</label>
                                                <input
                                                    placeholder={t('settings.createCompany.placeholder.name', language)}
                                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    value={newCompanyName}
                                                    onChange={(e) => setNewCompanyName(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600 mb-1">{t('common.nifShort', language)}</label>
                                                <input
                                                    placeholder={t('settings.createCompany.placeholder.nif', language)}
                                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    value={newCompanyNif}
                                                    onChange={(e) => setNewCompanyNif(e.target.value)}
                                                />
                                            </div>
                                            <Button variant="secondary" onClick={handleCreateCompany} disabled={creatingCompany || !newCompanyName || !newCompanyNif}>{t('actions.create', language)}</Button>
                                            <div className="relative flex py-1 items-center">
                                                <div className="flex-grow border-t border-gray-200"></div>
                                                <span className="flex-shrink mx-2 text-gray-400 text-xs font-semibold uppercase">ou</span>
                                                <div className="flex-grow border-t border-gray-200"></div>
                                            </div>

                                            <Link href="/register-company" className="w-full text-center py-2 px-3 border border-transparent text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
                                                Registro Completo
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Secção de migração removida conforme solicitação */}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.name', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.company.tradeName', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.tradeName} onChange={(e) => setCompany({ ...company, tradeName: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.nifShort', language)}</label>
                                <input
                                    className={`w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 ${((company.nif || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={company.nif || ''} onChange={(e) => setCompany({ ...company, nif: e.target.value })} readOnly={!!(company.nif || '').trim()} />
                                <p className="text-xs text-gray-500 mt-1">{((company.nif || '').trim() ? t('settings.company.nif.lockedNote', language) : 'Preencha uma única vez e guarde; ficará bloqueado.')}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.address', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.city', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.province', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.province} onChange={(e) => setCompany({ ...company, province: e.target.value })} />
                            </div>
                            <div>
                                <label className="block textsm font-medium text-gray-700 mb-1">{t('home.company.postalCode', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.postalCode} onChange={(e) => setCompany({ ...company, postalCode: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.email', language)}</label>
                                <input type="email" className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('home.company.phone', language)}</label>
                                <input className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Regime</label>
                                <select className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50" value={company.regime} onChange={(e) => setCompany({ ...company, regime: e.target.value })}>
                                    <option value="">--Selecionar--</option>
                                    <option value="Geral">Geral</option>
                                    <option value="Simplificado">Simplificado</option>
                                    <option value="Exclusão">Exclusão</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 mt-2">
                                <div className="flex items-center">
                                    <input
                                        id="isCabinda"
                                        type="checkbox"
                                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                                        checked={company.isCabinda}
                                        onChange={(e) => setCompany({ ...company, isCabinda: e.target.checked })}
                                    />
                                    <label htmlFor="isCabinda" className="ml-2 block text-sm font-medium text-gray-700">
                                        {t('settings.company.isCabinda', language)}
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{t('settings.company.isCabinda.note', language)}</p>
                            </div>
                        </div>

                        {/* Identificação do Software (AGT) */}
                        {false && (
                            <>
                                <h3 className="text-lg font-semibold mt-6 mb-3">{t('settings.software.title', language)}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.software.productId', language)}</label>
                                        <input className={`w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 ${((company.saftProductId || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={company.saftProductId || ''} onChange={(e) => setCompany({ ...company, saftProductId: e.target.value })} readOnly={true} />
                                        <p className="text-xs text-gray-500 mt-1">{t('settings.software.lockedNote', language)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.software.productVersion', language)}</label>
                                        <input className={`w-full rounded-md border-gray-300 shadow-sm bg-gray-50 text-gray-700`} value={company.saftProductVersion || ''} readOnly={true} />
                                        <p className="text-xs text-gray-500 mt-1">{t('settings.software.lockedNote', language)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.software.companyTaxId', language)}</label>
                                        <input className={`w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 ${((company.saftProductCompanyTaxId || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={company.saftProductCompanyTaxId || ''} onChange={(e) => setCompany({ ...company, saftProductCompanyTaxId: e.target.value })} readOnly={true} />
                                        <p className="text-xs text-gray-500 mt-1">{t('settings.software.lockedNote', language)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.software.certificateNumber', language)}</label>
                                        <input className={`w-full rounded-md border-gray-300 shadow-sm bg-gray-50 text-gray-700`} value={company.saftSoftwareCertificateNumber || ''} readOnly={true} />
                                        <p className="text-xs text-gray-500 mt-1">{t('settings.software.lockedNote', language)}</p>
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="mt-6 flex gap-3 items-center">
                            <Button variant="primary" onClick={handleSaveCompany} disabled={savingCompany}>{t('settings.saveConfig', language)}</Button>
                            {savedCompany && <span className="text-green-600">{t('messages.saved', language)}</span>}
                            {activeCompanyId && (
                                <Button variant="secondary" onClick={openInitialSetup}>Configurar Série/Regime</Button>
                            )}
                        </div>
                    </div>

                    {/* Payment Defaults Panel */}
                    <div className="bg-white border border-gray-200 p-6">
                        <h2 className="text-xl font-semibold mb-4">{t('settings.paymentDefaults.title', language)}</h2>
                        <p className="text-gray-600 mb-6">{t('settings.paymentDefaults.description', language)}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.paymentDefaults.method.label', language)}</label>
                                <select
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                                >
                                    <option value="cash">{t('payment.method.cash', language)}</option>
                                    <option value="bank_transfer">{t('payment.method.bank_transfer', language)}</option>
                                    <option value="card">{t('payment.method.card', language)}</option>
                                    <option value="mobile_money">{t('payment.method.mobile_money', language)}</option>
                                    <option value="other">{t('payment.method.other', language)}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.paymentDefaults.status.label', language)}</label>
                                <select
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    value={paymentStatus}
                                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                                >
                                    <option value="pending">{t('payment.status.pending', language)}</option>
                                    <option value="partial">{t('payment.status.partial', language)}</option>
                                    <option value="paid">{t('payment.status.paid', language)}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.paymentDefaults.dueDays.label', language)}</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    value={dueDays}
                                    onChange={(e) => setDueDays(Number(e.target.value))}
                                />
                                <p className="text-xs text-gray-500 mt-1">{t('settings.paymentDefaults.dueDays.note', language)}</p>
                            </div>
                        </div>

                        {paymentMethod === 'bank_transfer' && (
                            <div className="mt-8">
                                <h3 className="text-lg font-semibold mb-2">{t('settings.bankAccounts.title', language)}</h3>
                                <p className="text-gray-600 mb-4">{t('settings.bankAccounts.description', language)}</p>
                                <div className="space-y-4">
                                    {bankAccounts.length === 0 && (
                                        <div className="text-sm text-gray-500">{t('settings.bankAccounts.none', language)}</div>
                                    )}
                                    {bankAccounts.map((acc, idx) => (
                                        <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('bank.bankLabel', language)}</label>
                                                <input
                                                    placeholder={t('bank.bankLabel', language)}
                                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    value={acc.bankName || ''}
                                                    onChange={(e) => handleBankAccountChange(idx, 'bankName', e.target.value)}
                                                    onBlur={() => persistBankAccountsNow(bankAccounts)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('bank.accountLabel', language)}</label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={14}
                                                    pattern="\d{14}"
                                                    placeholder={t('bank.accountLabel', language)}
                                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    value={acc.accountNumber || ''}
                                                    onChange={(e) => {
                                                        const digits = (e.target.value || '').replace(/\D/g, '').slice(0, 14);
                                                        handleBankAccountChange(idx, 'accountNumber', digits);
                                                    }}
                                                    onBlur={() => persistBankAccountsNow(bankAccounts)}
                                                />
                                                <p className="mt-1 text-xs text-gray-500">Deve ter exatamente 14 dígitos.</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('bank.ibanLabel', language)}</label>
                                                <input
                                                    placeholder={t('settings.bankAccounts.iban.placeholder', language)}
                                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                                    value={acc.iban || ''}
                                                    onChange={(e) => handleBankAccountChange(idx, 'iban', e.target.value)}
                                                    onBlur={() => persistBankAccountsNow(bankAccounts)}
                                                />
                                            </div>
                                            <div className="md:col-span-3 flex justify-end">
                                                <button type="button" onClick={() => removeBankAccount(idx)} className="text-xs text-red-600 hover:underline">{t('settings.bankAccounts.remove', language)}</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4">
                                    <Button variant="secondary" onClick={addBankAccount}>{t('settings.bankAccounts.addAccount', language)}</Button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">{t('settings.bankAccounts.transferNote', language)}</p>
                                <div className="mt-2 text-xs">
                                    {autoSavingBank ? (
                                        <span className="text-gray-500">{t('settings.bankAccounts.autosave.saving', language)}</span>
                                    ) : autoSavedBank ? (
                                        <span className="text-green-600">{t('settings.bankAccounts.autosave.saved', language)}</span>
                                    ) : null}
                                </div>
                                {/* Sem validações de formato; IBAN é livre e editável */}
                            </div>
                        )}

                        <div className="mt-6 flex gap-3">
                            <Button variant="primary" onClick={handleSave}>{t('actions.save', language)}</Button>
                            {saved && <span className="text-green-600">{t('messages.saved', language)}</span>}
                        </div>
                    </div>
                </div>

                {/* Coluna Direita (1/3 de largura) - Fica no topo perfeitamente alinhada */}
                <div className="space-y-6">
                    {/* Licensing card */}
                    <div className="bg-white border border-gray-200 p-6">
                        <h2 className="text-xl font-semibold mb-4">{t('licensing.title', language)}</h2>
                        <div className="space-y-3 text-sm text-gray-700">
                            <div className="flex items-center justify-between">
                                <span>{t('licensing.status', language)}</span>
                                <span className={license.valid ? 'text-green-600' : 'text-red-600'}>{license.valid ? t('licensing.active', language) : t('licensing.inactive', language)}</span>
                            </div>
                            {license.expiresAt && (
                                <div className="flex items-center justify-between">
                                    <span>{t('licensing.expires', language)}</span>
                                    <span>{new Date(license.expiresAt).toLocaleString()}</span>
                                </div>
                            )}
                            {typeof licenseDaysLeft === 'number' && (
                                <div className="flex items-center justify-between">
                                    <span>{t('licensing.daysRemaining', language)}</span>
                                    <span>{licenseDaysLeft}</span>
                                </div>
                            )}
                            <div>
                                <div className="text-xs text-gray-500 mb-1">{t('licensing.computerCode', language)}</div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 px-3 py-2 overflow-x-auto">{licenseCode || '…'}</div>
                                    <Button variant="secondary" onClick={copyLicenseCode}>{t('actions.copy', language)}</Button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{t('licensing.codeNote', language)}</p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Link href="/license" className="inline-block">
                                <Button variant="primary">{t('licensing.manage', language)}</Button>
                            </Link>
                        </div>
                    </div>

                    {/* App Preferences card */}
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
                        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('settings.appPreferences', language)}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.language', language)}</label>
                                <select
                                    className="w-full border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value as 'pt' | 'en')}
                                >
                                    <option value="pt">{t('settings.language.option.pt', language)}</option>
                                    <option value="en">{t('settings.language.option.en', language)}</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.language.note', language)}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('settings.theme', language)}</label>
                                <select
                                    className="w-full border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                                >
                                    <option value="light">{t('settings.theme.light', language)}</option>
                                    <option value="dark">{t('settings.theme.dark', language)}</option>
                                    <option value="system">{t('settings.theme.system', language)}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Actions card */}
                    <div className="bg-white border border-gray-200 p-6">
                        <h3 className="text-lg font-semibold mb-3">{t('settings.actions.title', language)}</h3>
                        <div className="flex flex-col gap-2">
                            <Link href="/" className="text-primary hover:underline">{t('settings.actions.backToDashboard', language)}</Link>
                            <Link href="/documents/new" className="text-primary hover:underline">{t('settings.actions.createDocument', language)}</Link>
                        </div>
                    </div>
                </div>

                {/* Visualização das contas salvas abaixo de tudo */}
                {paymentMethod === 'bank_transfer' && (
                    <div className="lg:col-span-3 bg-white border border-gray-200 p-6 mt-6">
                            <h3 className="text-lg font-semibold mb-3">{t('settings.bankAccounts.savedTitle', language)}</h3>
                            {bankAccounts && bankAccounts.filter(a => (((a.iban || '').trim() || (a.bankName || '').trim() || (a.accountNumber || '').trim()))).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {bankAccounts.filter(a => (((a.iban || '').trim() || (a.bankName || '').trim() || (a.accountNumber || '').trim()))).map((a, i) => (
                                        <span key={i} className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                                            <span>{a.bankName || t('bank.bankLabel', language)}</span>
                                            <span>•</span>
                                            <span>{a.accountNumber || t('bank.accountLabel', language)}</span>
                                            <span>•</span>
                                            <span>{a.iban || t('bank.ibanLabel', language)}</span>
                                            <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => removeBankAccount(i)}>{t('settings.bankAccounts.remove', language)}</button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">{t('settings.bankAccounts.noneForCompany', language)}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}