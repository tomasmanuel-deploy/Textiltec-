import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useToast } from '@/context/ToastContext';
import Button from '@/components/ui/Button';
import type { SeriesConfig } from '@/lib/seriesStore';

// VAT exemption reasons
const VAT_EXEMPTION_OPTIONS = [
  // Incompletas e complementares (legacy)
  { code: 'M01', label: 'Exportação' },
  { code: 'M03', label: 'Serviços de saúde' },
  { code: 'M05', label: 'Serviços financeiros' },
  { code: 'M90', label: 'Isento nos termos da alínea a) do nº1 do artigo 16.º' },
  { code: 'M91', label: 'Isento nos termos da alínea b) do nº1 do artigo 16.º' },
  { code: 'M92', label: 'Isento nos termos da alínea c) do nº1 do artigo 16.º' },
  { code: 'M93', label: 'Isento nos termos da alínea d) do nº1 do artigo 16.º' },
  { code: 'M94', label: 'Isento nos termos da alínea e) do nº1 do artigo 16.º' },
  { code: 'M99', label: 'Outras isenções' },
  // Lista fornecida
  { code: 'M00', label: 'Regime Simplificado' },
  { code: 'M02', label: 'Transmissão de bens e serviço não sujeita' },
  { code: 'M04', label: 'Regime de Exclusão' },
  { code: 'M10', label: 'Bens alimentares (Anexo I do Código do IVA)' },
  { code: 'M11', label: 'Medicamentos de fins terapêuticos e profilácticos' },
  { code: 'M12', label: 'Cadeiras de rodas e equipamentos para pessoas com deficiência' },
  { code: 'M13', label: 'Livros (inclui formato digital)' },
  { code: 'M14', label: 'Locação de bens imóveis destinados a fins habitacionais' },
  { code: 'M15', label: 'Operações sujeitas ao imposto de SISA' },
  { code: 'M16', label: 'Exploração e prática de jogos de fortuna ou azar e diversão' },
  { code: 'M17', label: 'Transporte colectivo de passageiros' },
  { code: 'M18', label: 'Intermediação financeira (inclui locação financeira)' },
  { code: 'M19', label: 'Seguro de saúde e seguros/resseguros do ramo vida' },
  { code: 'M20', label: 'Transmissões de produtos petrolíferos (Anexo II do Código)' },
  { code: 'M21', label: 'Serviços de ensino por estabelecimentos reconhecidos' },
  { code: 'M22', label: 'Serviços médico-sanitários por estabelecimentos de saúde' },
  { code: 'M23', label: 'Transporte de doentes/feridos por entidades autorizadas' },
  { code: 'M24', label: 'Equipamentos médicos para actividade de saúde' },
  // Importação (incompletas)
  { code: 'M80', label: 'Importações definitivas de bens cuja transmissão seja isenta' },
  { code: 'M81', label: 'Importações de ouro, moedas ou notas pelo BNA' },
  { code: 'M82', label: 'Importações para atenuar efeitos de calamidades naturais' },
  { code: 'M83', label: 'Importações para operações petrolíferas e mineiras' },
  { code: 'M84', label: 'Importação de moeda estrangeira por instituições bancárias' },
  { code: 'M85', label: 'Tratados e acordos internacionais (nos termos previstos)' },
  { code: 'M86', label: 'Relações diplomáticas e consulares (tratados/acordos)' },
  // Completas
  { code: 'M30', label: 'Transmissões com destino ao estrangeiro' },
  { code: 'M31', label: 'Abastecimento a embarcações em alto mar' },
  { code: 'M32', label: 'Abastecimento a aeronaves em tráfego internacional' },
  { code: 'M33', label: 'Abastecimento a salvamento, pesca costeira e guerra (destino exterior)' },
  { code: 'M34', label: 'Transmissões/serviços para companhias aéreas/marítimas internacionais' },
  { code: 'M35', label: 'Relações diplomáticas e consulares (acordos internacionais)' },
  { code: 'M36', label: 'Organismos reconhecidos por Angola (acordos internacionais)' },
  { code: 'M37', label: 'Tratados e acordos internacionais (isenções decorrentes)' },
  { code: 'M38', label: 'Transporte de pessoas provenientes/destino ao estrangeiro' },
];
const DEFAULT_VAT_EXEMPTION_REASON = process.env.NEXT_PUBLIC_DEFAULT_VAT_EXEMPTION_REASON || 'M00';

interface DocumentItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  vatExemptionReason?: string;
  total: number;
}

interface Document {
  id: string;
  sequentialNumber: string;
  series: string;
  documentType: 'factura' | 'orçamento' | 'nota_de_entrega' | 'nota_de_credito' | 'recibo' | 'factura_recibo' | 'nota_de_debito' | 'proforma';
  issueDate: string;
  taxableDate: string;
  customerName: string;
  customerNif: string;
  customerAddress: string;
  items: DocumentItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
}

interface Client {
  id: string;
  name: string;
  tradeName?: string;
  nif: string;
  address: string;
  email: string;
  phone: string;
  clientType: 'company' | 'individual';
  status: 'active' | 'inactive';
}

export default function EditDocument() {
  const router = useRouter();
 const toast = useToast();
  const { id } = router.query;
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [formData, setFormData] = useState({
    documentType: '',
    issueDate: '',
    taxableDate: '',
    selectedClientId: '',
    customerName: '',
    customerNif: '',
    customerAddress: '',
    items: [] as DocumentItem[]
  });
  const [seriesOptions, setSeriesOptions] = useState<SeriesConfig[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string>('');

  // AGT Compliance: Rounding helper (Round Half Up)
  const round = (value: number, decimals: number = 2): number => {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  };

  // Fetch clients on component mount
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch('/api/clients?status=active&limit=100');
        const data = await response.json();
        setClients(data.clients || []);
      } catch (error) {
        console.error('Erro ao carregar clientes:', error);
      } finally {
        setLoadingClients(false);
      }
    };

    fetchClients();
  }, []);

  useEffect(() => {
    const loadDocument = async () => {
      if (!id) return;
      const documentId = Array.isArray(id) ? id[0] : id;

      try {
        // Try to fetch from API first
        const resp = await fetch(`/api/documents/${documentId}`);
        if (resp.ok) {
          const data = await resp.json();
          const d = data.document;

          // Guard: only allow editing when original status is 'draft'
          if (d.status !== 'draft') {
            toast.info('Este documento não está em rascunho e não pode ser editado.');
            router.replace(`/documents/${documentId}`);
            return;
          }

          // Map API document to edit form structure
          const editDoc: Document = {
            id: d.id,
            sequentialNumber: String(d.sequentialNumber || ''),
            series: d.series || '',
            documentType: d.documentType,
            issueDate: d.issueDate,
            taxableDate: d.taxableDate || d.issueDate,
            customerName: (d.buyer?.tradeName || d.buyer?.name || ''),
            customerNif: (d.buyer?.nif || ''),
            customerAddress: (d.buyer?.address || ''),
            items: (d.lines || []).map((ln: any) => ({
              id: ln.sku || ln.description || String(Date.now()),
              description: ln.description,
              quantity: ln.quantity,
              unitPrice: ln.unitPrice,
              vatRate: ln.vatRate,
              vatExemptionReason: ln.vatExemptionReason,
              total: typeof ln.total === 'number' ? ln.total : (ln.quantity * ln.unitPrice) * (1 + (ln.vatRate || 0) / 100)
            })),
            subtotal: d.totals?.subtotal || 0,
            vatAmount: d.totals?.vatTotal || 0,
            total: d.totals?.total || 0,
            status: d.status === 'draft' ? 'draft' : (d.status === 'issued' ? 'submitted' : (d.status === 'paid' ? 'accepted' : 'rejected'))
          };

          setDocument(editDoc);
          setFormData({
            documentType: editDoc.documentType,
            issueDate: editDoc.issueDate,
            taxableDate: editDoc.taxableDate,
            selectedClientId: '',
            customerName: editDoc.customerName,
            customerNif: editDoc.customerNif,
            customerAddress: editDoc.customerAddress,
            items: editDoc.items
          });
          setSelectedSeries(editDoc.series || '');
        } else if (resp.status === 404) {
          setDocument(null);
        } else {
          setDocument(null);
        }
      } catch (e) {
        setDocument(null);
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [id]);

  // Fetch series when documentType or issueDate changes
  useEffect(() => {
    const fetchSeries = async () => {
      try {
        const year = (() => {
          const d = formData.issueDate || document?.issueDate;
          return d ? new Date(d).getFullYear() : new Date().getFullYear();
        })();
        const res = await fetch(`/api/series?type=${encodeURIComponent(formData.documentType)}&active=true&year=${year}`);
        const data = await res.json();
        const sorted = (data.series || []).sort((a: any, b: any) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.name.localeCompare(b.name);
        });

        if (sorted.length === 0) {
          try {
            await fetch('/api/series/seed-defaults', { method: 'POST' });
            const res2 = await fetch(`/api/series?type=${encodeURIComponent(formData.documentType)}&active=true&year=${year}`);
            const data2 = await res2.json();
            const sorted2 = (data2.series || []).sort((a: any, b: any) => {
              if (a.isDefault && !b.isDefault) return -1;
              if (!a.isDefault && b.isDefault) return 1;
              return a.name.localeCompare(b.name);
            });
            setSeriesOptions(sorted2);
          } catch (err) {
            console.error('Falha ao semear séries', err);
            setSeriesOptions(sorted);
          }
        } else {
          setSeriesOptions(sorted);
        }
      } catch (error) {
        console.error('Falha ao carregar séries', error);
      }
    };

    if (formData.documentType) {
      fetchSeries();
    }
  }, [formData.documentType, formData.issueDate]);

  // Auto-select default/first series if current selection is invalid
  useEffect(() => {
    if (!seriesOptions || seriesOptions.length === 0) {
      return;
    }
    const isValid = seriesOptions.some(s => s.code === selectedSeries);
    if (!isValid) {
      const preferred = seriesOptions.find(s => s.isDefault) || seriesOptions[0];
      setSelectedSeries(preferred?.code || '');
    }
  }, [seriesOptions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const clientId = e.target.value;
    const selectedClient = clients.find(client => client.id === clientId);
    
    if (selectedClient) {
      setFormData({
        ...formData,
        selectedClientId: clientId,
        customerName: selectedClient.tradeName || selectedClient.name,
        customerNif: selectedClient.nif,
        customerAddress: selectedClient.address
      });
    } else {
      setFormData({
        ...formData,
        selectedClientId: ''
      });
    }
  };

  const handleSeriesSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSeries(e.target.value);
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...formData.items];
    const item = { ...updatedItems[index] };
    
    // Validate quantity to ensure it's greater than zero
    if (field === 'quantity') {
      const quantity = Number(value);
      if (quantity <= 0) {
        item.quantity = 1; // Reset to minimum valid quantity
      } else {
        item.quantity = quantity;
      }
    } else {
      (item as any)[field] = value;
    }
    
    // Handle VAT exemption reason logic
    if (field === 'vatRate') {
      const newVat = Number(value);
      if (newVat > 0) {
        item.vatExemptionReason = undefined;
      } else if (newVat === 0 && !item.vatExemptionReason) {
        item.vatExemptionReason = DEFAULT_VAT_EXEMPTION_REASON;
      }
    }
    
    // Recalculate total for this item
    if (field === 'quantity' || field === 'unitPrice' || field === 'vatRate') {
      const subtotal = round(item.quantity * item.unitPrice);
      const vatAmount = round(subtotal * (item.vatRate / 100));
      item.total = round(subtotal + vatAmount);
    }
    
    updatedItems[index] = item;
    setFormData(prev => ({
      ...prev,
      items: updatedItems
    }));
  };

  const addItem = () => {
    const newItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      vatRate: 14,
      vatExemptionReason: undefined,
      total: 0
    };
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }));
    }
  };

  const calculateTotals = () => {
    const subtotal = round(formData.items.reduce((sum, item) => {
      return sum + round(item.quantity * item.unitPrice);
    }, 0));
    
    const vatAmount = round(formData.items.reduce((sum, item) => {
      const itemSubtotal = round(item.quantity * item.unitPrice);
      return sum + round(itemSubtotal * (item.vatRate / 100));
    }, 0));
    
    return {
      subtotal,
      vatAmount,
      total: round(subtotal + vatAmount)
    };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-AO', {
      style: 'currency',
      currency: 'AOA'
    }).format(amount);
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels = {
      'factura': 'Fatura',
      'orçamento': 'Orçamento',
      'nota_de_credito': 'Nota de Crédito',
      'recibo': 'Recibo',
      'nota_de_entrega': 'Nota de Entrega',
      'factura_recibo': 'Factura-Recibo',
      'nota_de_debito': 'Nota de Débito',
      'proforma': 'Proforma'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate quantities before submitting
    const invalidItems = formData.items.filter(item => item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.info('Erro: Todos os itens devem ter quantidade maior que zero.');
      return;
    }

    // Validate unit price for invoices: forbid zero or negative unitPrice
    if (String(formData.documentType).toLowerCase() === 'factura') {
      const zeroPriceItems = formData.items.filter(item => Number(item.unitPrice) <= 0);
      if (zeroPriceItems.length > 0) {
        toast.info('Erro: Nenhuma linha de factura pode ter preço unitário igual ou inferior a 0.');
        return;
      }
    }
    
    setSaving(true);
    
    try {
      // Transform form data to match API requirements
      const documentData = {
        documentType: formData.documentType,
        issueDate: formData.issueDate,
        series: selectedSeries,
        buyer: {
          name: formData.customerName,
          nif: formData.customerNif,
          address: formData.customerAddress || '',
          email: '',
          phone: ''
        },
        lines: formData.items.map(item => ({
          sku: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: 0,
          vatRate: item.vatRate,
          ...(item.vatRate === 0 && item.vatExemptionReason && {
            vatExemptionReason: item.vatExemptionReason
          })
        }))
      };

      // Make API call to update the document
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(documentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update document');
      }

      const result = await response.json();
      console.log('Document updated successfully:', result);
      
      // Show success message
      toast.info('Documento atualizado com sucesso!');
      
      // Redirect back to document detail page
      router.push(`/documents/${id}`);
    } catch (error) {
      console.error('Error updating document:', error);
      toast.info(`Erro ao atualizar documento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Carregando...">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Carregando documento...</div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!document) {
    return (
      <Layout title="Documento não encontrado">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Documento não encontrado</h1>
            <p className="text-gray-600 mb-6">O documento solicitado não existe.</p>
            <Link href="/documents">
              <Button variant="primary">Voltar para Documentos</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const totals = calculateTotals();

  return (
    <Layout title={`Editar ${getDocumentTypeLabel(document.documentType)} | Prakash`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Editar {getDocumentTypeLabel(document.documentType)}
            </h1>
            <p className="text-gray-600">
              {document.series}{String(document.sequentialNumber).padStart(4, '0')} - Emitido em {document.issueDate}
            </p>
          </div>
          <div className="flex space-x-3">
            <Link href={`/documents/${document.id}`}>
              <Button variant="secondary">
                Anular
              </Button>
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Documento
              </label>
              <select
                name="documentType"
                value={formData.documentType}
                onChange={handleInputChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
              >
                <option value="factura">Fatura</option>
                <option value="orçamento">Orçamento</option>
                <option value="nota_de_entrega">Nota de Entrega</option>
                <option value="nota_de_credito">Nota de Crédito</option>
                <option value="recibo">Recibo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Série
              </label>
              <select
                value={selectedSeries}
                onChange={handleSeriesSelect}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
              >
                <option value="">Selecione uma série</option>
                {seriesOptions.map((s) => (
                  <option key={`${s.code}-${s.year}`} value={s.code}>
                    {s.code} · {s.name} · {s.year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Emissão
              </label>
              <input
                type="date"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleInputChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Tributação
              </label>
              <input
                type="date"
                name="taxableDate"
                value={formData.taxableDate}
                onChange={handleInputChange}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Informações do Cliente</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selecionar Cliente
                </label>
                <select
                  name="selectedClientId"
                  value={formData.selectedClientId}
                  onChange={handleClientSelect}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  disabled={loadingClients}
                >
                  <option value="">
                    {loadingClients ? 'Carregando clientes...' : 'Selecione um cliente ou digite manualmente'}
                  </option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.tradeName ? `${client.tradeName} (${client.name})` : client.name} - {client.nif}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Nome completo ou empresa"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NIF do Cliente
                </label>
                <input
                  type="text"
                  name="customerNif"
                  value={formData.customerNif}
                  onChange={handleInputChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Número de Identificação Fiscal"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Endereço do Cliente
                </label>
                <textarea
                  name="customerAddress"
                  value={formData.customerAddress}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                  placeholder="Endereço completo"
                  required
                />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-800">Itens do Documento</h2>
              <Button 
                type="button" 
                variant="secondary" 
                size="sm"
                onClick={addItem}
              >
                Adicionar Item
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Qtd
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preço Unit.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IVA %
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Motivo Isenção
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formData.items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                          placeholder="Descrição do item"
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 text-right"
                          min="1"
                          step="1"
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 text-right"
                          min="0"
                          step="0.01"
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={item.vatRate}
                          onChange={(e) => handleItemChange(index, 'vatRate', Number(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 text-right"
                        >
                          <option value="0">0%</option>
                          <option value="14">14%</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        {item.vatRate === 0 ? (
                          <select
                            value={item.vatExemptionReason || DEFAULT_VAT_EXEMPTION_REASON}
                            onChange={(e) => handleItemChange(index, 'vatExemptionReason', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50"
                          >
                            {VAT_EXEMPTION_OPTIONS.map(option => (
                              <option key={option.code} value={option.code}>
                                {option.code} - {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex flex-col items-end">
              <div className="w-full md:w-1/3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IVA:</span>
                  <span className="font-medium">{formatCurrency(totals.vatAmount)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Link href={`/documents/${document.id}`}>
              <Button variant="secondary" type="button">
-                Cancelar
+                Anular
              </Button>
            </Link>
            <Button 
              variant="primary" 
              type="submit"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
  }