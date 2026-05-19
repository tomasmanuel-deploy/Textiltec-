import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { useToast } from '@/context/ToastContext';

interface Buyer { name: string; nif: string; }
interface Totals { subtotal: number; discount: number; vatTotal: number; total: number;[key: string]: number; }
interface DocItem { id: string; series: string; documentType: string; issueDate: string; totals: Totals; status: string; buyer: Buyer;[key: string]: any; }
interface Movement { id: string; warehouseId: string; productId: string; delta: number; source: string; createdAt: string; }
interface StockIn { id: string; warehouseId: string; date: string; totalQuantity?: number; lines: { productId: string; quantity: number }[]; }
interface Warehouse { id: string; name: string; }

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function Home() {
 const { language } = useAppSettings();
 const toast = useToast();
 const [documents, setDocuments] = useState<DocItem[]>([]);
 const [movements, setMovements] = useState<Movement[]>([]);
 const [stockIns, setStockIns] = useState<StockIn[]>([]);
 const [clientsTotal, setClientsTotal] = useState<number>(0);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
 const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
 // First-run company setup
 const [showCompanySetup, setShowCompanySetup] = useState(false);
 const [companyNameInput, setCompanyNameInput] = useState('');
 const [companyEmailInput, setCompanyEmailInput] = useState('');
 const [companyNifInput, setCompanyNifInput] = useState('');
 const [companyAddressInput, setCompanyAddressInput] = useState('');
 const [companyPhoneInput, setCompanyPhoneInput] = useState('');
 const [companyCityInput, setCompanyCityInput] = useState('');
 const [companyProvinceInput, setCompanyProvinceInput] = useState('');
 const [companyPostalCodeInput, setCompanyPostalCodeInput] = useState('');
 // New: série base e regime fiscal
 const [seriesBaseInput, setSeriesBaseInput] = useState('XVE');
 const [regimeInput, setRegimeInput] = useState('');

 useEffect(() => {
 const load = async () => {
 setLoading(true); setError(null);
 try {
 const fetchJsonSafe = async <T = any>(url: string, fallback: T): Promise<T> => {
 try {
 const res = await fetch(url, { cache: 'no-store' }); // Disable browser cache
 if (!res.ok) {
 console.warn('Dashboard fetch non-OK:', url, res.status);
 return fallback;
 }
 const text = await res.text();
 try {
 return JSON.parse(text) as T;
 } catch {
 console.warn('Dashboard fetch non-JSON body for', url);
 return fallback;
 }
 } catch (e) {
 console.warn('Dashboard fetch error:', url, e);
 return fallback;
 }
 };

 const [docsJson, movJson, siJson, cliJson, whJson] = await Promise.all([
 fetchJsonSafe('/api/documents', { documents: [], total: 0 }),
 fetchJsonSafe('/api/inventory/movements?limit=500&offset=0', { movements: [], total: 0 }),
 fetchJsonSafe('/api/stock-in', { stockIns: [] }),
 fetchJsonSafe('/api/clients?limit=1&offset=0', { clients: [], pagination: { total: 0 } }),
 fetchJsonSafe('/api/warehouses', { warehouses: [] })
 ]);

 setDocuments((docsJson.documents || []).map((d: any) => ({ id: d.id, series: d.series, documentType: d.documentType, issueDate: d.issueDate, totals: d.totals, status: d.status, buyer: d.buyer, lines: d.lines })));
 setMovements((movJson.movements || []).map((m: any) => ({ id: m.id, warehouseId: m.warehouseId, productId: m.productId, delta: m.delta, source: m.source, createdAt: m.createdAt })));
 setStockIns((siJson.stockIns || []).map((r: any) => ({ id: r.id, warehouseId: r.warehouseId, date: r.date, lines: r.lines, totalQuantity: r.totalQuantity })));
 setClientsTotal(cliJson.pagination?.total || (cliJson.clients?.length ?? 0));
 setWarehouses((whJson.warehouses || []).map((w: any) => ({ id: w.id, name: w.name })));
 } catch (e) {
 setError(t('errors.dashboardLoadFailed', language));
 } finally {
 setLoading(false);
 }
 };
 load();

 // Refresh dashboard every 30 seconds for real-time updates
 const interval = setInterval(load, 30000);
 return () => clearInterval(interval);
 }, [language]); // Depend on language for i18n

 // Check company settings on startup and request core fields once
 useEffect(() => {
 const loadCompany = async () => {
 try {
 const res = await fetch('/api/settings/company');
 const data = await res.json();
 const c = data?.company || {};
 const missingCore = !c?.email || !c?.nif || !c?.address || !c?.seriesBase || !c?.regime;
 if (missingCore) {
 setCompanyNameInput(c?.tradeName || c?.name || '');
 setCompanyEmailInput(c?.email || '');
 setCompanyNifInput(c?.nif || '');
 setCompanyAddressInput(c?.address || '');
 setCompanyPhoneInput(c?.phone || '');
 setCompanyCityInput(c?.city || '');
 setCompanyProvinceInput(c?.province || '');
 setCompanyPostalCodeInput(c?.postalCode || '');
 setSeriesBaseInput(c?.seriesBase || 'XVE');
 setRegimeInput(c?.regime || '');
 setShowCompanySetup(true);
 }
 } catch (e) {
 // silently ignore; will ask on first run
 }
 };
 loadCompany();
 }, []);

 const handleSaveCompany = async () => {
 try {
 const payload = {
 name: companyNameInput,
 email: companyEmailInput,
 nif: companyNifInput,
 address: companyAddressInput,
 phone: companyPhoneInput,
 city: companyCityInput,
 province: companyProvinceInput,
 postalCode: companyPostalCodeInput,
 seriesBase: seriesBaseInput,
 regime: regimeInput,
 };
 const res = await fetch('/api/settings/company', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 const data = await res.json();
 if (!res.ok) {
 toast.info(data?.error || 'Falha ao guardar configuração da empresa');
 return;
 }
 // Seed default series for current year if not present
 try {
 const resp = await fetch('/api/series/seed-defaults', { method: 'POST' });
 // ignore non-200; seeding is best-effort
 } catch { }
 // Também persistir no companies.json para que a seleção futura restaure estes dados
 try {
 const listRes = await fetch('/api/settings/companies');
 if (listRes.ok) {
 const listData = await listRes.json();
 const activeCompanyId = listData?.activeCompanyId;
 if (activeCompanyId) {
 await fetch('/api/settings/companies', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ id: activeCompanyId, ...payload })
 }).catch(() => { });
 }
 }
 } catch { }
 setShowCompanySetup(false);
 } catch (e) {
 toast.info('Falha ao guardar configuração da empresa');
 }
 };

 // Refetch movements when warehouse changes to sync with API filter
 useEffect(() => {
 const refetchMovements = async () => {
 try {
 const params = new URLSearchParams();
 params.set('limit', '500');
 params.set('offset', '0');
 if (selectedWarehouseId) params.set('warehouseId', selectedWarehouseId);
 const res = await fetch(`/api/inventory/movements?${params.toString()}`);
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || 'Falha ao carregar movimentos');
 setMovements((data.movements || []).map((m: any) => ({ id: m.id, warehouseId: m.warehouseId, productId: m.productId, delta: m.delta, source: m.source, createdAt: m.createdAt })));
 } catch (e) {
 // keep previous movements on error
 console.error('Erro ao atualizar movimentos:', e);
 }
 };
 refetchMovements();
 }, [selectedWarehouseId]);

 const salesToday = useMemo(() => {
 const today = new Date().toISOString().split('T')[0];
 const invoiceTypes = ['factura', 'factura_recibo', 'factura_generica', 'factura_global', 'venda_a_dinheiro', 'simplificada'];
 return documents
 .filter(d => invoiceTypes.includes(String(d.documentType).toLowerCase()))
 .filter(d => d.issueDate === today)
 .reduce((acc, d) => acc + (d.totals?.total || d.totals?.grandTotal || 0), 0);
 }, [documents]);

 const salesByMonth = useMemo(() => {
 const now = new Date();
 const year = now.getFullYear();
 const arr = Array.from({ length: 12 }, (_, i) => 0);
 const invoiceTypes = ['factura', 'factura_recibo', 'factura_generica', 'factura_global', 'venda_a_dinheiro', 'simplificada'];

 documents
 .filter(d => invoiceTypes.includes(String(d.documentType).toLowerCase()))
 .forEach(d => {
 const dt = new Date(d.issueDate);
 if (dt.getFullYear() === year) {
 arr[dt.getMonth()] += (d.totals?.total || d.totals?.grandTotal || 0);
 }
 });
 return arr;
 }, [documents]);

 const fluxoMovimentos = useMemo(() => {
 const now = new Date();
 const year = now.getFullYear();
 const entradas = Array.from({ length: 12 }, () => 0);
 const saidas = Array.from({ length: 12 }, () => 0);
 movements.forEach(m => {
 const dt = new Date(m.createdAt);
 if (dt.getFullYear() === year) {
 if (m.delta >= 0) entradas[dt.getMonth()] += m.delta;
 else saidas[dt.getMonth()] += Math.abs(m.delta);
 }
 });
 return { entradas, saidas };
 }, [movements]);

 const currentMonth = new Date().getMonth();
 const prevMonth = (currentMonth + 11) % 12;
 const anteMonth = (currentMonth + 10) % 12;

 const vendasMesAtual = salesByMonth[currentMonth] || 0;
 const vendasMesPassado = salesByMonth[prevMonth] || 0;
 const vendasMesAntepassado = salesByMonth[anteMonth] || 0;

 const entradasStockMesAtual = useMemo(() => {
 const filtered = selectedWarehouseId ? stockIns.filter(r => r.warehouseId === selectedWarehouseId) : stockIns;
 const n = new Date();
 return filtered.filter(r => {
 const dt = new Date(r.date);
 return dt.getMonth() === n.getMonth() && dt.getFullYear() === n.getFullYear();
 }).reduce((s, r) => s + (r.totalQuantity ?? r.lines.reduce((sum, l) => sum + l.quantity, 0)), 0);
 }, [stockIns, selectedWarehouseId]);

 const topProducts = useMemo(() => {
 const map = new Map<string, number>();
 (documents as any[]).forEach((d: any) => {
 d?.lines?.forEach?.((l: any) => {
 const key = l.description || `Produto ${l.productId || ''}`;
 map.set(key, (map.get(key) || 0) + (l.quantity || 0));
 });
 });
 return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
 }, [documents]);

 const formatAOA = (v: number) => new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 }).format(v);

 const [quickQuery, setQuickQuery] = useState('');
 const quickLinks: { name: string; href: string; group: string }[] = [
 { name: t('nav.documents', language), href: '/documents', group: t('home.group.sales', language) },
 { name: t('nav.sales', language), href: '/sales', group: t('home.group.sales', language) },
 { name: t('nav.clients', language), href: '/clients', group: t('home.group.sales', language) },
 { name: t('nav.products', language), href: '/products', group: t('home.group.warehouse', language) },
 { name: t('nav.purchases', language), href: '/purchases', group: t('home.group.warehouse', language) },
 { name: t('nav.stockIn', language), href: '/stock-in', group: t('home.group.warehouse', language) },
 { name: t('nav.inventory', language), href: '/inventory', group: t('home.group.warehouse', language) },
 { name: t('nav.transfers', language), href: '/transfers', group: t('home.group.warehouse', language) },
 { name: t('nav.transportGuides', language), href: '/transport-guides', group: t('home.group.warehouse', language) },
 { name: t('nav.warehouses', language), href: '/warehouses', group: t('home.group.warehouse', language) },
 { name: t('nav.series', language), href: '/series', group: t('home.group.admin', language) },
 { name: t('nav.reports', language), href: '/reports', group: t('home.group.admin', language) },
 ];
 const filteredQuickLinks = quickLinks.filter(l => l.name.toLowerCase().includes(quickQuery.toLowerCase()));
 const groups = [
 { key: t('home.group.sales', language) },
 { key: t('home.group.warehouse', language) },
 { key: t('home.group.admin', language) },
 ];
 const moduleCounts: Record<string, number | undefined> = {
 [t('nav.documents', language)]: documents.length,
 [t('nav.clients', language)]: clientsTotal,
 [t('nav.stockIn', language)]: stockIns.length,
 };

 return (
 <Layout title={t('home.title', language)}>
 <Head>
 <title>{t('home.title', language).toUpperCase()}</title>
 </Head>
 {showCompanySetup && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
 <div className="bg-white w-full max-w-md p-6 border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
 <h2 className="text-lg font-semibold mb-2 dark:text-gray-100">{t('home.companySetup.title', language)}</h2>
 <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('home.companySetup.description', language)}</p>
 <div className="space-y-3">
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.name', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.name', language)}
 value={companyNameInput}
 onChange={e => setCompanyNameInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.nif', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.nif', language)}
 value={companyNifInput}
 onChange={e => setCompanyNifInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.address', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.address', language)}
 value={companyAddressInput}
 onChange={e => setCompanyAddressInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.city', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.city', language)}
 value={companyCityInput}
 onChange={e => setCompanyCityInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.province', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.province', language)}
 value={companyProvinceInput}
 onChange={e => setCompanyProvinceInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.postalCode', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.postalCode', language)}
 value={companyPostalCodeInput}
 onChange={e => setCompanyPostalCodeInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.email', language)}</label>
 <input
 type="email"
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.email', language)}
 value={companyEmailInput}
 onChange={e => setCompanyEmailInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t('home.company.phone', language)}</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder={t('home.company.placeholder.phone', language)}
 value={companyPhoneInput}
 onChange={e => setCompanyPhoneInput(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Série Base dos Documentos (ex.: XVE)</label>
 <input
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 placeholder="XVE"
 value={seriesBaseInput}
 onChange={e => setSeriesBaseInput(e.target.value.toUpperCase())}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Regime Fiscal</label>
 <select
 className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100"
 value={regimeInput}
 onChange={e => setRegimeInput(e.target.value)}
 >
 <option value="">--Selecionar--</option>
 <option value="Geral">Geral</option>
 <option value="Simplificado">Simplificado</option>
 <option value="Exclusão">Exclusão</option>
 </select>
 </div>
 </div>
 <div className="mt-5 flex gap-3 justify-end">
 <button
 className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 disabled:opacity-50"
 onClick={handleSaveCompany}
 disabled={!companyEmailInput || !companyNifInput || !companyAddressInput || !companyNameInput || !companyPhoneInput || !companyCityInput || !companyProvinceInput || !companyPostalCodeInput || !seriesBaseInput || !regimeInput}
 >
 {t('actions.save', language)}
 </button>
 </div>
 </div>
 </div>
 )}
 <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
 <div className="flex items-center justify-between mb-2">
 <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('home.title', language).toUpperCase()}</h1>
 <div className="text-sm text-gray-500 dark:text-gray-400 flex gap-4">
 <span>{t('home.pos', language)}</span>
 <span>·</span>
 <span>{t('home.shiftOpen', language)}</span>
 <span>·</span>
 <span>{t('home.saft', language)}</span>
 </div>
 </div>

 {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}

 {/* Painéis em duas colunas: Esquerda (Opções) e Direita (Dashboard) */}
 <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
 {/* Esquerda: Navegação estilizada (sidebar) */}
 <aside className="md:col-span-1">
 <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
 <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900 border-b border-blue-100 dark:border-blue-800">
 <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('home.shortcuts', language)}</h2>
 <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{t('home.shortcuts.desc', language)}</p>
 <div className="mt-3">
 <input
 type="text"
 value={quickQuery}
 onChange={e => setQuickQuery(e.target.value)}
 placeholder={t('common.searchModules', language)}
 className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
 />
 </div>
 </div>

 <div className="p-3 space-y-3 bg-white dark:bg-gray-800">
 {filteredQuickLinks.length === 0 ? (
 <div className="text-sm text-gray-500 dark:text-gray-400 px-2 py-4 text-center">{t('common.noResults', language)}</div>
 ) : (
 groups.map(group => {
 const items = filteredQuickLinks.filter(l => l.group === group.key);
 if (items.length === 0) return null;
 return (
 <div key={group.key} className="border border-gray-200 dark:border-gray-700 overflow-hidden">
 <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900 border-b border-blue-100 dark:border-blue-800">
 <div className="flex items-center justify-between">
 <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{group.key}</h3>
 <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 px-2 py-0.5">{t('common.modulesCount', language, { count: items.length })}</span>
 </div>
 </div>
 <div className="p-2 space-y-1">
 {items.map(link => (
 <Link key={link.href} href={link.href} className="flex items-center gap-3 p-2 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
 <div className="flex-1">
 <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">{link.name}</div>
 </div>
 {moduleCounts[link.name] !== undefined && (
 <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{moduleCounts[link.name]}</span>
 )}
 </Link>
 ))}
 </div>
 </div>
 );
 })
 )}
 </div>
 </div>
 </aside>

 {/* Direita: Conteúdo do Dashboard */}
 <section className="md:col-span-3">
 {/* Top Cards */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 <StatsCard title={t('home.salesCurrent', language)} value={formatAOA(vendasMesAtual)} href="/sales" />
 <StatsCard title={t('home.salesLast', language)} value={formatAOA(vendasMesPassado)} href="/sales" />
 <StatsCard title={t('home.salesPrevious', language)} value={formatAOA(vendasMesAntepassado)} href="/sales" />
 <StatsCard title={t('home.stockInMonth', language)} value={`${entradasStockMesAtual}`} href="/stock-in" />
 <StatsCard title={t('home.activeClients', language)} value={`${clientsTotal}`} href="/clients" />
 <StatsCard title={t('home.documentsIssued', language)} value={`${documents.length}`} href="/documents" />
 </div>

 {/* Middle Panels */}
 <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
 <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
 <h2 className="font-medium text-gray-900 dark:text-gray-100">{t('home.salesPanel.title', language)}</h2>
 <div className="flex items-center gap-3">
 <Link href="/sales" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">{t('home.salesPanel.movements', language)}</Link>
 <div className="flex items-center gap-2">
 <label className="text-xs text-gray-600 dark:text-gray-400">{t('common.warehouse', language)}</label>
 <select
 className="text-sm border border-gray-300 dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-100"
 value={selectedWarehouseId}
 onChange={e => setSelectedWarehouseId(e.target.value)}
 >
 <option value="">{t('common.all', language)}</option>
 {warehouses.map(w => (
 <option key={w.id} value={w.id}>{w.name}</option>
 ))}
 </select>
 </div>
 </div>
 </div>
 <div className="px-4 py-4">
 <Chart labels={monthLabels} series={[
 { name: t('home.series.outflows', language), color: '#1e40af', values: fluxoMovimentos.saidas },
 { name: t('home.series.inflows', language), color: '#3b82f6', values: fluxoMovimentos.entradas }
 ]} />
 </div>
 </div>

 <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
 <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
 <h2 className="font-medium text-gray-900 dark:text-gray-100">{t('home.clientsPanel.title', language)}</h2>
 <span className="text-xs text-gray-500 dark:text-gray-400">{t('home.topProducts', language)}</span>
 </div>
 <div className="px-4 py-4">
 <Chart labels={monthLabels} series={[{ name: t('home.series.sales', language), color: '#3b82f6', values: salesByMonth }]} />
 <div className="mt-4">
 {topProducts.length === 0 ? (
 <p className="text-sm text-gray-500 dark:text-gray-400">{t('messages.noProductData', language)}</p>
 ) : (
 <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
 {topProducts.map(([name, qty]) => (
 <li key={name}>{name} · {qty} un</li>
 ))}
 </ul>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Bottom */}
 <div className="mt-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
 <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
 <h2 className="font-medium text-gray-900 dark:text-gray-100">{t('home.salesOfMonth', language)}</h2>
 <div className="flex items-center gap-2 text-xs">
 <span className="inline-block w-3 h-3 bg-blue-600"></span> FT
 <span className="inline-block w-3 h-3 bg-blue-400"></span> OR
 <span className="inline-block w-3 h-3 bg-blue-300"></span> NE
 </div>
 </div>
 <div className="px-4 py-4">
 <SeriesBars documents={documents} />
 </div>
 </div>
 </section>
 </div>
 </div>
 </Layout>
 );
}

function StatsCard({ title, value, href }: { title: string; value: string; href?: string }) {
 const Card = (
 <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 transition">
 <div className="text-sm text-gray-600 dark:text-gray-400">{title}</div>
 <div className="text-xl font-semibold mt-2 text-gray-900 dark:text-gray-100">{value}</div>
 </div>
 );
 return href ? <Link href={href}>{Card}</Link> : Card;
}

function Chart({ labels, series }: { labels: string[]; series: { name: string; color: string; values: number[] }[] }) {
 const max = Math.max(1, ...series.flatMap(s => s.values));
 return (
 <div>
 <div className="h-28 flex items-end gap-2">
 {labels.map((_, idx) => (
 <div key={idx} className="flex gap-1">
 {series.map(s => (
 <div key={s.name} style={{ height: `${Math.round((s.values[idx] || 0) / max * 100)}%`, backgroundColor: s.color }} className="w-3"></div>
 ))}
 </div>
 ))}
 </div>
 <div className="mt-3 grid grid-cols-12 text-[10px] text-gray-500 dark:text-gray-400">
 {labels.map((l, idx) => (
 <div key={idx} className="text-center">{l}</div>
 ))}
 </div>
 <div className="mt-3 flex gap-3 text-xs">
 {series.map(s => (
 <div key={s.name} className="flex items-center gap-2"><span className="inline-block w-2 h-2" style={{ backgroundColor: s.color }}></span><span className="text-gray-700 dark:text-gray-300">{s.name}</span></div>
 ))}
 </div>
 </div>
 );
}

function SeriesBars({ documents }: { documents: DocItem[] }) {
 const month = new Date().getMonth();
 const year = new Date().getFullYear();
 const data = { FT: 0, OR: 0, NE: 0 } as Record<string, number>;
 documents.forEach(d => {
 const dt = new Date(d.issueDate);
 if (dt.getMonth() === month && dt.getFullYear() === year) {
 const key = d.series || (d.documentType === 'factura' ? 'FT' : d.documentType === 'orçamento' ? 'OR' : 'NE');
 data[key] = (data[key] || 0) + (d.totals?.total || 0);
 }
 });
 const entries = Object.entries(data);
 const max = Math.max(1, ...entries.map(e => e[1]));
 const colors = { FT: '#1e40af', OR: '#3b82f6', NE: '#60a5fa' };
 return (
 <div className="grid grid-cols-6 gap-2 items-end">
 {entries.map(([k, v]) => (
 <div key={k} className="text-center">
 <div className="mx-auto w-10" style={{ height: `${Math.round(v / max * 100)}px`, backgroundColor: colors[k as keyof typeof colors] || '#3b82f6' }}></div>
 <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">{k}</div>
 </div>
 ))}
 </div>
 );
}

