import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';

interface Party { name: string; nif?: string; address?: string; email?: string; phone?: string; }
interface Line { sku: string; description: string; quantity: number; unit: string; unitPrice: number; discount: number; vatRate: number; }
interface GuideDoc {
  id: string;
  series: string;
  sequentialNumber: number;
  documentType: string;
  issueDate: string;
  buyer: Party;
  lines: Line[];
  totals: { grandTotal: number };
  relatedDocuments?: string[];
}

interface DocumentSummary {
  id: string;
  documentType: 'factura' | 'orçamento' | 'nota_de_entrega' | string;
  series: string;
  sequentialNumber: number;
  issueDate: string;
  buyer: Party;
  lines: Array<{ sku: string; description: string; quantity: number; unit?: string; unitPrice?: number; discount?: number; vatRate?: number }>;
}

export default function TransportGuidesPage() {
  const router = useRouter();
  const [guides, setGuides] = useState<GuideDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ buyer: Party; lines: Line[] }>({ buyer: { name: '', nif: '', address: '' }, lines: [{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, discount: 0, vatRate: 0 }] });
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const TOAST_KEY = 'transportGuideToast';

  const fetchGuides = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/transport-guides');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar guias');
      setGuides(data.transportGuides || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro interno');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar documentos');
      const docs: DocumentSummary[] = (data.documents || []).map((d: any) => ({
        id: d.id,
        documentType: d.documentType,
        series: d.series,
        sequentialNumber: d.sequentialNumber,
        issueDate: d.issueDate,
        buyer: d.buyer,
        lines: (d.lines || []).map((ln: any) => ({
          sku: ln.sku,
          description: ln.description,
          quantity: ln.quantity,
          unit: ln.unit,
          unitPrice: ln.unitPrice,
          discount: ln.discount,
          vatRate: ln.vatRate,
        }))
      }));
      setDocuments(docs);
    } catch (e) {
      // Silenciosamente não bloqueia a página de guias
      console.error('Erro a carregar documentos:', e);
    }
  };

  useEffect(() => { fetchGuides(); fetchDocuments(); }, []);

  // Mostrar toast persistido ao retornar do PDF
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(TOAST_KEY) : null;
      if (raw) {
        const t = JSON.parse(raw);
        setToast(t);
        setTimeout(() => setToast(null), 3000);
        localStorage.removeItem(TOAST_KEY);
      }
    } catch {}
  }, []);

  // Auto-selecionar documento vindo da página de Documentos
  useEffect(() => {
    const fromDoc = router.query?.fromDoc;
    if (!fromDoc || documents.length === 0) return;
    const id = Array.isArray(fromDoc) ? fromDoc[0] : String(fromDoc);
    if (!id) return;
    // aplica seleção e importa linhas do documento especificado
    setSelectedDocumentIds(prev => {
      const next = prev.includes(id) ? prev : [id];
      applySelection(next);
      return next;
    });
  }, [router.query, documents]);

  const addLine = () => setForm({ ...form, lines: [...form.lines, { sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, discount: 0, vatRate: 0 }] });
  const removeLine = (idx: number) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });

  const applySelection = (ids: string[]) => {
    const selectedDocs = documents.filter(d => ids.includes(d.id));
    if (selectedDocs.length === 0) {
      setSelectionWarning(null);
      return;
    }
    // Detect different buyers across selected docs
    const firstBuyer = selectedDocs[0].buyer || { name: '' };
    const differentBuyer = selectedDocs.some(d => {
      const b = d.buyer || { name: '' };
      return (b.nif || '') !== (firstBuyer.nif || '') || (b.name || '') !== (firstBuyer.name || '');
    });
    setSelectionWarning(differentBuyer ? 'Documentos selecionados têm clientes diferentes. Usaremos o do primeiro.' : null);

    // Merge lines by SKU (sum quantities)
    const lineMap = new Map<string, Line>();
    selectedDocs.forEach(doc => {
      (doc.lines || []).forEach(ln => {
        const key = ln.sku;
        const existing = lineMap.get(key);
        if (existing) {
          lineMap.set(key, {
            ...existing,
            quantity: (existing.quantity || 0) + (ln.quantity || 0)
          });
        } else {
          lineMap.set(key, {
            sku: ln.sku,
            description: ln.description,
            quantity: ln.quantity || 0,
            unit: ln.unit || 'UN',
            unitPrice: ln.unitPrice || 0,
            discount: ln.discount || 0,
            vatRate: ln.vatRate || 0,
          });
        }
      });
    });

    const merged = Array.from(lineMap.values());
    setForm(prev => ({
      ...prev,
      buyer: {
        name: firstBuyer.name || prev.buyer.name,
        nif: firstBuyer.nif || prev.buyer.nif,
        address: firstBuyer.address || prev.buyer.address,
        email: firstBuyer.email || prev.buyer.email,
        phone: firstBuyer.phone || prev.buyer.phone,
      },
      lines: merged.length > 0 ? merged : prev.lines
    }));
  };

  const toggleSelectDocument = (docId: string) => {
    setSelectedDocumentIds(prev => {
      const next = prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId];
      applySelection(next);
      return next;
    });
  };

  const importSelectedDocumentsLines = () => {
    applySelection(selectedDocumentIds);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // Se nada estiver selecionado, usar o parâmetro fromDoc para manter a referência
      const fromDocParam = router.query?.fromDoc;
      const autoId = fromDocParam ? (Array.isArray(fromDocParam) ? fromDocParam[0] : String(fromDocParam)) : '';
      const sourceIds = selectedDocumentIds.length > 0 ? selectedDocumentIds : (autoId ? [autoId] : []);
      const res = await fetch('/api/transport-guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer: form.buyer, lines: form.lines, sourceDocumentIds: sourceIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar guia');
      // Abrir automaticamente o PDF da guia recém-criada
      if (data?.guide?.id) {
        try { localStorage.setItem(TOAST_KEY, JSON.stringify({ type: 'success', message: 'Guia criada — PDF aberto' })); } catch {}
        setToast({ type: 'success', message: 'Guia criada — PDF aberto' });
        setTimeout(() => setToast(null), 3000);
        openPdf(String(data.guide.id));
      }
      setForm({ buyer: { name: '', nif: '', address: '' }, lines: [{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, discount: 0, vatRate: 0 }] });
      setSelectedDocumentIds([]);
      await fetchGuides();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar');
    }
  };

  const openPdf = (id: string) => {
    window.open(`/api/documents/${id}/pdf?force=true`, '_self');
  };

  return (
    <Layout>
      <Head>
        <title>Guias de Transporte</title>
      </Head>
      <div className="p-6">
        {toast && (
          <div className={`mb-3 rounded px-3 py-2 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{toast.message}</div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Guias de Transporte</h1>
            <p className="text-gray-600">Emissão de guias com certificação AGT.</p>
          </div>
          <Link href="/warehouse" className="text-blue-600 hover:underline">Voltar à Gestão de Armazém</Link>
        </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border rounded p-4 bg-gray-50">
          <h2 className="font-medium mb-2">Nova Guia</h2>
          {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
          <form onSubmit={onCreate} className="space-y-3">
            {/* Origem: documentos existentes */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Importar de documentos</label>
              <div className="max-h-40 overflow-auto border rounded">
                {documents.filter(d => d.documentType === 'factura' || d.documentType === 'orçamento' || d.documentType === 'nota_de_entrega').length === 0 ? (
                  <div className="text-sm text-gray-500 p-2">Nenhum documento disponível</div>
                ) : (
                  documents
                    .filter(d => d.documentType === 'factura' || d.documentType === 'orçamento' || d.documentType === 'nota_de_entrega')
                    .map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-2 py-1 border-b text-sm">
                        <input type="checkbox" checked={selectedDocumentIds.includes(d.id)} onChange={() => toggleSelectDocument(d.id)} />
                        <span className="flex-1">
                          <span className="font-medium">{d.series}-{String(d.sequentialNumber).padStart(4,'0')}</span>
                          <span className="ml-2 text-gray-600">{d.buyer?.name || '-'}</span>
                        </span>
                        <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700">
                          {d.documentType === 'factura' ? 'Factura' : d.documentType === 'orçamento' ? 'Orçamento' : d.documentType === 'nota_de_entrega' ? 'Guia' : d.documentType}
                        </span>
                      </label>
                    ))
                )}
              </div>
              {selectionWarning && (
                <div className="mt-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">{selectionWarning}</div>
              )}
              <button type="button" className="mt-2 text-sm border px-3 py-1 rounded" onClick={importSelectedDocumentsLines}>Importar linhas selecionadas</button>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Destinatário</label>
              <input className="w-full border rounded px-3 py-2" placeholder="Nome" value={form.buyer.name} onChange={e => setForm({ ...form, buyer: { ...form.buyer, name: e.target.value } })} required />
              <input className="w-full border rounded px-3 py-2 mt-2" placeholder="NIF" value={form.buyer.nif} onChange={e => setForm({ ...form, buyer: { ...form.buyer, nif: e.target.value } })} />
              <input className="w-full border rounded px-3 py-2 mt-2" placeholder="Morada" value={form.buyer.address} onChange={e => setForm({ ...form, buyer: { ...form.buyer, address: e.target.value } })} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Linhas</span>
                <button type="button" className="text-sm text-blue-600" onClick={addLine}>Adicionar linha</button>
              </div>
              {form.lines.map((ln, idx) => (
                <div key={idx} className="flex gap-2">
                  <input className="border rounded px-3 py-2 flex-1" placeholder="SKU" value={ln.sku} onChange={e => {
                    const lines = [...form.lines];
                    lines[idx] = { ...lines[idx], sku: e.target.value };
                    setForm({ ...form, lines });
                  }} required />
                  <input className="border rounded px-3 py-2 flex-1" placeholder="Descrição" value={ln.description} onChange={e => {
                    const lines = [...form.lines];
                    lines[idx] = { ...lines[idx], description: e.target.value };
                    setForm({ ...form, lines });
                  }} required />
                  <input type="number" min={1} className="border rounded px-3 py-2 w-24" value={ln.quantity} onChange={e => {
                    const lines = [...form.lines];
                    lines[idx] = { ...lines[idx], quantity: parseInt(e.target.value || '1', 10) };
                    setForm({ ...form, lines });
                  }} required />
                </div>
              ))}
            </div>
            <button type="submit" className="bg-primary text-white px-4 py-2 rounded">Criar Guia</button>
          </form>
        </div>

          <div className="md:col-span-2">
            <div className="border rounded">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Série/Nº</th>
                    <th className="px-4 py-2">Destinatário</th>
                    <th className="px-4 py-2">Origem</th>
                    <th className="px-4 py-2">Linhas</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>
                  ) : guides.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Sem guias</td></tr>
                  ) : (
                    guides.map(g => (
                      <tr key={g.id} className="border-t">
                        <td className="px-4 py-2">{g.issueDate}</td>
                        <td className="px-4 py-2">{g.series}-{String(g.sequentialNumber).padStart(4,'0')}</td>
                        <td className="px-4 py-2">{g.buyer?.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {Array.isArray(g.relatedDocuments) && g.relatedDocuments.length > 0 ? (
                            g.relatedDocuments
                              .map(id => {
                                const d = documents.find(doc => doc.id === id);
                                if (!d) return id;
                                const label = `${d.series}-${String(d.sequentialNumber).padStart(4,'0')}`;
                                const typeLabel = d.documentType === 'factura' ? 'FT' : d.documentType === 'orçamento' ? 'OR' : d.documentType === 'nota_de_entrega' ? 'GR' : d.documentType;
                                return `${typeLabel}:${label}`;
                              })
                              .join(', ')
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">{g.lines.length}</td>
                        <td className="px-4 py-2">
                          <button onClick={() => openPdf(g.id)} className="border px-3 py-1 rounded">Emitir PDF</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}