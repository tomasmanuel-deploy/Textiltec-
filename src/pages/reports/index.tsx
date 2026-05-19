import Head from 'next/head';
import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

export default function ReportsPage() {
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 const [error, setError] = useState<string | null>(null);

 // Definir a data inicial como o dia atual (no fuso horário local)
 useEffect(() => {
 const now = new Date();
 const yyyy = now.getFullYear();
 const mm = String(now.getMonth() + 1).padStart(2, '0');
 const dd = String(now.getDate()).padStart(2, '0');
 const today = `${yyyy}-${mm}-${dd}`;
 setStartDate(today);
 setEndDate(today);
 }, []);

 const openReport = (endpoint: string) => {
 setError(null);
 try {
 const params = new URLSearchParams();
 if (startDate) params.set('startDate', startDate);
 if (endDate) params.set('endDate', endDate);
 const url = `/api/reports/${endpoint}?${params.toString()}`;
 window.open(url, '_blank');
 } catch (err) {
 setError('Falha ao abrir relatório');
 }
 };

 return (
 <Layout>
 <Head>
 <title>Relatórios</title>
 </Head>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-semibold mb-1">Relatórios</h1>
 <p className="text-gray-600">Estatísticas e relatórios operacionais.</p>
 </div>
 </div>

 <div className="mt-4">
 {/* Filtros de data no topo */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
 <div>
 <label className="block text-sm text-gray-600 mb-1">Data inicial</label>
 <input type="date" className="w-full border rounded px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-600 mb-1">Data final</label>
 <input type="date" className="w-full border rounded px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
 </div>
 </div>
 <p className="text-xs text-gray-500 mb-4">Os filtros de data aplicam-se a todos os relatórios abaixo.</p>
 {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {/* Saldo Geral / Somatória Geral */}
 <div className="flex items-center justify-between border rounded p-4 bg-green-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Saldo Geral</div>
 <div className="font-semibold">Somatória Geral</div>
 </div>
 <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={() => openReport('summary')}>Gerar</button>
 </div>

 {/* Lucro de Venda / Ganhos */}
 <div className="flex items-center justify-between border rounded p-4 bg-yellow-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Lucro de Venda</div>
 <div className="font-semibold">Ganhos</div>
 </div>
 <button className="bg-yellow-600 text-white px-3 py-2 rounded" onClick={() => openReport('profit')}>Gerar</button>
 </div>

 {/* Clientes Devedores / Em Dívidas */}
 <div className="flex items-center justify-between border rounded p-4 bg-red-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Clientes Devedores</div>
 <div className="font-semibold">Em Dívidas</div>
 </div>
 <button className="bg-red-600 text-white px-3 py-2 rounded" onClick={() => openReport('debtors')}>Gerar</button>
 </div>

 {/* Top dos Produtos mais vendidos / Vendas Top */}
 <div className="flex items-center justify-between border rounded p-4 bg-cyan-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Top dos Produtos mais vendidos</div>
 <div className="font-semibold">Vendas Top</div>
 </div>
 <button className="bg-cyan-600 text-white px-3 py-2 rounded" onClick={() => openReport('top-products')}>Gerar</button>
 </div>

 {/* Fluxo de Caixa / Movimentos de Caixa */}
 <div className="flex items-center justify-between border rounded p-4 bg-teal-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Fluxo de Caixa</div>
 <div className="font-semibold">Movimentos de Caixa</div>
 </div>
 <button className="bg-teal-600 text-white px-3 py-2 rounded" onClick={() => openReport('cash-flow')}>Gerar</button>
 </div>

 {/* Fluxo de Contabancaria / Movimentos Conta */}
 <div className="flex items-center justify-between border rounded p-4 bg-blue-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Fluxo de Contabancaria</div>
 <div className="font-semibold">Movimentos Conta</div>
 </div>
 <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => openReport('bank-flow')}>Gerar</button>
 </div>

 {/* Contas a Receber / Entradas */}
 <div className="flex items-center justify-between border rounded p-4 bg-emerald-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Contas a Receber</div>
 <div className="font-semibold">Entradas</div>
 </div>
 <button className="bg-emerald-600 text-white px-3 py-2 rounded" onClick={() => openReport('receivables')}>Gerar</button>
 </div>

 {/* Contas a Pagar / Dívidas */}
 <div className="flex items-center justify-between border rounded p-4 bg-orange-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Contas a Pagar</div>
 <div className="font-semibold">Dívidas</div>
 </div>
 <button className="bg-orange-600 text-white px-3 py-2 rounded" onClick={() => openReport('payables')}>Gerar</button>
 </div>

 {/* Conta Corrente de Clientes / Gestão de Clientes */}
 <div className="flex items-center justify-between border rounded p-4 bg-indigo-50 dark:bg-gray-800 dark:border-gray-700">
 <div>
 <div className="text-sm text-gray-600">Conta Corrente de Clientes</div>
 <div className="font-semibold">Gestão de Clientes</div>
 </div>
 <button className="bg-indigo-600 text-white px-3 py-2 rounded" onClick={() => openReport('clients-ledger')}>Gerar</button>
 </div>
 </div>

 {/* (Removido) bloco antigo de filtros no final */}
 </div>
 </div>
 </Layout>
 );
}
