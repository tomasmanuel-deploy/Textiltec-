import Head from 'next/head';
import Link from 'next/link';

export default function WriteOffsPage() {
 return (
 <>
 <Head>
 <title>Baixas de Stock</title>
 </Head>
 <div className="p-6">
 <h1 className="text-2xl font-semibold mb-2">Baixas de Stock</h1>
 <p className="text-gray-600 mb-6">Registo de quebras, perdas e ajustes de inventário.</p>

 <div className="border rounded p-4 bg-gray-50 mb-4">
 <p className="text-sm text-gray-600">Em breve: motivos de baixa, aprovação e impacto em stock.</p>
 </div>

 <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
 </div>
 </>
 );
}
