import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { t } from '@/lib/i18n';
import { useAppSettings } from '@/context/AppSettingsContext';
import { generateAdminReport } from '@/utils/generateAdminReport';
import { exportToExcel } from '@/utils/exportToExcel';
import { 
 BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
 PieChart, Pie, Cell
} from 'recharts';

interface CompanyStats {
 id: string;
 name: string;
 tradeName: string;
 nif: string;
 documentCount: number;
 lastDocumentDate: string | null;
 agtStatus: {
 success: number;
 error: number;
 pending: number;
 offline: number;
 };
 license: {
 isValid: boolean;
 expiresAt: string | null;
 daysRemaining: number | null;
 status: 'active' | 'expired' | 'missing' | 'warning';
 };
}

interface GlobalMetrics {
 totalCompanies: number;
 totalDocuments: number;
 totalRevenue: number;
 activeLicenses: number;
 expiringLicenses: number;
 agtPendingTotal: number;
 agtErrorTotal: number;
 agtSuccessTotal: number;
 monthlyEvolution: { month: string; count: number; revenue: number }[];
 documentTypeBreakdown: { type: string; count: number }[];
}

interface DashboardData {
 companies: CompanyStats[];
 globalMetrics: GlobalMetrics;
}

export default function AdminDashboard() {
 const router = useRouter();
 const { language } = useAppSettings();
 const [data, setData] = useState<DashboardData | null>(null);
 const [alerts, setAlerts] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [searchTerm, setSearchTerm] = useState('');
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 const [documentType, setDocumentType] = useState('all');
 const [showAlerts, setShowAlerts] = useState(false);
 const [mounted, setMounted] = useState(false);

 const fetchData = async () => {
 try {
 setLoading(true);
 const params = new URLSearchParams();
 if (startDate) params.append('startDate', startDate);
 if (endDate) params.append('endDate', endDate);
 if (documentType && documentType !== 'all') params.append('documentType', documentType);
 
 const [dashRes, alertsRes] = await Promise.all([
 fetch(`/api/admin/dashboard?${params.toString()}`),
 fetch('/api/admin/alerts')
 ]);

 if (!dashRes.ok) throw new Error('Failed to fetch dashboard data');
 
 const dashJson = await dashRes.json();
 setData(dashJson);

 if (alertsRes.ok) {
 const alertsJson = await alertsRes.json();
 setAlerts(alertsJson.alerts || []);
 }
 } catch (err) {
 console.error(err);
 setError('Erro ao carregar dados do dashboard.');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchData();
 // Refresh every 30 seconds
 const interval = setInterval(fetchData, 30000);
 return () => clearInterval(interval);
 }, [startDate, endDate, documentType]); // Re-fetch when filters change

 useEffect(() => {
 setMounted(true);
 }, []);

 const filteredCompanies = data?.companies.filter(c => 
 c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
 c.nif.includes(searchTerm) ||
 c.tradeName.toLowerCase().includes(searchTerm.toLowerCase())
 ) || [];

 const getLicenseColor = (status: string) => {
 switch(status) {
 case 'active': return 'bg-green-100 text-green-800';
 case 'warning': return 'bg-yellow-100 text-yellow-800';
 case 'expired': return 'bg-red-100 text-red-800';
 default: return 'bg-gray-100 text-gray-800';
 }
 };

 const formatCurrency = (val: number) => {
 return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(val);
 };

 const formatDate = (dateStr: string | null) => {
 if (!dateStr) return '-';
 return new Date(dateStr).toLocaleDateString('pt-PT', { 
 day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
 });
 };

 if (loading) {
 return (
 <Layout>
 <div className="flex justify-center items-center h-64">
 <div className="animate-spin h-12 w-12 border-b-2 border-blue-600"></div>
 </div>
 </Layout>
 );
 }

 if (error) {
 return (
 <Layout>
 <div className="p-4 bg-red-50 text-red-700 rounded-md">
 {error}
 </div>
 </Layout>
 );
 }

 return (
 <Layout>
 <Head>
 <title>Admin Dashboard | Billing System</title>
 </Head>

 <div className="space-y-6">
 <div className="flex justify-between items-center">
 <h1 className="text-2xl font-bold text-gray-800">Painel Administrativo</h1>
 <div className="flex space-x-4">
 <button 
 onClick={() => setShowAlerts(!showAlerts)}
 className="relative p-2 hover:bg-gray-100 focus:outline-none mr-2"
 title="Notificações"
 >
 <span className="text-xl">🔔</span>
 {alerts.length > 0 && (
 <span className="absolute top-0 right-0 block h-4 w-4 bg-red-500 ring-2 ring-white text-xs text-white text-center leading-4">
 {alerts.length}
 </span>
 )}
 </button>
 <div className="flex space-x-2">
 <button
 onClick={() => data && generateAdminReport(data.companies, data.globalMetrics)}
 className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
 >
 📄 PDF
 </button>
 <button
 onClick={() => data && exportToExcel(data.companies, data.globalMetrics)}
 className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
 >
 📊 Excel
 </button>
 </div>
 <Link href="/admin/companies/new" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
 + Nova Empresa
 </Link>
 <div className="text-sm text-gray-500 pt-2">
 Atualizado em: {new Date().toLocaleTimeString()}
 </div>
 </div>
 </div>

 {showAlerts && (
 <div className="bg-white shadow p-4 border border-gray-200 animate-fade-in-down mb-6">
 <div className="flex justify-between items-center mb-4 border-b pb-2">
 <h3 className="text-lg font-medium text-gray-900">Notificações Recentes</h3>
 <button onClick={() => setShowAlerts(false)} className="text-gray-400 hover:text-gray-600">×</button>
 </div>
 {alerts.length === 0 ? (
 <p className="text-gray-500 text-sm">Nenhuma notificação recente.</p>
 ) : (
 <ul className="space-y-3 max-h-60 overflow-y-auto">
 {alerts.map((alert: any) => (
 <li key={alert.id} className={`p-3 rounded-md text-sm border-l-4 ${
 alert.severity === 'high' ? 'bg-red-50 border-red-500 text-red-700' :
 alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-500 text-yellow-700' :
 'bg-blue-50 border-blue-500 text-blue-700'
 }`}>
 <div className="flex justify-between">
 <span className="font-semibold capitalize">{alert.type.replace('_', ' ')}</span>
 <span className="text-xs opacity-75">{new Date(alert.createdAt).toLocaleString()}</span>
 </div>
 <p className="mt-1">{alert.message}</p>
 <div className="mt-1 text-xs opacity-75">Para: {alert.recipient} • Status: {alert.status}</div>
 </li>
 ))}
 </ul>
 )}
 </div>
 )}

 {/* Filters */}
 <div className="bg-white p-4 shadow flex flex-wrap gap-4 items-center">
 <div className="flex items-center space-x-2">
 <label className="text-sm font-medium text-gray-700">De:</label>
 <input
 type="date"
 value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
 />
 </div>
 <div className="flex items-center space-x-2">
 <label className="text-sm font-medium text-gray-700">Até:</label>
 <input
 type="date"
 value={endDate}
 onChange={(e) => setEndDate(e.target.value)}
 className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
 />
 </div>
 <div className="flex items-center space-x-2">
 <label className="text-sm font-medium text-gray-700">Tipo:</label>
 <select
 value={documentType}
 onChange={(e) => setDocumentType(e.target.value)}
 className="mt-1 block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
 >
 <option value="all">Todos</option>
 <option value="FT">Factura</option>
 <option value="FR">Factura-Recibo</option>
 <option value="NC">Nota de Crédito</option>
 <option value="ND">Nota de Débito</option>
 <option value="RC">Recibo</option>
 <option value="PP">Proforma</option>
 </select>
 </div>
 {(startDate || endDate || documentType !== 'all') && (
 <button
 onClick={() => { setStartDate(''); setEndDate(''); setDocumentType('all'); }}
 className="text-sm text-red-600 hover:text-red-800"
 >
 Limpar Filtros
 </button>
 )}
 </div>

 {/* Global Metrics Cards */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <MetricCard 
 title="Total Empresas" 
 value={data?.globalMetrics.totalCompanies || 0} 
 icon="🏢" 
 color="blue"
 />
 <MetricCard 
 title="Total Documentos" 
 value={data?.globalMetrics.totalDocuments || 0} 
 icon="📄" 
 color="indigo"
 />
 <MetricCard 
 title="Receita Total (AOA)" 
 value={formatCurrency(data?.globalMetrics.totalRevenue || 0)} 
 icon="💰" 
 color="green"
 />
 <MetricCard 
 title="Licenças a Expirar" 
 value={data?.globalMetrics.expiringLicenses || 0} 
 icon="⚠️" 
 color="yellow"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <MetricCard 
 title="Licenças Ativas" 
 value={data?.globalMetrics.activeLicenses || 0} 
 icon="✅" 
 color="teal"
 />
 <MetricCard 
 title="AGT Pendentes" 
 value={data?.globalMetrics.agtPendingTotal || 0} 
 icon="⏳" 
 color="orange"
 />
 <MetricCard 
 title="AGT Erros" 
 value={data?.globalMetrics.agtErrorTotal || 0} 
 icon="❌" 
 color="red"
 />
 </div>

 {/* Companies List */}
 <div className="bg-white shadow overflow-hidden">
 <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
 <h2 className="text-lg font-semibold text-gray-800">Monitoramento de Empresas</h2>
 <input
 type="text"
 placeholder="Buscar empresa..."
 className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 />
 </div>
 
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa / NIF</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Docs</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Emissão</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status AGT (S/E/P/O)</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Licença</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
 </tr>
 </thead>
 <tbody className="bg-white divide-y divide-gray-200">
 {filteredCompanies.map((company) => (
 <tr key={company.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="text-sm font-medium text-gray-900">{company.name}</div>
 <div className="text-sm text-gray-500">{company.nif}</div>
 {company.tradeName && <div className="text-xs text-gray-400">{company.tradeName}</div>}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
 {company.documentCount}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
 {formatDate(company.lastDocumentDate)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="flex space-x-1 text-xs font-mono">
 <span title="Sucesso" className="px-2 py-1 bg-green-100 text-green-800 rounded">{company.agtStatus.success}</span>
 <span title="Erro" className="px-2 py-1 bg-red-100 text-red-800 rounded">{company.agtStatus.error}</span>
 <span title="Pendente" className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">{company.agtStatus.pending}</span>
 <span title="Offline" className="px-2 py-1 bg-gray-100 text-gray-800 rounded">{company.agtStatus.offline}</span>
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className={`px-2 inline-flex text-xs leading-5 font-semibold ${getLicenseColor(company.license.status)}`}>
 {company.license.status === 'active' ? 'Ativa' : 
 company.license.status === 'warning' ? `Expira em ${company.license.daysRemaining} dias` :
 company.license.status === 'expired' ? 'Expirada' : 'Ausente'}
 </span>
 {company.license.expiresAt && (
 <div className="text-xs text-gray-500 mt-1">Até: {new Date(company.license.expiresAt).toLocaleDateString()}</div>
 )}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
 <Link href={`/admin/companies/${company.id}`} className="text-blue-600 hover:text-blue-900 mr-3">Detalhes</Link>
 <Link href={`/admin/companies/${company.id}/settings`} className="text-indigo-600 hover:text-indigo-900">Config</Link>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 {filteredCompanies.length === 0 && (
 <div className="px-6 py-4 text-center text-gray-500">
 Nenhuma empresa encontrada.
 </div>
 )}
 </div>
 </div>

 {/* Charts Section */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="bg-white shadow p-6">
 <h3 className="text-lg font-medium text-gray-900 mb-4">Status de Transmissão AGT</h3>
 <div className="h-64 flex items-center justify-center border border-gray-100 ">
 {mounted && data && (
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={[
 { name: 'Sucesso', value: data.globalMetrics.agtSuccessTotal || 0, color: '#10B981' },
 { name: 'Erro', value: data.globalMetrics.agtErrorTotal || 0, color: '#EF4444' },
 { name: 'Pendente', value: data.globalMetrics.agtPendingTotal || 0, color: '#F59E0B' },
 ]}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={80}
 paddingAngle={5}
 dataKey="value"
 >
 {[
 { name: 'Sucesso', value: data.globalMetrics.agtSuccessTotal || 0, color: '#10B981' },
 { name: 'Erro', value: data.globalMetrics.agtErrorTotal || 0, color: '#EF4444' },
 { name: 'Pendente', value: data.globalMetrics.agtPendingTotal || 0, color: '#F59E0B' },
 ].map((entry, index) => (
 <Cell key={`cell-${index}`} fill={entry.color} />
 ))}
 </Pie>
 <Tooltip />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>
 
 <div className="bg-white shadow p-6">
 <h3 className="text-lg font-medium text-gray-900 mb-4">Tipos de Documentos</h3>
 <div className="h-64 flex items-center justify-center border border-gray-100 ">
 {mounted && data && (
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={data.globalMetrics.documentTypeBreakdown || []}
 cx="50%"
 cy="50%"
 outerRadius={80}
 fill="#8884d8"
 dataKey="count"
 nameKey="type"
 label
 >
 {(data.globalMetrics.documentTypeBreakdown || []).map((entry, index) => (
 <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'][index % 6]} />
 ))}
 </Pie>
 <Tooltip />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>

 <div className="bg-white shadow p-6">
 <h3 className="text-lg font-medium text-gray-900 mb-4">Evolução de Emissão (Mensal)</h3>
 <div className="h-64 flex items-center justify-center border border-gray-100 ">
 {mounted && data && (
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={data.globalMetrics.monthlyEvolution || []}
 margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
 >
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="month" />
 <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
 <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
 <Tooltip />
 <Legend />
 <Bar yAxisId="left" dataKey="count" name="Qtd Docs" fill="#8884d8" />
 <Bar yAxisId="right" dataKey="revenue" name="Receita (AOA)" fill="#82ca9d" />
 </BarChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>
 </div>

 </div>
 </Layout>
 );
}

function MetricCard({ title, value, icon, color }: { title: string, value: string | number, icon: string, color: string }) {
 const colorClasses: Record<string, string> = {
 blue: 'bg-blue-500',
 indigo: 'bg-indigo-500',
 green: 'bg-green-500',
 yellow: 'bg-yellow-500',
 teal: 'bg-teal-500',
 orange: 'bg-orange-500',
 red: 'bg-red-500',
 };
 
 return (
 <div className="bg-white overflow-hidden shadow ">
 <div className="p-5">
 <div className="flex items-center">
 <div className={`flex-shrink-0 rounded-md p-3 ${colorClasses[color] || 'bg-gray-500'}`}>
 <span className="text-white text-2xl">{icon}</span>
 </div>
 <div className="ml-5 w-0 flex-1">
 <dl>
 <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
 <dd>
 <div className="text-lg font-medium text-gray-900">{value}</div>
 </dd>
 </dl>
 </div>
 </div>
 </div>
 </div>
 );
}

