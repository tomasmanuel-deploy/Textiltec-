import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { 
 BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
 LineChart, Line, PieChart, Pie, Cell
} from 'recharts';

interface DashboardStats {
 totalSubmissions: number;
 errors: number;
 activeTenants: number;
 tenantStats: Record<string, {
 submissions: number;
 errors: number;
 lastActive: string;
 }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function CentralDashboard() {
 const [stats, setStats] = useState<DashboardStats | null>(null);
 const [loading, setLoading] = useState(true);
 const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
 const [userRole, setUserRole] = useState<'Admin' | 'Manager' | 'Viewer'>('Admin');

 const fetchStats = async () => {
 try {
 const res = await fetch('/api/central/stats');
 if (res.ok) {
 const data = await res.json();
 setStats(data);
 setLastUpdated(new Date());
 }
 } catch (error) {
 console.error('Failed to fetch dashboard stats:', error);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchStats();
 const interval = setInterval(fetchStats, 5000); // Poll every 5 seconds
 return () => clearInterval(interval);
 }, []);

 // Prepare data for charts
 const tenantData = stats ? Object.entries(stats.tenantStats).map(([name, data]) => ({
 name: name.substring(0, 8), // Truncate ID
 fullId: name,
 submissions: data.submissions,
 errors: data.errors
 })) : [];

 const pieData = stats ? [
 { name: 'Success', value: stats.totalSubmissions - stats.errors },
 { name: 'Errors', value: stats.errors }
 ] : [];

 return (
 <Layout title="Central Control Panel | AGT Monitoring">
 <Head>
 <title>Central Control Panel | AGT Monitoring</title>
 </Head>

 <div className="space-y-6">
 <div className="flex justify-between items-center bg-white p-6 border border-gray-200">
 <div>
 <h1 className="text-3xl font-bold text-gray-900">Central Control Panel</h1>
 <p className="text-gray-500 mt-1">
 Monitoring {stats?.activeTenants || 0} active tenants across all deployments
 </p>
 </div>
 <div className="flex items-center space-x-4">
 <div className="flex items-center space-x-2 mr-4">
 <label className="text-sm font-medium text-gray-700">View as:</label>
 <select 
 value={userRole} 
 onChange={(e) => setUserRole(e.target.value as any)}
 className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
 >
 <option value="Admin">Admin</option>
 <option value="Manager">Manager</option>
 <option value="Viewer">Viewer</option>
 </select>
 </div>
 <span className="flex h-3 w-3 relative">
 <span className="animate-ping absolute inline-flex h-full w-full bg-green-400 opacity-75"></span>
 <span className="relative inline-flex h-3 w-3 bg-green-500"></span>
 </span>
 <span className="text-sm text-gray-500">
 Live Stream · Updated: {lastUpdated.toLocaleTimeString()}
 </span>
 </div>
 </div>

 {/* Key Metrics */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <MetricCard 
 title="Total Documents" 
 value={stats?.totalSubmissions || 0} 
 icon="📄" 
 trend="+12%" 
 />
 <MetricCard 
 title="Active Tenants" 
 value={stats?.activeTenants || 0} 
 icon="🏢" 
 trend="Stable"
 />
 <MetricCard 
 title="Success Rate" 
 value={`${stats ? ((1 - (stats.errors / (stats.totalSubmissions || 1))) * 100).toFixed(1) : 100}%`} 
 icon="✅" 
 color="text-green-600"
 />
 <MetricCard 
 title="AGT Errors" 
 value={stats?.errors || 0} 
 icon="⚠️" 
 color="text-red-600"
 />
 </div>

 {/* Charts Row */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Submissions by Tenant */}
 <div className="bg-white p-6 border border-gray-200">
 <h3 className="text-lg font-semibold mb-4">Activity by Tenant</h3>
 <div className="h-80">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={tenantData}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="name" />
 <YAxis />
 <RechartsTooltip />
 <Legend />
 <Bar dataKey="submissions" fill="#4F46E5" name="Submissions" />
 <Bar dataKey="errors" fill="#EF4444" name="Errors" />
 </BarChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* Status Distribution */}
 <div className="bg-white p-6 border border-gray-200">
 <h3 className="text-lg font-semibold mb-4">Submission Status</h3>
 <div className="h-80 flex items-center justify-center">
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie
 data={pieData}
 cx="50%"
 cy="50%"
 innerRadius={60}
 outerRadius={100}
 fill="#8884d8"
 paddingAngle={5}
 dataKey="value"
 >
 {pieData.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={index === 0 ? '#10B981' : '#EF4444'} />
 ))}
 </Pie>
 <RechartsTooltip />
 <Legend />
 </PieChart>
 </ResponsiveContainer>
 </div>
 </div>
 </div>

 {/* Recent Activity Table */}
 <div className="bg-white border border-gray-200 overflow-hidden">
 <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
 <h3 className="text-lg font-semibold text-gray-800">Tenant Status Overview</h3>
 {userRole !== 'Viewer' && (
 <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
 Export Report
 </button>
 )}
 </div>
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200">
 <thead className="bg-gray-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant ID</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submissions</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
 </tr>
 </thead>
 <tbody className="bg-white divide-y divide-gray-200">
 {tenantData.length > 0 ? (
 tenantData.map((tenant) => (
 <tr key={tenant.fullId} className="hover:bg-gray-50">
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
 {tenant.fullId}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className="px-2 inline-flex text-xs leading-5 font-semibold bg-green-100 text-green-800">
 Online
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
 {stats?.tenantStats[tenant.fullId]?.lastActive ? new Date(stats.tenantStats[tenant.fullId].lastActive).toLocaleString() : 'N/A'}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
 {tenant.submissions}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="w-full bg-gray-200 h-2.5 dark:bg-gray-700 max-w-[100px]">
 <div 
 className={`h-2.5 ${tenant.errors > 0 ? 'bg-yellow-400' : 'bg-green-600'}`} 
 style={{ width: '95%' }}
 ></div>
 </div>
 </td>
 </tr>
 ))
 ) : (
 <tr>
 <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
 No active tenants found. Waiting for incoming data streams...
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </Layout>
 );
}

function MetricCard({ title, value, icon, trend, color = 'text-gray-900' }: any) {
 return (
 <div className="bg-white p-6 border border-gray-200 hover: transition-shadow">
 <div className="flex justify-between items-start">
 <div>
 <p className="text-sm font-medium text-gray-500">{title}</p>
 <h3 className={`text-2xl font-bold mt-2 ${color}`}>{value}</h3>
 </div>
 <div className="p-3 bg-gray-50 text-xl">
 {icon}
 </div>
 </div>
 {trend && (
 <div className="mt-4 flex items-center text-sm">
 <span className="text-green-600 font-medium">{trend}</span>
 <span className="text-gray-400 ml-2">vs last 24h</span>
 </div>
 )}
 </div>
 );
}

