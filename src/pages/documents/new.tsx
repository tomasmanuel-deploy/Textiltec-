import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Button from '@/components/ui/Button';

// Add list of exemption reasons (can be expanded later)
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

interface Product {
 id: string;
 name: string;
 code: string;
 category: string;
 price: number;
 unit: string;
 taxRate?: number;
 status: 'active' | 'inactive';
 isService?: boolean;
}

interface FormData {
 documentType: string;
 selectedClientId: string;
 customerName: string;
 customerNif: string;
 issueDate: string;
 dueDate: string;
 paymentMethod: string;
 paymentStatus: string;
 relatedDocumentId?: string; // For ND/NC/Receipts
 debitNoteReason?: string; // For ND/NC
 isManual?: boolean; // AGT: For manual block invoices
 manualBlockReference?: string;
 items: Array<{
 productId?: string;
 productCode?: string;
 description: string;
 unit: string;
 quantity: number;
 unitPrice: number;
 discount: number;
 vatRate: number;
 vatExemptionReason?: string;
 total: number;
 }>;
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
 companyId?: string;
}

export default function NewDocument() {
 const router = useRouter();
 const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
 const [saving, setSaving] = useState(false);
 const [clients, setClients] = useState<Client[]>([]);
 const [loadingClients, setLoadingClients] = useState(true);
 const [products, setProducts] = useState<Product[]>([]);
 const [loadingProducts, setLoadingProducts] = useState(true);
 const [seriesOptions, setSeriesOptions] = useState<Array<{ code: string; name: string; documentType: string; year: number; currentNumber: number; isDefault?: boolean }>>([]);
 const [selectedSeries, setSelectedSeries] = useState<string>('');
 const [nextPreview, setNextPreview] = useState<number>(0);

 const [activeCompanyId, setActiveCompanyId] = useState<string>('');
 const [showNewClientForm, setShowNewClientForm] = useState<boolean>(false);
 const [creatingClient, setCreatingClient] = useState<boolean>(false);
 const [clientError, setClientError] = useState<string>('');
 const [newClient, setNewClient] = useState<{ name: string; tradeName?: string; nif: string; address: string; email?: string; phone?: string; clientType: 'company' | 'individual'; }>({
 name: '', tradeName: '', nif: '', address: '', email: '', phone: '', clientType: 'company'
 });

 const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
 const [loadingCategories, setLoadingCategories] = useState<boolean>(false);
 const [showNewProductIndex, setShowNewProductIndex] = useState<number | null>(null);
 const [newProduct, setNewProduct] = useState<{ name: string; code: string; category: string; unit: string; price: number; taxRate: number; description?: string; status?: 'active' | 'inactive'; isService: boolean }>({
 name: '', code: '', category: '', unit: 'UN', price: 0, taxRate: 14, description: '', status: 'active', isService: false
 });
 const [creatingProduct, setCreatingProduct] = useState<boolean>(false);
 const [productError, setProductError] = useState<string>('');
 const [showNewCategory, setShowNewCategory] = useState<boolean>(false);
 const [newCategoryName, setNewCategoryName] = useState<string>('');
 const [creatingCategory, setCreatingCategory] = useState<boolean>(false);
 const [categoryError, setCategoryError] = useState<string>('');

 // Related documents for ND/NC
 const [availableInvoices, setAvailableInvoices] = useState<any[]>([]);
 const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
 const [referenceReceipt, setReferenceReceipt] = useState<any | null>(null);
 const [referenceOriginDoc, setReferenceOriginDoc] = useState<any | null>(null);
 const [loadingReferenceDetails, setLoadingReferenceDetails] = useState<boolean>(false);

 const [formData, setFormData] = useState<FormData>({
 documentType: 'factura',
 selectedClientId: '',
 customerName: '',
 customerNif: '',
 relatedDocumentId: '',
 debitNoteReason: '',
 issueDate: new Date().toISOString().split('T')[0],
 dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
 paymentMethod: 'cash',
 paymentStatus: 'pending',
 isManual: false,
 manualBlockReference: '',
 items: [{
 productId: '',
 productCode: '',
 description: '',
 unit: 'UN',
 quantity: 1,
 unitPrice: 0,
 discount: 0,
 vatRate: 14,
 total: 0
 }]
 });

 // Auto-fill products from referenced document for ND/NC/AC
 useEffect(() => {
 const autofillProducts = async () => {
 if (!['nota_de_debito', 'nota_de_credito', 'aviso_cobranca'].includes(formData.documentType) || !formData.relatedDocumentId) {
 return;
 }

 // Find the document in the available invoices list first
 const selectedDoc = availableInvoices.find(d => String(d.id) === String(formData.relatedDocumentId));
 
 if (selectedDoc && Array.isArray(selectedDoc.lines) && selectedDoc.lines.length > 0) {
 console.log('Auto-filling products from referenced document:', selectedDoc.series, selectedDoc.sequentialNumber);
 
 const newItems = selectedDoc.lines.map((line: any) => ({
 productId: line.productId || '',
 productCode: line.sku || line.productCode || '',
 description: line.description || '',
 unit: line.unit || 'UN',
 quantity: Math.abs(Number(line.quantity || 1)),
 unitPrice: Math.abs(Number(line.unitPrice || 0)),
 discount: Number(line.discount || 0),
 vatRate: Number(line.vatRate || 0),
 vatExemptionReason: line.vatExemptionReason,
 total: Number(line.total || 0)
 }));

 setFormData(prev => ({
 ...prev,
 items: newItems,
 // Pre-fill reason if it's empty
 debitNoteReason: prev.debitNoteReason || `Retificação do documento ${selectedDoc.series}/${selectedDoc.sequentialNumber}`
 }));
 } else if (formData.relatedDocumentId) {
 // If not in availableInvoices (rare but possible), fetch it
 try {
 const resp = await fetch(`/api/documents/${encodeURIComponent(formData.relatedDocumentId)}`);
 if (resp.ok) {
 const data = await resp.json();
 const doc = data.document;
 if (doc && Array.isArray(doc.lines) && doc.lines.length > 0) {
 const newItems = doc.lines.map((line: any) => ({
 productId: line.productId || '',
 productCode: line.sku || line.productCode || '',
 description: line.description || '',
 unit: line.unit || 'UN',
 quantity: Math.abs(Number(line.quantity || 1)),
 unitPrice: Math.abs(Number(line.unitPrice || 0)),
 discount: Number(line.discount || 0),
 vatRate: Number(line.vatRate || 0),
 vatExemptionReason: line.vatExemptionReason,
 total: Number(line.total || 0)
 }));
 
 setFormData(prev => ({
 ...prev,
 items: newItems,
 debitNoteReason: prev.debitNoteReason || `Retificação do documento ${doc.series}/${doc.sequentialNumber}`
 }));
 }
 }
 } catch (error) {
 console.error('Error auto-filling products:', error);
 }
 }
 };

 autofillProducts();
 }, [formData.relatedDocumentId, formData.documentType, availableInvoices]);

 // Handle query param "type" to set initial documentType
 useEffect(() => {
 if (router.isReady && router.query.type) {
 const t = String(router.query.type);
 // Only update if different to avoid loops
 setFormData(prev => {
 if (prev.documentType === t) return prev;
 return { ...prev, documentType: t };
 });
 }
 }, [router.isReady, router.query.type]);

 useEffect(() => {
 const run = async () => {
 if (String(formData.documentType) !== 'recibo_estorno' || !formData.relatedDocumentId) {
 setReferenceReceipt(null);
 setReferenceOriginDoc(null);
 setLoadingReferenceDetails(false);
 return;
 }

 const receiptDoc = availableInvoices.find((d: any) => String(d.id) === String(formData.relatedDocumentId)) || null;
 setReferenceReceipt(receiptDoc);
 setReferenceOriginDoc(null);

 const originId =
 receiptDoc && Array.isArray(receiptDoc.relatedDocuments) && receiptDoc.relatedDocuments.length
 ? String(receiptDoc.relatedDocuments[0])
 : '';

 if (!originId) {
 setLoadingReferenceDetails(false);
 return;
 }

 setLoadingReferenceDetails(true);
 try {
 const resp = await fetch(`/api/documents/${encodeURIComponent(originId)}`);
 const data = await resp.json();
 setReferenceOriginDoc(data?.document || null);
 } catch {
 setReferenceOriginDoc(null);
 } finally {
 setLoadingReferenceDetails(false);
 }
 };

 run();
 }, [formData.documentType, formData.relatedDocumentId, availableInvoices]);

 // Fetch clients and products on component mount
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

 const fetchProducts = async () => {
 try {
 const response = await fetch('/api/products?status=active&limit=100');
 const data = await response.json();
 setProducts(data.products || []);
 } catch (error) {
 console.error('Erro ao carregar produtos:', error);
 } finally {
 setLoadingProducts(false);
 }
 };

 // Load payment defaults from localStorage, if available
 try {
 const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
 if (raw) {
 const parsed = JSON.parse(raw);
 const dueDays = typeof parsed?.dueDays === 'number' ? parsed.dueDays : 7;
 const issueDateStr = new Date().toISOString().split('T')[0];
 const computedDueDate = new Date(new Date(issueDateStr).getTime() + dueDays * 24 * 60 * 60 * 1000)
 .toISOString()
 .split('T')[0];

 setFormData(prev => ({
 ...prev,
 paymentMethod: parsed?.method || prev.paymentMethod,
 paymentStatus: parsed?.status || prev.paymentStatus,
 dueDate: computedDueDate,
 issueDate: issueDateStr,
 }));
 }
 } catch (err) {
 console.error('Erro ao carregar defaults de pagamento:', err);
 }

 fetchClients();
 fetchProducts();
 }, []);

 useEffect(() => {
 const fetchCategories = async () => {
 setLoadingCategories(true);
 try {
 const res = await fetch('/api/categories');
 const data = await res.json();
 const arr = Array.isArray(data.categories) ? data.categories : [];
 setCategories(arr.map((c: any) => ({ id: c.id, name: c.name })));
 } catch (error) {
 console.error('Erro ao carregar categorias:', error);
 } finally {
 setLoadingCategories(false);
 }
 };
 fetchCategories();
 }, []);

 // Fetch active company id to associate new clients
 useEffect(() => {
 (async () => {
 try {
 const resp = await fetch('/api/settings/companies');
 if (resp.ok) {
 const data = await resp.json();
 const id = data.activeCompanyId || '';
 if (id) {
 setActiveCompanyId(id);
 } else {
 // Fallback: read selectedCompanyId from /api/settings/company
 try {
 const r2 = await fetch('/api/settings/company');
 if (r2.ok) {
 const d2 = await r2.json();
 setActiveCompanyId(d2.selectedCompanyId || '');
 }
 } catch {}
 }
 }
 } catch {
 // Fallback on error
 try {
 const r2 = await fetch('/api/settings/company');
 if (r2.ok) {
 const d2 = await r2.json();
 setActiveCompanyId(d2.selectedCompanyId || '');
 }
 } catch {}
 }
 })();
 }, []);

 // Fetch series when documentType changes
 useEffect(() => {
 const fetchSeries = async () => {
 try {
 const year = (() => {
 const d = formData.issueDate;
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
 // Seed default series for all types for this year, then refetch
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
 console.error('Seeding series failed', err);
 setSeriesOptions(sorted);
 }
 } else {
 setSeriesOptions(sorted);
 }
 } catch (error) {
 console.error('Failed to fetch series', error);
 }
 };

 fetchSeries();
 }, [formData.documentType]);

 // Auto-select default/first series whenever seriesOptions update or documentType changes
 useEffect(() => {
 if (!seriesOptions || seriesOptions.length === 0) {
 setSelectedSeries('');
 return;
 }
 const isValid = seriesOptions.some(s => s.code === selectedSeries);
 if (!isValid) {
 const preferred = seriesOptions.find(s => s.isDefault) || seriesOptions[0];
 setSelectedSeries(preferred?.code || '');
 }
 }, [seriesOptions, formData.documentType]);

 // Compute next preview number per active company, selected series and year
 useEffect(() => {
 let cancelled = false;
 const computeNext = async () => {
 try {
 const s = seriesOptions.find(x => x.code === selectedSeries);
 if (!s) { setNextPreview(0); return; }
 
 const year = s.year;
 const res = await fetch(`/api/documents/next-sequence?series=${encodeURIComponent(selectedSeries)}&year=${year}`);
 if (!res.ok) {
 const fallback = Math.max(0, s.currentNumber) + 1;
 setNextPreview(fallback);
 return;
 }
 const data = await res.json();
 const next = data.nextSequence;
 if (!cancelled) setNextPreview(next);
 } catch (e) {
 const s = seriesOptions.find(x => x.code === selectedSeries);
 const fallback = s ? Math.max(0, s.currentNumber) + 1 : 0;
 setNextPreview(fallback);
 }
 };
 computeNext();
 return () => { cancelled = true; };
 }, [selectedSeries, seriesOptions]);

 // Fetch available reference documents when type requires it
 useEffect(() => {
 const needsReference = ['nota_de_credito', 'nota_de_debito', 'recibo_estorno', 'aviso_cobranca_recibo', 'outros_recibos', 'recibo', 'aviso_cobranca'].includes(formData.documentType);
 if (!needsReference) {
 setAvailableInvoices([]);
 return;
 }

 const fetchInvoices = async () => {
 setLoadingInvoices(true);
 try {
 const hasClient = Boolean(formData.selectedClientId);
 const url = hasClient
 ? `/api/documents?clientId=${formData.selectedClientId}&page=1&limit=200`
 : `/api/documents?includeAll=true&page=1&limit=200`;
 const res = await fetch(url);
 if (res.ok) {
 const data = await res.json();
 const docs = Array.isArray(data.documents) ? data.documents : [];
 
 // Define allowed reference types based on current document type
 let allowedTypes: string[] = [];
 
 if (formData.documentType === 'recibo_estorno') {
 // RE reverses Receipts (RC, RG, AR)
 allowedTypes = ['recibo', 'aviso_cobranca_recibo', 'outros_recibos'];
 } else if (formData.documentType === 'aviso_cobranca_recibo' || formData.documentType === 'recibo' || formData.documentType === 'outros_recibos' || formData.documentType === 'aviso_cobranca') {
 allowedTypes = [
 'factura',
 'factura_recibo',
 'factura_generica',
 'factura_global',
 'factura_adiantamento',
 'factura_recibo_autofacturacao',
 'nota_de_debito',
 'aviso_cobranca'
 ];
 } else {
 // NC/ND reverses Invoices
 allowedTypes = [
 'factura', 
 'factura_recibo', 
 'factura_generica', 
 'factura_global', 
 'factura_adiantamento', 
 'factura_recibo_autofacturacao'
 ];
 }
 
 const validRefs = docs.filter((d: any) => {
 const type = String(d.documentType || '').toLowerCase();
 const isAllowed = allowedTypes.includes(type);
 const isNotCancelled = d.status !== 'cancelled' && d.status !== 'draft';
 let isClientMatch = true;
 if (hasClient) {
 const client = clients.find(c => c.id === formData.selectedClientId);
 const clientNif = client?.nif;
 isClientMatch = clientNif ? (d.buyer?.nif === clientNif) : true;
 }

 let hasOutstanding = true;
 if (formData.documentType === 'aviso_cobranca_recibo' || formData.documentType === 'recibo' || formData.documentType === 'outros_recibos' || formData.documentType === 'aviso_cobranca') {
 const total = Number(d?.totals?.total || d?.total || 0);
 const paid = Number(d?.payment?.paidAmount || 0);
 const outstanding = Math.max(total - paid, 0);
 hasOutstanding = outstanding > 0;
 }
 
 return isAllowed && isNotCancelled && isClientMatch && hasOutstanding;
 });
 // Sort by date descending
 validRefs.sort((a: any, b: any) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
 setAvailableInvoices(validRefs);
 }
 } catch (error) {
 console.error('Error fetching invoices:', error);
 } finally {
 setLoadingInvoices(false);
 }
 };

 fetchInvoices();
 }, [formData.documentType, formData.selectedClientId]);

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
 const { name, value } = e.target;
 setFormData({
 ...formData,
 [name]: value
 });
 };

 const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
 const clientId = e.target.value;
 if (clientId === '__novo__') {
 setShowNewClientForm(true);
 setFormData({
 ...formData,
 selectedClientId: '',
 customerName: '',
 customerNif: ''
 });
 return;
 }

 const selectedClient = clients.find(client => client.id === clientId);
 
 if (selectedClient) {
 setFormData({
 ...formData,
 selectedClientId: clientId,
 customerName: selectedClient.tradeName || selectedClient.name,
 customerNif: selectedClient.nif
 });
 } else {
 setFormData({
 ...formData,
 selectedClientId: '',
 customerName: '',
 customerNif: ''
 });
 }
 };

 const handleNewClientField = (field: keyof typeof newClient, value: string) => {
 setNewClient(prev => ({ ...prev, [field]: value }));
 };

 const refreshClients = async () => {
 try {
 const response = await fetch('/api/clients?status=active&limit=100');
 const data = await response.json();
 setClients(data.clients || []);
 } catch {}
 };

 const handleCreateNewClient = async () => {
 setClientError('');
 if (!newClient.name || !newClient.nif || !newClient.address) {
 setClientError('Preencha Nome, NIF e Endereço');
 return;
 }
 setCreatingClient(true);
 try {
 const resp = await fetch('/api/clients', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 name: newClient.name,
 tradeName: newClient.tradeName,
 nif: newClient.nif,
 address: newClient.address,
 email: newClient.email,
 phone: newClient.phone,
 clientType: newClient.clientType,
 companyId: activeCompanyId,
 })
 });
 const data = await resp.json();
 if (!resp.ok) {
 setClientError(data?.error || 'Falha ao criar cliente');
 return;
 }
 const created = data.client as Client;
 // Atualiza lista e seleciona o recém-criado
 setClients(prev => [...prev, created]);
 setShowNewClientForm(false);
 setNewClient({ name: '', tradeName: '', nif: '', address: '', email: '', phone: '', clientType: 'company' });
 setFormData(prev => ({
 ...prev,
 selectedClientId: created.id,
 customerName: created.tradeName || created.name,
 customerNif: created.nif
 }));
 await refreshClients();
 } catch (err) {
 setClientError('Erro ao criar cliente');
 } finally {
 setCreatingClient(false);
 }
 };

 const handleProductSelect = (index: number, productId: string) => {
 if (productId === '__novo__') {
 setShowNewProductIndex(index);
 setProductError('');
 setCategoryError('');
 setNewProduct({ name: '', code: '', category: '', unit: 'UN', price: 0, taxRate: 14, description: '', status: 'active', isService: false });
 const updatedItems = [...formData.items];
 updatedItems[index] = { ...updatedItems[index], productId: '', productCode: '' };
 setFormData({ ...formData, items: updatedItems });
 return;
 }
 const product = products.find(p => p.id === productId);
 const updatedItems = [...formData.items];
 if (product) {
 updatedItems[index] = {
 ...updatedItems[index],
 productId: product.id,
 productCode: product.code,
 description: product.name,
 unit: product.unit,
 unitPrice: product.price,
 vatRate: product.taxRate ?? updatedItems[index].vatRate,
 discount: updatedItems[index].discount ?? 0,
 // Ensure reason field is present/cleared based on VAT
 vatExemptionReason: (product.taxRate ?? updatedItems[index].vatRate) === 0 ? (updatedItems[index].vatExemptionReason ?? DEFAULT_VAT_EXEMPTION_REASON) : undefined,
 total: calculateItemTotal(updatedItems[index].quantity, product.price, updatedItems[index].discount ?? 0, product.taxRate ?? 0)
 };
 setShowNewProductIndex(null);
 } else {
 updatedItems[index] = {
 ...updatedItems[index],
 productId: '',
 productCode: '',
 };
 }
 setFormData({
 ...formData,
 items: updatedItems
 });
 };

 const refreshProducts = async () => {
 try {
 const response = await fetch('/api/products?status=active&limit=100');
 const data = await response.json();
 setProducts(data.products || []);
 } catch {}
 };

 const handleCreateInlineCategory = async () => {
 setCategoryError('');
 const name = newCategoryName.trim();
 if (!name) { setCategoryError('Indique o nome da categoria'); return; }
 setCreatingCategory(true);
 try {
 const res = await fetch('/api/categories', {
 method: 'POST', headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name })
 });
 const data = await res.json();
 if (!res.ok && !data.category) { setCategoryError(data.error || 'Falha ao criar categoria'); return; }
 const cat = data.category || data;
 setCategories(prev => Array.from(new Set([...(prev || []), { id: cat.id, name: cat.name }])) as any);
 setNewProduct(prev => ({ ...prev, category: cat.name }));
 setShowNewCategory(false);
 setNewCategoryName('');
 } catch (error) {
 console.error('Erro ao criar categoria:', error);
 setCategoryError('Erro ao criar categoria');
 } finally {
 setCreatingCategory(false);
 }
 };

 const handleCreateInlineProduct = async (index: number) => {
 setProductError('');
 const np = newProduct;
 if (!np.name || !np.code || !np.unit || np.price === undefined || !np.category) {
 setProductError('Preencha nome, código, categoria, unidade e preço');
 return;
 }
 setCreatingProduct(true);
 try {
 const res = await fetch('/api/products', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name: np.name, description: np.description, code: np.code, category: np.category, unit: np.unit, price: Number(np.price), status: np.status || 'active', taxRate: Number(np.taxRate) || 14, isService: !!np.isService })
 });
 const data = await res.json();
 if (!res.ok) { setProductError(data.error || 'Falha ao criar produto'); return; }
 await refreshProducts();
 // Seleciona o produto criado na linha
 handleProductSelect(index, data.id);
 setShowNewProductIndex(null);
 setNewProduct({ name: '', code: '', category: '', unit: 'UN', price: 0, taxRate: 14, description: '', status: 'active', isService: false });
 } catch (err) {
 setProductError('Erro ao criar produto');
 } finally {
 setCreatingProduct(false);
 }
 };

 // AGT Compliance: Rounding helper (Round Half Up)
 const round = (value: number, decimals: number = 2): number => {
 return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
 };

 const calculateItemTotal = (quantity: number, unitPrice: number, discount: number, vatRate: number): number => {
 const subtotal = round(quantity * unitPrice);
 const discountAmount = round(subtotal * (discount / 100));
 const net = round(subtotal - discountAmount);
 const vat = round(net * (vatRate / 100));
 return round(net + vat);
 };

 const handleItemChange = (index: number, field: keyof FormData['items'][number], value: any) => {
 const updatedItems = [...formData.items];
 const item = { ...updatedItems[index], [field]: value };
 
 // Validate quantity to ensure it's greater than zero
 if (field === 'quantity') {
 const quantity = Number(value);
 if (quantity <= 0) {
 item.quantity = 1; // Reset to minimum valid quantity
 }
 }
 
 // Clear or set exemption reason depending on VAT changes
 if (field === 'vatRate') {
 const newVat = Number(value);
 if (newVat > 0) {
 item.vatExemptionReason = undefined;
 } else if (newVat === 0 && !item.vatExemptionReason) {
 item.vatExemptionReason = DEFAULT_VAT_EXEMPTION_REASON;
 }
 }
 item.total = calculateItemTotal(item.quantity, item.unitPrice, item.discount, item.vatRate);
 updatedItems[index] = item;
 setFormData({ ...formData, items: updatedItems });
 };

 const addItem = () => {
 setFormData(prev => ({
 ...prev,
 items: [...prev.items, {
 productId: '',
 productCode: '',
 description: '',
 unit: 'UN',
 quantity: 1,
 unitPrice: 0,
 discount: 0,
 vatRate: 14,
 vatExemptionReason: undefined,
 total: 0
 }]
 }));
 };

 const removeItem = (index: number) => {
 const updatedItems = [...formData.items];
 updatedItems.splice(index, 1);
 setFormData({
 ...formData,
 items: updatedItems
 });
 };

 const calculateSubtotal = (): number => {
 return round(formData.items.reduce((sum, item) => sum + round(item.quantity * item.unitPrice), 0));
 };

 const calculateVat = (): number => {
 return round(formData.items.reduce((sum, item) => {
 const lineSubtotal = round(item.quantity * item.unitPrice);
 const lineDiscount = round(lineSubtotal * (item.discount / 100));
 const net = round(lineSubtotal - lineDiscount);
 const vat = item.vatRate > 0 ? round(net * (item.vatRate / 100)) : 0;
 return sum + vat;
 }, 0));
 };

 const calculateTotal = (): number => {
 // Sum of rounded line totals is consistent with AGT rules
 return round(formData.items.reduce((sum, item) => sum + item.total, 0));
 };

 const formatCurrency = (value: number | string | undefined | null): string => {
 const val = Number(value);
 if (isNaN(val)) {
 return new Intl.NumberFormat('pt-AO', {
 style: 'currency',
 currency: 'AOA'
 }).format(0);
 }
 return new Intl.NumberFormat('pt-AO', {
 style: 'currency',
 currency: 'AOA'
 }).format(val);
 };

 // Auto-seleciona Consumidor Final para faturas se não houver cliente
 useEffect(() => {
 if (formData.documentType !== 'factura') return;
 if (!clients || clients.length === 0) return;
 const cf = clients.find(c => (c.nif === '999999999') || ((c.tradeName || c.name).toLowerCase() === 'consumidor final'));
 if (!formData.selectedClientId && (!formData.customerName || !formData.customerNif)) {
 if (cf) {
 setFormData(prev => ({
 ...prev,
 selectedClientId: cf.id,
 customerName: cf.tradeName || cf.name,
 customerNif: cf.nif,
 }));
 } else {
 setFormData(prev => ({
 ...prev,
 customerName: 'Consumidor final',
 customerNif: '999999999',
 }));
 }
 }
 }, [formData.documentType, clients, formData.selectedClientId, formData.customerName, formData.customerNif]);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setSaving(true);
 if (!selectedSeries) {
 // Evita submissão sem série; mensagem é exibida inline no campo
 setSaving(false);
 return;
 }
 
 // Validate that all quantities are greater than zero
 const invalidQuantities = formData.items.filter(item => item.quantity <= 0);
 if (invalidQuantities.length > 0) {
 toast.info('Todas as quantidades devem ser maiores que zero.');
 setSaving(false);
 return;
 }

 // AGT: Nota de Débito e Nota de Crédito requerem documento de referência e motivo
 if (['nota_de_credito', 'nota_de_debito'].includes(String(formData.documentType))) {
 if (!formData.relatedDocumentId) {
 toast.info(`É obrigatório selecionar o documento de referência (Factura/Factura-Recibo) para ${formData.documentType === 'nota_de_credito' ? 'Nota de Crédito' : 'Nota de Débito'}.`);
 setSaving(false);
 return;
 }
 if (!formData.debitNoteReason) {
 toast.info('É obrigatório indicar o motivo.');
 setSaving(false);
 return;
 }
 }

 if (['recibo_estorno', 'aviso_cobranca_recibo', 'outros_recibos', 'recibo'].includes(String(formData.documentType))) {
 if (!formData.relatedDocumentId) {
 toast.info('É obrigatório selecionar o documento de referência para este tipo de recibo.');
 setSaving(false);
 return;
 }
 }

 if (String(formData.documentType) === 'aviso_cobranca') {
 if (!formData.relatedDocumentId) {
 toast.info('É obrigatório selecionar o documento de referência (Factura/Factura‑Recibo) para o Aviso de Cobrança.');
 setSaving(false);
 return;
 }
 }

 // AGT: Nota de Débito não pode ser criada sem nenhum item válido
 if (String(formData.documentType) === 'nota_de_debito') {
 const hasValidItem = formData.items.some(item => {
 const hasDescOrCode = Boolean(String(item.description || item.productCode || '').trim());
 const qtyValid = Number(item.quantity) > 0;
 const priceValid = Number(item.unitPrice) > 0;
 return hasDescOrCode && qtyValid && priceValid;
 });
 if (!hasValidItem) {
 toast.info('Erro: Nota de Débito deve conter pelo menos um produto/serviço com quantidade e preço válidos (AGT).');
 setSaving(false);
 return;
 }
 }

 // Sugerir/Converter para Proforma quando orçamento não contém serviços
 let submitType = formData.documentType;
 let submitSeries = selectedSeries;
 // Dentro de handleSubmit, ajustar a lógica de orçamento sem serviços
 if (formData.documentType === 'orçamento') {
 const hasService = formData.items.some(item => {
 const p = products.find(x => x.id === item.productId);
 return !!p?.isService;
 });
 if (!hasService) {
 const proceed = await confirm('Este orçamento não contém serviços. Converter para Proforma?');
 if (proceed) {
 submitType = 'proforma';
 try {
 const yearForProforma = (() => {
 const d = formData.issueDate;
 return d ? new Date(d).getFullYear() : new Date().getFullYear();
 })();
 const res = await fetch(`/api/series?type=proforma&active=true&year=${yearForProforma}`);
 const data = await res.json();
 const sorted = (data.series || []).sort((a: any, b: any) => {
 if (a.isDefault && !b.isDefault) return -1;
 if (!a.isDefault && b.isDefault) return 1;
 return a.name.localeCompare(b.name);
 });
 const preferred = sorted.find((s: any) => s.isDefault) || sorted[0];
 submitSeries = preferred?.code || submitSeries;
 } catch (err) {
 console.warn('Falha ao obter série de Proforma. Usando série selecionada.', err);
 }
 } else {
 // Se o utilizador recusar conversão, não criar documento
 setSaving(false);
 return;
 }
 }
 }
 
 try {
 const isFactura = submitType === 'factura';
 const cf = clients.find(c => (c.nif === '999999999') || ((c.tradeName || c.name).toLowerCase() === 'consumidor final'));
 let buyerName = formData.customerName;
 let buyerNif = formData.customerNif;
 
 // Para faturas (FT), garantir cliente obrigatório e default "Consumidor final"
 if (isFactura && (!formData.selectedClientId && (!buyerName || !buyerNif))) {
 if (cf) {
 buyerName = cf.tradeName || cf.name;
 buyerNif = cf.nif;
 setFormData(prev => ({ ...prev, selectedClientId: cf.id, customerName: buyerName, customerNif: buyerNif }));
 } else {
 buyerName = 'Consumidor final';
 buyerNif = '999999999';
 setFormData(prev => ({ ...prev, customerName: buyerName, customerNif: buyerNif }));
 }
 }

 // Validação: em factura, não permitir preço unitário 0
 if (isFactura) {
 const zeroPriceItems = formData.items.filter(it => Number(it.unitPrice) <= 0);
 if (zeroPriceItems.length > 0) {
 toast.info('Erro: Nenhuma linha de factura pode ter preço unitário igual ou inferior a 0.');
 setSaving(false);
 return;
 }
 }
 
 // Preparar referência para Nota de Débito/Crédito
 // Deixar vazio para que o backend (AgtService/PdfService) reconstrua a referência oficial
 // baseada no documento relacionado (relatedDocumentId)
 let referenceInvoiceNo: string | undefined;
 let referenceInvoiceDate: string | undefined;

 // NOTA: Removemos a construção manual aqui para evitar formatos incorretos como "FT FT/138"
 // O backend tem lógica robusta para formatar como "FT 2024/138" ou "FT AGT2024/138"


 // Transform form data to match API requirements, sync with selected products
 const documentData: any = {
 documentType: submitType,
 issueDate: formData.issueDate,
 series: submitSeries,
 buyer: {
 name: buyerName,
 nif: buyerNif,
 address: '', // Default empty address
 email: '',
 phone: ''
 },
 lines: formData.items.map(item => ({
 productId: item.productId,
 sku: item.productCode || item.description,
 description: item.description,
 quantity: item.quantity,
 unit: item.unit,
 unitPrice: item.unitPrice,
 discount: item.discount,
 vatRate: item.vatRate,
 vatExemptionReason: item.vatRate === 0 ? item.vatExemptionReason : undefined,
 total: item.total
 })),
 payment: {
 method: formData.paymentMethod,
 status: (submitType === 'factura' ? 'pending' : formData.paymentStatus),
 dueDate: formData.dueDate
 },
 total: calculateTotal(),
 relatedDocuments: formData.relatedDocumentId ? [formData.relatedDocumentId] : undefined,
 debitNoteReason: formData.debitNoteReason,
 isManual: formData.isManual,
 manualBlockReference: formData.manualBlockReference,
 referenceInvoiceNo,
 referenceInvoiceDate,
 };

 if (String(submitType) === 'aviso_cobranca') {
 const refDoc = availableInvoices.find((d: any) => String(d.id) === String(formData.relatedDocumentId));
 if (!refDoc) {
 toast.info('Documento de referência inválido.');
 setSaving(false);
 return;
 }
 const refTotal = Number(refDoc?.totals?.total || refDoc?.total || 0);
 const refPaid = Number(refDoc?.payment?.paidAmount || 0);
 const outstanding = Math.max(refTotal - refPaid, 0);
 if (outstanding <= 0) {
 toast.info('O documento de referência não possui valor em dívida.');
 setSaving(false);
 return;
 }

 if (!Array.isArray(documentData.lines) || documentData.lines.length === 0) {
 const label = `${refDoc.series}/${refDoc.sequentialNumber}`;
 documentData.lines = [
 {
 sku: 'SERV-AC',
 description: `Aviso de Cobrança referente ao documento ${label}`,
 quantity: 1,
 unit: 'Un',
 unitPrice: outstanding,
 discount: 0,
 vatRate: 0,
 vatExemptionReason: 'Operação não sujeita a IVA - Aviso de Cobrança',
 total: outstanding
 }
 ];
 documentData.total = outstanding;
 }
 }

 if (['recibo', 'aviso_cobranca_recibo', 'outros_recibos', 'recibo_estorno'].includes(String(submitType))) {
 const refDoc = availableInvoices.find((d: any) => String(d.id) === String(formData.relatedDocumentId));
 if (!refDoc) {
 toast.info('Documento de referência inválido.');
 setSaving(false);
 return;
 }
 const refTotal = Number(refDoc?.totals?.total || refDoc?.total || 0);
 const refPaid = Number(refDoc?.payment?.paidAmount || 0);
 const outstanding = Math.max(refTotal - refPaid, 0);
 const max = submitType === 'recibo_estorno'
 ? Math.abs(Number(refDoc?.payment?.paidAmount || refTotal || 0))
 : outstanding;
 if (max <= 0) {
 toast.info('O documento de referência não possui valor disponível para regularizar.');
 setSaving(false);
 return;
 }

 const today = new Date().toISOString().split('T')[0];
 const amountStr = await prompt('Valor do recibo (AOA):', String(max));
 if (!amountStr) { setSaving(false); return; }
 const paidAmount = parseFloat(amountStr.replace(',', '.'));
 if (isNaN(paidAmount) || paidAmount <= 0 || paidAmount > max) {
 toast.info('Valor inválido.');
 setSaving(false);
 return;
 }

 const refLabel = `${refDoc.series}/${refDoc.sequentialNumber}`;
 const desc =
 submitType === 'recibo_estorno'
 ? `Estorno referente ao documento ${refLabel}`
 : `Pagamento referente ao documento ${refLabel}`;
 documentData.lines = [
 {
 sku: submitType === 'recibo_estorno' ? 'ESTORNO' : 'PAGAMENTO',
 description: desc,
 quantity: 1,
 unit: 'Un',
 unitPrice: paidAmount,
 discount: 0,
 vatRate: 0,
 vatExemptionReason: 'M04',
 total: paidAmount
 }
 ];
 documentData.total = paidAmount;
 documentData.totals = {
 subtotal: paidAmount,
 discount: 0,
 vatTotal: 0,
 total: paidAmount,
 vatBreakdown: [{ rate: 0, base: paidAmount, amount: 0 }]
 };
 documentData.payment = {
 method: formData.paymentMethod || 'cash',
 status: 'paid',
 dueDate: today,
 paidAmount,
 paidDate: today
 };
 }

 // Para Factura-Recibo criada diretamente, solicitar método e valor de pagamento
 if (submitType === 'factura_recibo') {
 const total = formData.items.reduce((sum, it) => sum + Number(it.total || 0), 0);
 if (total <= 0) {
 toast.info('Valor total inválido para Factura‑Recibo.');
 setSaving(false);
 return;
 }
 // Escolher método: confirmar numerário ou pedir outro método
 let chosenMethod = formData.paymentMethod || 'cash';
 const isCash = await confirm('Pagamento em numerário?');
 if (isCash) {
 chosenMethod = 'cash';
 } else {
 const methodInput = (await prompt('Método de pagamento (cash, bank_transfer, card, mobile_money, other):', chosenMethod) || '').trim().toLowerCase();
 const map: Record<string, string> = {
 'cash': 'cash',
 'numerario': 'cash',
 'dinheiro': 'cash',
 'bank_transfer': 'bank_transfer',
 'transferencia': 'bank_transfer',
 'transferência': 'bank_transfer',
 'transfer': 'bank_transfer',
 'card': 'card',
 'cartao': 'card',
 'cartão': 'card',
 'visa': 'card',
 'mastercard': 'card',
 'mobile_money': 'mobile_money',
 'mobile': 'mobile_money',
 'momo': 'mobile_money',
 'other': 'other',
 'outro': 'other'
 };
 if (methodInput && map[methodInput]) {
 chosenMethod = map[methodInput];
 }
 }
 const defaultAmountStr = String(total);
 const amountStr = await prompt('Valor recebido (AOA):', defaultAmountStr);
 if (!amountStr) { setSaving(false); return; }
 const paidAmount = parseFloat(amountStr.replace(',', '.'));
 if (isNaN(paidAmount) || paidAmount <= 0 || paidAmount > total) {
 toast.info('Valor recebido inválido.');
 setSaving(false);
 return;
 }
 const today = new Date().toISOString().split('T')[0];
 const status: 'paid' | 'partial' = paidAmount >= total ? 'paid' : 'partial';
 documentData.payment = {
 method: chosenMethod,
 status,
 dueDate: today,
 paidAmount,
 paidDate: today
 };
 }

 // Make API call to create the document
 const response = await fetch('/api/documents', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(documentData),
 });
 
 if (!response.ok) {
 const errorData = await response.json();
 throw new Error(errorData.error || 'Failed to create document');
 }
 
 const result = await response.json();
 console.log('Document created successfully:', result);
 
 // Show success message
 toast.success('Documento criado com sucesso!');
 
 // Redirect to the documents list page
 router.push('/documents');
 } catch (error) {
 console.error('Erro ao criar documento:', error);
 toast.info(error instanceof Error ? error.message : 'Erro ao criar documento');
 } finally {
 setSaving(false);
 }
 };

 return (
 <>
 <Head>
 <title>Novo Documento</title>
 </Head>
 <div className="px-4 py-6">
 <h1 className="text-2xl font-semibold mb-4">Novo Documento</h1>
 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Documento</label>
 <select 
 name="documentType" 
 value={formData.documentType} 
 onChange={handleInputChange} 
 className="mt-1 block w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
 >
 <option value="factura">Factura (FT)</option>
 <option value="factura_recibo">Factura-Recibo (FR)</option>
 <option value="recibo">Recibo (RC)</option>
 <option value="nota_de_credito">Nota de Crédito (NC)</option>
 <option value="nota_de_debito">Nota de Débito (ND)</option>
 <option value="nota_de_entrega">Nota de Entrega (NE)</option>
 <option value="orçamento">Orçamento (OR)</option>
 <option value="proforma">Proforma (PP)</option>
 <option value="aviso_cobranca">Aviso de Cobrança (AC)</option>
 <option value="outros_recibos">Outros Recibos (RG)</option>
 <option value="factura_generica">Factura Genérica (FT)</option>
 <option value="factura_global">Factura Global (FT)</option>
 <option value="factura_recibo_autofacturacao">Autofacturação (AF)</option>
 <option value="recibo_estorno">Recibo de Estorno (RE)</option>
 <option value="factura_adiantamento">Factura de Adiantamento (FT)</option>
 <option value="aviso_cobranca_recibo">Aviso de Cobrança/Recibo (AR)</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Série</label>
 {seriesOptions?.length ? (
 <select value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} className="mt-1 block w-full border rounded p-2">
 <option value="">Selecione uma série</option>
 {seriesOptions.map(s => (
 <option key={s.code} value={s.code}>{s.name} ({s.year})</option>
 ))}
 </select>
 ) : (
 <div className="text-sm text-red-600 mt-1">Nenhuma série disponível para o tipo</div>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Data de Emissão</label>
 <input type="date" name="issueDate" value={formData.issueDate} onChange={handleInputChange} className="mt-1 block w-full border rounded p-2" />
 </div>
 <div className="flex items-center gap-4 mt-6">
 <div className="flex items-center">
 <input 
 type="checkbox" 
 id="isManual" 
 name="isManual" 
 checked={formData.isManual} 
 onChange={(e) => setFormData({...formData, isManual: e.target.checked})} 
 className="h-4 w-4 text-primary border-gray-300 rounded"
 />
 <label htmlFor="isManual" className="ml-2 block text-sm font-medium text-gray-700">
 Factura de Bloco (Manual)
 </label>
 </div>
 {formData.isManual && (
 <div className="flex-1">
 <input 
 type="text" 
 name="manualBlockReference" 
 value={formData.manualBlockReference} 
 onChange={handleInputChange} 
 placeholder="Referência do Bloco (ex: B-001)"
 className="block w-full border rounded p-2 text-sm"
 />
 </div>
 )}
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700">Cliente</label>
 <select value={formData.selectedClientId} onChange={handleClientSelect} className="mt-1 block w-full border rounded p-2" required={formData.documentType === 'factura'}>
 <option value="">Selecione um cliente</option>
 <option value="__novo__">+ Criar novo cliente…</option>
 {clients.filter(c => !activeCompanyId || !c.companyId || c.companyId === activeCompanyId).map(c => (
 <option key={c.id} value={c.id}>{c.tradeName || c.name} — {c.nif}</option>
 ))}
 </select>

 {showNewClientForm && (
 <div className="mt-3 p-3 border rounded bg-gray-50 space-y-3">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newClient.name} onChange={(e) => handleNewClientField('name', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome Comercial</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newClient.tradeName || ''} onChange={(e) => handleNewClientField('tradeName', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">NIF</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newClient.nif} onChange={(e) => handleNewClientField('nif', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Endereço</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newClient.address} onChange={(e) => handleNewClientField('address', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Email</label>
 <input type="email" className="mt-1 block w-full border rounded p-2" value={newClient.email || ''} onChange={(e) => handleNewClientField('email', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Telefone</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newClient.phone || ''} onChange={(e) => handleNewClientField('phone', e.target.value)} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Tipo</label>
 <select className="mt-1 block w-full border rounded p-2" value={newClient.clientType} onChange={(e) => handleNewClientField('clientType', e.target.value)}>
 <option value="company">Empresa</option>
 <option value="individual">Particular</option>
 </select>
 </div>
 </div>
 {clientError && <div className="text-sm text-red-600">{clientError}</div>}
 <div className="flex gap-2">
 <Button type="button" variant="secondary" onClick={() => setShowNewClientForm(false)} disabled={creatingClient}>Voltar</Button>
 <Button type="button" onClick={handleCreateNewClient} disabled={creatingClient}>{creatingClient ? 'A criar…' : 'Guardar cliente'}</Button>
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome do Cliente</label>
 <input type="text" name="customerName" value={formData.customerName} onChange={handleInputChange} className="mt-1 block w-full border rounded p-2" placeholder="Consumidor final" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">NIF do Cliente</label>
 <input type="text" name="customerNif" value={formData.customerNif} onChange={handleInputChange} className="mt-1 block w-full border rounded p-2" placeholder="999999999" />
 </div>
 </div>
 </div>

 {(formData.documentType === 'nota_de_credito' || formData.documentType === 'nota_de_debito' || formData.documentType === 'recibo_estorno' || formData.documentType === 'aviso_cobranca_recibo' || formData.documentType === 'outros_recibos' || formData.documentType === 'recibo' || formData.documentType === 'aviso_cobranca') && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-100 rounded dark:bg-gray-800 dark:border-gray-700">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Documento de Referência <span className="text-red-500">*</span></label>
 {loadingInvoices ? (
 <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">A carregar documentos...</div>
 ) : (
 <select 
 name="relatedDocumentId" 
 value={formData.relatedDocumentId} 
 onChange={handleInputChange} 
 className="mt-1 block w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
 required
 >
 <option value="">Selecione o documento original</option>
 {availableInvoices.map((doc: any) => (
 <option key={doc.id} value={doc.id}>
 {(() => {
 switch(doc.documentType) {
 case 'factura': return 'Factura';
 case 'factura_recibo': return 'Factura-Recibo';
 case 'factura_generica': return 'Factura Genérica';
 case 'factura_global': return 'Factura Global';
 case 'factura_adiantamento': return 'Factura Adiantamento';
 case 'factura_recibo_autofacturacao': return 'Autofacturação';
 case 'aviso_cobranca': return 'Aviso de Cobrança';
 case 'recibo': return 'Recibo';
 case 'aviso_cobranca_recibo': return 'Aviso de Cobrança/Recibo';
 case 'outros_recibos': return 'Outros Recibos';
 default: return doc.documentType;
 }
 })()} {doc.series}/{doc.sequentialNumber} ({new Date(doc.issueDate).toLocaleDateString()}) - {formatCurrency(doc.totals?.total || doc.total || 0)}
 </option>
 ))}
 </select>
 )}
 {availableInvoices.length === 0 && !loadingInvoices && (
 <div className="text-xs text-red-500 mt-1">Nenhum documento válido encontrado para este cliente.</div>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Motivo {(['nota_de_credito', 'nota_de_debito'].includes(formData.documentType)) ? <span className="text-red-500">*</span> : null}</label>
 <input 
 type="text" 
 name="debitNoteReason" 
 value={formData.debitNoteReason} 
 onChange={handleInputChange} 
 className="mt-1 block w-full border rounded p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
 placeholder={formData.documentType === 'nota_de_credito' ? 'Ex: Devolução de mercadoria, Erro na fatura...' : 'Ex: Débito de valores em falta...'}
 required={['nota_de_credito', 'nota_de_debito'].includes(formData.documentType)}
 />
 </div>
 </div>
 )}

 {String(formData.documentType) === 'recibo_estorno' && referenceReceipt && (
 <div className="mt-3 p-3 border rounded bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Detalhes do Documento de Referência</h3>
 {loadingReferenceDetails && <span className="text-xs text-gray-500 dark:text-gray-400">A carregar…</span>}
 </div>

 <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
 <div>
 <div className="text-gray-600 dark:text-gray-300">Recibo</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {referenceReceipt.series}/{referenceReceipt.sequentialNumber}
 </div>
 </div>
 <div>
 <div className="text-gray-600 dark:text-gray-300">Data</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {referenceReceipt.issueDate ? new Date(referenceReceipt.issueDate).toLocaleDateString() : '—'}
 </div>
 </div>
 <div>
 <div className="text-gray-600 dark:text-gray-300">Valor do Recibo</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {formatCurrency(referenceReceipt.totals?.total || referenceReceipt.total || 0)}
 </div>
 </div>
 </div>

 {referenceOriginDoc && (
 <div className="mt-3">
 <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Documento Regularizado por este Recibo</div>
 <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
 <div>
 <div className="text-gray-600 dark:text-gray-300">Documento</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {(() => {
 switch(String(referenceOriginDoc.documentType)) {
 case 'factura': return 'Factura';
 case 'factura_recibo': return 'Factura-Recibo';
 case 'factura_generica': return 'Factura Genérica';
 case 'factura_global': return 'Factura Global';
 case 'factura_adiantamento': return 'Factura Adiantamento';
 case 'factura_recibo_autofacturacao': return 'Autofacturação';
 case 'nota_de_debito': return 'Nota de Débito';
 case 'aviso_cobranca': return 'Aviso de Cobrança';
 default: return String(referenceOriginDoc.documentType || '—');
 }
 })()} {referenceOriginDoc.series}/{referenceOriginDoc.sequentialNumber}
 </div>
 </div>
 <div>
 <div className="text-gray-600 dark:text-gray-300">Data</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {referenceOriginDoc.issueDate ? new Date(referenceOriginDoc.issueDate).toLocaleDateString() : '—'}
 </div>
 </div>
 <div>
 <div className="text-gray-600 dark:text-gray-300">Total</div>
 <div className="font-medium text-gray-900 dark:text-gray-100">
 {formatCurrency(referenceOriginDoc.totals?.total || referenceOriginDoc.total || 0)}
 </div>
 </div>
 </div>

 {Array.isArray(referenceOriginDoc.lines) && referenceOriginDoc.lines.length > 0 ? (
 <div className="mt-3 overflow-auto">
 <table className="min-w-full text-sm border rounded bg-white dark:bg-gray-900 dark:border-gray-700">
 <thead className="bg-gray-100 dark:bg-gray-800">
 <tr>
 <th className="text-left px-3 py-2 border-b dark:border-gray-700">Descrição</th>
 <th className="text-right px-3 py-2 border-b dark:border-gray-700">Qtd</th>
 <th className="text-right px-3 py-2 border-b dark:border-gray-700">Preço</th>
 <th className="text-right px-3 py-2 border-b dark:border-gray-700">Total</th>
 </tr>
 </thead>
 <tbody>
 {referenceOriginDoc.lines.map((l: any, idx: number) => (
 <tr key={idx} className="border-t dark:border-gray-800">
 <td className="px-3 py-2">{l.description || l.productName || l.code || '—'}</td>
 <td className="px-3 py-2 text-right">{Number(l.quantity || 0)}</td>
 <td className="px-3 py-2 text-right">{formatCurrency(Number(l.unitPrice || 0))}</td>
 <td className="px-3 py-2 text-right">{formatCurrency(Number(l.total || 0))}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 ) : (
 <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">O documento regularizado não possui itens detalhados.</div>
 )}
 </div>
 )}

 {!referenceOriginDoc && (
 <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
 Para recibos de estorno, a AGT exige o estorno do pagamento (recibo) e não a repetição das linhas de produtos. Os itens do documento regularizado são mostrados aqui apenas para conferência.
 </div>
 )}
 </div>
 )}

 {['recibo', 'aviso_cobranca_recibo', 'outros_recibos', 'recibo_estorno'].includes(String(formData.documentType)) ? (
 <div className="p-3 border rounded bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
 <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Itens</h2>
 <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
 Em recibos (RC/AR/RG/RE), a AGT valida o movimento de pagamento/estorno através do documento de referência e dos montantes. As linhas de produtos do documento regularizado são mostradas acima apenas para conferência.
 </div>
 </div>
 ) : (
 <div>
 <div className="flex justify-between items-center mb-2">
 <h2 className="text-lg font-medium">Itens</h2>
 <Button type="button" onClick={addItem}>Adicionar linha</Button>
 </div>
 <div className="space-y-4">
 {formData.items.map((item, index) => (
 <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
 <div className="md:col-span-3">
 <label className="block text-sm font-medium text-gray-700">Produto</label>
 <select className="mt-1 block w-full border rounded p-2" value={item.productId || ''} onChange={(e) => handleProductSelect(index, e.target.value)}>
 <option value="">Selecione um produto</option>
 <option value="__novo__">+ Criar novo produto…</option>
 {products.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
 </select>
 </div>
 <div className="md:col-span-3">
 <label className="block text-sm font-medium text-gray-700">Descrição</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} />
 </div>
 <div className="md:col-span-1">
 <label className="block text-sm font-medium text-gray-700">Unidade</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)} />
 </div>
 <div className="md:col-span-1">
 <label className="block text-sm font-medium text-gray-700">Qtd</label>
 <input type="number" min={1} step={1} className="mt-1 block w-full border rounded p-2" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))} />
 </div>
 <div className="md:col-span-2">
 <label className="block text-sm font-medium text-gray-700">Preço Unit.</label>
 <input type="number" min={0} step="0.01" className="mt-1 block w-full border rounded p-2" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))} />
 </div>
 <div className="md:col-span-1">
 <label className="block text-sm font-medium text-gray-700">Desc (%)</label>
 <input type="number" min={0} max={100} step="0.01" className="mt-1 block w-full border rounded p-2" value={item.discount} onChange={(e) => handleItemChange(index, 'discount', Number(e.target.value))} />
 </div>
 <div className="md:col-span-1">
 <label className="block text-sm font-medium text-gray-700">IVA (%)</label>
 <select className="mt-1 block w-full border rounded p-2" value={item.vatRate} onChange={(e) => handleItemChange(index, 'vatRate', Number(e.target.value))}>
 <option value={0}>0</option>
 <option value={1}>1</option>
 <option value={2}>2</option>
 <option value={3}>3</option>
 <option value={5}>5</option>
 <option value={7}>7</option>
 <option value={10}>10</option>
 <option value={14}>14</option>
 </select>
 </div>
 {item.vatRate === 0 && (
 <div className="md:col-span-3">
 <label className="block text-sm font-medium text-gray-700">Motivo Isenção</label>
 <select className="mt-1 block w-full border rounded p-2" value={item.vatExemptionReason || DEFAULT_VAT_EXEMPTION_REASON} onChange={(e) => handleItemChange(index, 'vatExemptionReason', e.target.value)}>
 {VAT_EXEMPTION_OPTIONS.map(opt => (<option key={opt.code} value={opt.code}>{opt.code} — {opt.label}</option>))}
 </select>
 </div>
 )}
 <div className="md:col-span-1">
 <label className="block text-sm font-medium text-gray-700">Total</label>
 <div className="mt-1 p-2 border rounded bg-gray-50">{formatCurrency(item.total)}</div>
 </div>
 <div className="md:col-span-1">
 <Button type="button" variant="secondary" onClick={() => removeItem(index)}>Remover</Button>
 </div>

 {showNewProductIndex === index && (
 <div className="md:col-span-12 mt-2 p-3 border rounded bg-gray-50 space-y-3">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
 <div>
 <label className="block text-sm font-medium text-gray-700">Nome</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newProduct.name} onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Código</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newProduct.code} onChange={(e) => setNewProduct(prev => ({ ...prev, code: e.target.value }))} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Categoria</label>
 <div className="flex gap-2">
 <select className="mt-1 block w-full border rounded p-2" value={newProduct.category} onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}>
 <option value="">Selecione uma categoria</option>
 {categories.map(c => (<option key={c.id} value={c.name}>{c.name}</option>))}
 </select>
 <Button type="button" variant="secondary" onClick={() => setShowNewCategory(true)}>Nova</Button>
 </div>
 {showNewCategory && (
 <div className="mt-2 flex gap-2">
 <input type="text" className="block w-full border rounded p-2" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Nome da categoria" />
 <Button type="button" onClick={handleCreateInlineCategory} disabled={creatingCategory}>{creatingCategory ? 'A criar…' : 'Guardar categoria'}</Button>
 </div>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Unidade</label>
 <input type="text" className="mt-1 block w-full border rounded p-2" value={newProduct.unit} onChange={(e) => setNewProduct(prev => ({ ...prev, unit: e.target.value }))} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">Preço</label>
 <input type="number" min={0} step="0.01" className="mt-1 block w-full border rounded p-2" value={newProduct.price} onChange={(e) => setNewProduct(prev => ({ ...prev, price: Number(e.target.value) }))} />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700">IVA (%)</label>
 <select className="mt-1 block w-full border rounded p-2" value={newProduct.taxRate} onChange={(e) => setNewProduct(prev => ({ ...prev, taxRate: Number(e.target.value) }))}>
 <option value={0}>0</option>
 <option value={1}>1</option>
 <option value={2}>2</option>
 <option value={3}>3</option>
 <option value={5}>5</option>
 <option value={7}>7</option>
 <option value={10}>10</option>
 <option value={14}>14</option>
 </select>
 </div>
 <div className="md:col-span-1">
 <label className="inline-flex items-center">
 <input type="checkbox" className="mr-2" checked={newProduct.isService} onChange={(e) => setNewProduct(prev => ({ ...prev, isService: e.target.checked }))} />
 É serviço?
 </label>
 </div>
 </div>
 {productError && <div className="text-sm text-red-600">{productError}</div>}
 <div className="flex gap-2">
 <Button type="button" variant="secondary" onClick={() => setShowNewProductIndex(null)}>Voltar</Button>
 <Button type="button" onClick={() => handleCreateInlineProduct(index)} disabled={creatingProduct}>{creatingProduct ? 'A criar…' : 'Guardar produto'}</Button>
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="mt-4">
 <label className="block text-sm font-medium text-gray-700">Método de Pagamento</label>
 <select name="paymentMethod" className="mt-1 block w-full border rounded p-2" value={formData.paymentMethod} onChange={handleInputChange}>
 <option value="cash">Numerário</option>
 <option value="bank_transfer">Transferência Bancária</option>
 <option value="card">Cartão</option>
 <option value="mobile_money">Mobile Money</option>
 <option value="other">Outro</option>
 </select>
 </div>
 {formData.documentType !== 'factura' && formData.documentType !== 'orçamento' && formData.documentType !== 'proforma' && (
 <div>
 <label className="block text-sm font-medium text-gray-700">Estado do Pagamento</label>
 <select name="paymentStatus" className="mt-1 block w-full border rounded p-2" value={formData.paymentStatus} onChange={handleInputChange}>
 <option value="pending">Pendente</option>
 <option value="partial">Parcial</option>
 <option value="paid">Pago</option>
 </select>
 </div>
 )}
 {/* Nota de Débito: sem campos de referência; criação simples como outros documentos */}
 <div>
 <label className="block text-sm font-medium text-gray-700">Data de Vencimento</label>
 <input type="date" name="dueDate" value={formData.dueDate} onChange={handleInputChange} className="mt-1 block w-full border rounded p-2" />
 </div>
 </div>

 <div className="flex justify-end gap-2">
 <Link href="/documents" className="inline-flex items-center px-4 py-2 border rounded">Voltar</Link>
 <Button type="submit" disabled={saving || !selectedSeries}>Criar Documento</Button>
 </div>
 </form>
 </div>
 </>
 );
};

