import Head from 'next/head';
import Link from 'next/link';
import Layout from '../../components/Layout';

export default function WarehouseHome() {
 return (
 <Layout>
 <Head>
 <title>Gestão de Armazém</title>
 </Head>
 <div className="p-6">
 {/* Breadcrumbs e voltar */}
 <div className="flex items-center justify-between mb-4">
 <nav className="text-sm text-gray-600">
 <Link href="/" className="hover:underline">Início</Link>
 <span className="mx-2">/</span>
 <span className="text-gray-900">Gestão de Armazém</span>
 </nav>
 <Link href="/" className="inline-flex items-center gap-2 px-3 py-2 border rounded hover:bg-gray-50">
 <span>←</span>
 <span>Voltar</span>
 </Link>
 </div>

 <h1 className="text-2xl font-semibold mb-1">Gestão de Armazém</h1>
 <p className="text-gray-600 mb-6">Área central para operações de stock, logística e compras.</p>

 {/* Ações rápidas */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
 <Link href="/warehouses" className="border rounded p-4 bg-white hover:shadow transition">
 <h2 className="font-medium mb-1">Armazéns</h2>
 <p className="text-sm text-gray-600 mb-2">Locais físicos e endereços de stock.</p>
 <span className="text-blue-600">Abrir armazéns →</span>
 </Link>
 <Link href="/inventory" className="border rounded p-4 bg-white hover:shadow transition">
 <h2 className="font-medium mb-1">Inventário</h2>
 <p className="text-sm text-gray-600 mb-2">Contagens e reconciliações.</p>
 <span className="text-blue-600">Abrir inventário →</span>
 </Link>
 <Link href="/stock-in" className="border rounded p-4 bg-white hover:shadow transition">
 <h2 className="font-medium mb-1">Entrada de Stock</h2>
 <p className="text-sm text-gray-600 mb-2">Registo de receções.</p>
 <span className="text-blue-600">Abrir entradas →</span>
 </Link>
 </div>

 {/* Secções organizadas */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Produtos</h2>
 <p className="text-sm text-gray-600 mb-3">Catálogo, preços, unidades e impostos.</p>
 <Link href="/products" className="text-blue-600 hover:underline">Abrir produtos</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Séries</h2>
 <p className="text-sm text-gray-600 mb-3">Numeração por tipo de documento.</p>
 <Link href="/series" className="text-blue-600 hover:underline">Abrir séries</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Transferências</h2>
 <p className="text-sm text-gray-600 mb-3">Movimentos entre armazéns.</p>
 <Link href="/transfers" className="text-blue-600 hover:underline">Abrir transferências</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Compras a Fornecedores</h2>
 <p className="text-sm text-gray-600 mb-3">Pedidos, faturas e guias.</p>
 <Link href="/purchases" className="text-blue-600 hover:underline">Abrir compras</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Guia de Transporte</h2>
 <p className="text-sm text-gray-600 mb-3">Documentos de transporte.</p>
 <Link href="/transport-guides" className="text-blue-600 hover:underline">Abrir guias</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Baixa de Stock</h2>
 <p className="text-sm text-gray-600 mb-3">Quebras e ajustes.</p>
 <Link href="/write-offs" className="text-blue-600 hover:underline">Abrir baixas</Link>
 </div>

 <div className="border rounded p-4 bg-gray-50">
 <h2 className="font-medium mb-2">Armazéns</h2>
 <p className="text-sm text-gray-600 mb-3">Criar e gerir locais físicos.</p>
 <Link href="/warehouses" className="text-blue-600 hover:underline">Abrir armazéns</Link>
 </div>
 </div>
 </div>
 </Layout>
 );
}
