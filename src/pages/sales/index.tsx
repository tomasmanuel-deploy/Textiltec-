import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface DocumentBuyer {
 name: string;
 nif: string;
}

interface DocumentTotals {
 subtotal: number;
 discount: number;
 vatTotal: number;
 total: number;
}

interface DocumentItem {
 id: string;
 sequentialNumber: number;
 documentType: string;
 issueDate: string;
 seller?: { name?: string; tradeName?: string; nif?: string };
 buyer: DocumentBuyer;
 totals: DocumentTotals;
 status: string;
}

export default function SalesDashboard() {
 const [documents, setDocuments] = useState<DocumentItem[]>([]);
 const [loading, setLoading] = useState<boolean>(true);
 const [error, setError] = useState<string>('');
 const todayStr = () => {
 const d = new Date();
 const pad = (n: number) => String(n).padStart(2, '0');
 return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
 };
 const [startDate, setStartDate] = useState<string>(todayStr());
 const [endDate, setEndDate] = useState<string>(todayStr());
 const [typeFilter, setTypeFilter] = useState<string>('all');
 const [activeNif, setActiveNif] = useState<string>('');

 // AGT Compliance: Rounding helper (Round Half Up)
 const round = (value: number, decimals: number = 2): number => {
 return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
 };

 useEffect(() => {
 const loadDocuments = async () => {
 try {
 const res = await fetch('/api/documents');
 const data = await res.json();
 setDocuments(data.documents || []);
 } catch (err) {
 console.error('Erro ao carregar documentos:', err);
 setError('Falha ao carregar documentos');
 } finally {
 setLoading(false);
 }
 };
 const loadCompany = async () => {
 try {
 const resp = await fetch('/api/settings/company');
 if (resp.ok) {
 const data = await resp.json();
 setActiveNif(data?.company?.nif || '');
 }
 } catch {}
 };
 loadDocuments();
 loadCompany();
 }, []);

 const filteredDocuments = useMemo(() => {
 const start = startDate ? new Date(startDate) : null;
 const end = endDate ? new Date(endDate) : null;
 const byCompany = activeNif ? documents.filter(doc => (doc.seller?.nif || '') === activeNif) : documents;
 return byCompany.filter(doc => {
 const issue = new Date(doc.issueDate);
 const inRange = (!start || issue >= start) && (!end || issue <= end);
 const typeOk = typeFilter === 'all' ? true : doc.documentType === typeFilter;
 return inRange && typeOk;
 });
 }, [documents, startDate, endDate, typeFilter]);

 const formatCurrency = (value: number): string => {
 return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value);
 };

 const totals = useMemo(() => {
 const totalGeral = round(filteredDocuments.reduce((sum, d) => sum + (d.totals?.total || 0), 0));
 const porTipo: Record<string, number> = {};
 filteredDocuments.forEach(d => {
 const key = d.documentType || 'desconhecido';
 porTipo[key] = round((porTipo[key] || 0) + (d.totals?.total || 0));
 });
 return { totalGeral, porTipo };
 }, [filteredDocuments]);

 // Períodos rápidos ancorados no dia atual
 const toISO = (d: Date) => {
 const pad = (n: number) => String(n).padStart(2, '0');
 return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
 };
 const setUltimos30Dias = () => {
 const today = new Date();
 const start = new Date(today);
 start.setDate(start.getDate() - 30);
 setStartDate(toISO(start));
 setEndDate(toISO(today));
 };
 const set30DiasAnteriores = () => {
 const today = new Date();
 const end = new Date(today);
 end.setDate(end.getDate() - 30);
 const start = new Date(today);
 start.setDate(start.getDate() - 60);
 setStartDate(toISO(start));
 setEndDate(toISO(end));
 };
 const setMesPassadoCalendario = () => {
 const now = new Date();
 const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
 const lastPrev = new Date(now.getFullYear(), now.getMonth(), 0);
 setStartDate(toISO(firstPrev));
 setEndDate(toISO(lastPrev));
 };
 const setMesAntepassadoCalendario = () => {
 const now = new Date();
 const first = new Date(now.getFullYear(), now.getMonth() - 2, 1);
 const last = new Date(now.getFullYear(), now.getMonth() - 1, 0);
 setStartDate(toISO(first));
 setEndDate(toISO(last));
 };

 // Comparação de progresso: últimos 30 dias vs 30 dias anteriores
 const totalUltimos30Dias = useMemo(() => {
 const today = new Date();
 const start = new Date(today);
 start.setDate(start.getDate() - 30);
 return documents
 .filter(d => {
 const dt = new Date(d.issueDate);
 return dt >= start && dt <= today && d.documentType === 'factura';
 })
 .reduce((s, d) => s + (d.totals?.total || 0), 0);
 }, [documents]);
 const total30DiasAnteriores = useMemo(() => {
 const today = new Date();
 const end = new Date(today);
 end.setDate(end.getDate() - 30);
 const start = new Date(today);
 start.setDate(start.getDate() - 60);
 return documents
 .filter(d => {
 const dt = new Date(d.issueDate);
 return dt >= start && dt <= end && d.documentType === 'factura';
 })
 .reduce((s, d) => s + (d.totals?.total || 0), 0);
 }, [documents]);
 const progressoPct = useMemo(() => {
 if (!total30DiasAnteriores) return totalUltimos30Dias ? 100 : 0;
 return Math.round(((totalUltimos30Dias - total30DiasAnteriores) / total30DiasAnteriores) * 100);
 }, [totalUltimos30Dias, total30DiasAnteriores]);

 return (
 <>
 <Head>
 <title>Painel de Vendas</title>
 </Head>
 <div className="p-6">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <Link href="/" className="inline-flex items-center text-gray-700 hover:text-gray-900">
 <span className="text-xl">←</span>
 <span className="ml-2">Voltar</span>
 </Link>
 <h1 className="text-2xl font-semibold">Painel de Vendas</h1>
 </div>
 <button
 type="button"
 className="border px-3 py-1.5 rounded text-sm"
 onClick={() => {
 const params = new URLSearchParams();
 if (startDate) params.set('startDate', startDate);
 if (endDate) params.set('endDate', endDate);
 if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
 const url = `/api/sales/report?${params.toString()}`;
 window.open(url, '_blank');
 }}
 >
 Exportar PDF Certificado
 </button>
 </div>

 {/* Filtros */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
 <div>
 <label className="block text-sm text-gray-700">Data inicial</label>
 <input
 type="date"
 className="mt-1 block w-full border rounded p-2"
 value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700">Data final</label>
 <input
 type="date"
 className="mt-1 block w-full border rounded p-2"
 value={endDate}
 onChange={(e) => setEndDate(e.target.value)}
 />
 </div>
 <div>
 <label className="block text-sm text-gray-700">Tipo de documento</label>
 <select
 className="mt-1 block w-full border rounded p-2"
 value={typeFilter}
 onChange={(e) => setTypeFilter(e.target.value)}
 >
 <option value="all">Todos</option>
 <option value="factura">Factura</option>
 <option value="orçamento">Orçamento</option>
 {/* Caso adicionemos "recibo"/outros, entram aqui */}
 </select>
 </div>
 <div className="flex items-end">
 <div className="text-sm text-gray-600">Documentos carregados</div>
 <div className="ml-2 font-medium">{documents.length}</div>
 </div>
 </div>

 {/* Períodos rápidos e progresso */}
 <div className="flex flex-wrap items-center gap-2 mb-6">
 <span className="text-sm text-gray-700 mr-2">Períodos rápidos:</span>
 <button className="text-sm px-3 py-1 border rounded hover:bg-gray-50" onClick={setUltimos30Dias}>Últimos 30 dias</button>
 <button className="text-sm px-3 py-1 border rounded hover:bg-gray-50" onClick={set30DiasAnteriores}>30 dias anteriores</button>
 <button className="text-sm px-3 py-1 border rounded hover:bg-gray-50" onClick={setMesPassadoCalendario}>Mês passado (calendário)</button>
 <button className="text-sm px-3 py-1 border rounded hover:bg-gray-50" onClick={setMesAntepassadoCalendario}>Mês antepassado (calendário)</button>
 <div className="ml-auto flex items-center gap-3 px-3 py-2 border rounded bg-gray-50">
 <div>
 <div className="text-xs text-gray-600">Últimos 30 dias</div>
 <div className="font-semibold">{formatCurrency(totalUltimos30Dias)}</div>
 </div>
 <div>
 <div className="text-xs text-gray-600">30 dias anteriores</div>
 <div className="font-semibold">{formatCurrency(total30DiasAnteriores)}</div>
 </div>
 <div>
 <div className="text-xs text-gray-600">Progresso</div>
 <div className={`font-semibold ${progressoPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>{progressoPct}%</div>
 </div>
 </div>
 </div>

 {/* Resumo */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
 <div className="border rounded p-4 bg-gray-50">
 <div className="text-sm text-gray-600">Total Geral</div>
 <div className="text-xl font-semibold">{formatCurrency(totals.totalGeral)}</div>
 </div>
 <div className="border rounded p-4 bg-gray-50">
 <div className="text-sm text-gray-600">Total Facturas</div>
 <div className="text-lg font-medium">{formatCurrency(totals.porTipo['factura'] || 0)}</div>
 </div>
 <div className="border rounded p-4 bg-gray-50">
 <div className="text-sm text-gray-600">Total Orçamentos</div>
 <div className="text-lg font-medium">{formatCurrency(totals.porTipo['orçamento'] || 0)}</div>
 </div>
 </div>

 {/* Lista de documentos filtrados */}
 <div className="bg-white border rounded">
 <div className="p-4 border-b flex justify-between items-center">
 <div className="font-medium">Documentos</div>
 {error && <div className="text-red-600 text-sm">{error}</div>}
 </div>
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y">
 <thead>
 <tr className="bg-gray-50">
 <th className="px-4 py-2 text-left text-xs text-gray-600">#</th>
 <th className="px-4 py-2 text-left text-xs text-gray-600">Tipo</th>
 <th className="px-4 py-2 text-left text-xs text-gray-600">Data</th>
 <th className="px-4 py-2 text-left text-xs text-gray-600">Cliente</th>
 <th className="px-4 py-2 text-right text-xs text-gray-600">Total</th>
 <th className="px-4 py-2 text-right text-xs text-gray-600">Ações</th>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr>
 <td colSpan={6} className="px-4 py-6 text-center text-gray-500">Carregando...</td>
 </tr>
 ) : filteredDocuments.length === 0 ? (
 <tr>
 <td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhum documento encontrado no período</td>
 </tr>
 ) : (
 filteredDocuments.map(doc => (
 <tr key={doc.id} className="border-t">
 <td className="px-4 py-2">{doc.sequentialNumber}</td>
 <td className="px-4 py-2">{doc.documentType}</td>
 <td className="px-4 py-2">{doc.issueDate}</td>
 <td className="px-4 py-2">{doc.buyer?.name}</td>
 <td className="px-4 py-2 text-right">{formatCurrency(doc.totals?.total || 0)}</td>
 <td className="px-4 py-2 text-right">
 <Link href={`/documents/${doc.id}`} className="text-blue-600 hover:underline">Ver</Link>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </>
 );
}
