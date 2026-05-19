import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Button from '@/components/ui/Button';
import Layout from '@/components/Layout';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { useToast } from '@/context/ToastContext';
import { useConfirm, usePrompt } from '@/context/DialogContext';

// Define types for document data
interface DocumentBuyer {
 name: string;
 nif: string;
}

interface DocumentTotals {
 subtotal: number;
 discount: number;
 vatTotal: number;
 total: number;
 grandTotal: number;
 vatBreakdown: Array<{
 rate: number;
 base: number;
 amount: number;
 }>;
}

interface Document {
 id: string;
 sequentialNumber: string;
 documentType: string;
 issueDate: string;
 buyer: DocumentBuyer;
 totals: DocumentTotals;
 status: string;
 seller?: { name?: string; tradeName?: string; nif?: string };
 payment?: {
 status?: 'pending' | 'partial' | 'paid';
 method?: string;
 dueDate?: string;
 paidAmount?: number;
 paidDate?: string;
 };
 relatedDocuments?: string[];
 createdAt?: string;
 updatedAt?: string;
 agtSubmission?: {
 status: 'pending' | 'success' | 'error' | 'offline_pending';
 message?: string;
 submissionDate?: string;
 agtId?: string;
 };
}

// Removed mockDocuments fallback to ensure first-run is empty

interface DocumentsPageProps {
 initialDocuments: Document[];
 initialPage: number;
 initialTotalPages: number;
 initialTotalCount: number;
}

export default function Documents({ initialDocuments, initialPage, initialTotalPages, initialTotalCount }: DocumentsPageProps) {
 const { language } = useAppSettings();
 const toast = useToast();
 const confirm = useConfirm();
 const prompt = usePrompt();
 const [documents, setDocuments] = useState<Document[]>(initialDocuments || []);
 const [filter, setFilter] = useState<string>('all');
 const [loading, setLoading] = useState(false);
 const [page, setPage] = useState(initialPage || 1);
 const [totalPages, setTotalPages] = useState(initialTotalPages || 1);
 const LIMIT = 20;
 const [totalCount, setTotalCount] = useState(initialTotalCount || 0);

 const [showXmlExport, setShowXmlExport] = useState(false);
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 // Inline company/software config to resolve XML export errors
 const [showMissingConfigModal, setShowMissingConfigModal] = useState(false);
 const [missingFields, setMissingFields] = useState<string[]>([]);
 const [companyName, setCompanyName] = useState('');
 const [tradeName, setTradeName] = useState('');
 const [nif, setNif] = useState('');
 const [address, setAddress] = useState('');
 const [city, setCity] = useState('');
 const [province, setProvince] = useState('');
 const [postalCode, setPostalCode] = useState('');
 const [email, setEmail] = useState('');
 const [phone, setPhone] = useState('');
 const [saftProductId, setSaftProductId] = useState('');
 const [saftProductVersion, setSaftProductVersion] = useState('');
 const [saftProductCompanyTaxId, setSaftProductCompanyTaxId] = useState('');
 const [saftSoftwareCertificateNumber, setSaftSoftwareCertificateNumber] = useState('');
 const [bankAccounts, setBankAccounts] = useState<Array<{ bankName?: string; account?: string; iban?: string; currency?: string }>>([]);
 const [onlyActiveCompany, setOnlyActiveCompany] = useState<boolean>(false);
 // Companies list for XML export selector
 const [companiesList, setCompaniesList] = useState<Array<{ id: string; name?: string; tradeName?: string; nif?: string }>>([]);
 const [selectedExportCompanyId, setSelectedExportCompanyId] = useState<string>('');
 const [activeCompanyIdForExport, setActiveCompanyIdForExport] = useState<string>('');

 // FR modal state
 const [showFrModal, setShowFrModal] = useState(false);
 const [frSourceDoc, setFrSourceDoc] = useState<Document | null>(null);
 const [frFullDoc, setFrFullDoc] = useState<any | null>(null);
 const [frMethod, setFrMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other'>('other');
 const [frPaidAmount, setFrPaidAmount] = useState<string>('');
 const [frSubmitting, setFrSubmitting] = useState(false);
 const [frTargetAction, setFrTargetAction] = useState<'pdf' | 'pos' | null>(null);

 const loadCompanyConfig = async () => {
 try {
 const resp = await fetch('/api/settings/company');
 if (resp.ok) {
 const data = await resp.json();
 const c = data.company || {};
 setCompanyName(c.name || '');
 setTradeName(c.tradeName || '');
 setNif(c.nif || '');
 setAddress(c.address || '');
 setCity(c.city || '');
 setProvince(c.province || '');
 setPostalCode(c.postalCode || '');
 setEmail(c.email || '');
 setPhone(c.phone || '');
 setSaftProductId(c.saftProductId || '');
 setSaftProductVersion(c.saftProductVersion || '');
 setSaftProductCompanyTaxId(c.saftProductCompanyTaxId || '');
 setSaftSoftwareCertificateNumber(c.saftSoftwareCertificateNumber || '');
 setBankAccounts(Array.isArray(c.bankAccounts) ? c.bankAccounts : []);
 }
 } catch (e) {
 // silently ignore
 }
 };
 
 // Load companies list when opening XML export modal
 const loadCompaniesForExport = async () => {
 try {
 const resp = await fetch('/api/settings/companies');
 if (resp.ok) {
 const data = await resp.json();
 const list = Array.isArray(data.companies) ? data.companies : [];
 const activeId = typeof data.activeCompanyId === 'string' ? data.activeCompanyId : '';
 setCompaniesList(list);
 setActiveCompanyIdForExport(activeId);
 // Default selection to active company
 setSelectedExportCompanyId(activeId || '');
 }
 } catch (_) {}
 };

 useEffect(() => {
 if (showXmlExport) {
 loadCompaniesForExport();
 }
 }, [showXmlExport]);
 
 // Fetch documents from API with pagination
 const fetchDocuments = useCallback(async () => {
 setLoading(true);
 try {
 let url = `/api/documents?page=${page}&limit=${LIMIT}`;
 if (!onlyActiveCompany) url += '&includeAll=true';
 if (filter !== 'all') url += `&type=${filter}`;

 const response = await fetch(url);
 if (response.ok) {
 const data = await response.json();
 // The API now returns sorted documents
 const normalizedDocs = (data.documents || []).map((d: any) => {
 const totalsSrc = d?.totals || {};
 const total = Number(totalsSrc?.total ?? totalsSrc?.grandTotal ?? d?.total ?? 0) || 0;
 const subtotal = Number(totalsSrc?.subtotal ?? totalsSrc?.taxableBase ?? 0) || 0;
 const vatTotal = Number(totalsSrc?.vatTotal ?? totalsSrc?.taxPayable ?? 0) || 0;
 const discount = Number(totalsSrc?.discount ?? totalsSrc?.discountTotal ?? 0) || 0;
 const vatBreakdown = Array.isArray(totalsSrc?.vatBreakdown) ? totalsSrc.vatBreakdown : [];
 return {
 ...d,
 totals: {
 subtotal,
 discount,
 vatTotal,
 total,
 grandTotal: total,
 vatBreakdown
 }
 };
 });
 setDocuments(normalizedDocs);
 const total = data.total || 0;
 setTotalCount(total);
 setTotalPages(Math.ceil(total / LIMIT) || 1);
 } else {
 console.error('Failed to fetch documents');
 setDocuments([]);
 setTotalPages(1);
 }
 } catch (error) {
 console.error('Error fetching documents:', error);
 setDocuments([]);
 setTotalPages(1);
 } finally {
 setLoading(false);
 }
 }, [page, filter, onlyActiveCompany]);

 useEffect(() => {
 fetchDocuments();

 // Listen for AGT sync completion to update status in real-time
 const handleSyncComplete = () => {
 console.log('AGT sync completed. Refreshing document list...');
 fetchDocuments();
 };

 window.addEventListener('agt-sync-complete', handleSyncComplete);
 return () => {
 window.removeEventListener('agt-sync-complete', handleSyncComplete);
 };
 }, [fetchDocuments]);

 useEffect(() => {
 const hasPendingAgt = documents.some(d => {
 const s = String(d.agtSubmission?.status || '').toLowerCase();
 return s === 'pending' || s === 'blocked';
 });
 if (!hasPendingAgt) return;

 const interval = setInterval(() => {
 fetchDocuments().catch(() => {});
 }, 30_000);

 return () => {
 clearInterval(interval);
 };
 }, [documents, fetchDocuments]);

 // Load active company config on mount
 useEffect(() => {
 loadCompanyConfig();
 }, []);
 
 // Use documents directly since filtering is done server-side
 const filteredDocuments = documents;
 
 // IDs de documentos origem (Proforma/Orçamento) que já geraram uma Factura‑Recibo
 const frSourceIds = useMemo(() => {
 const s = new Set<string>();
 for (const d of documents) {
 if (d.documentType === 'factura_recibo' && Array.isArray(d.relatedDocuments)) {
 for (const src of d.relatedDocuments) {
 s.add(String(src));
 }
 }
 }
 return s;
 }, [documents]);

 const getStatusClass = (status: string): string => {
 switch(status) {
 case 'accepted': return 'bg-success/20 text-success';
 case 'submitted': return 'bg-info/20 text-info';
 case 'draft': return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100';
 case 'rejected': return 'bg-danger/20 text-danger';
 case 'issued': return 'bg-info/20 text-info';
 case 'paid': return 'bg-success/20 text-success';
 case 'cancelled': return 'bg-danger/20 text-danger';
 default: return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100';
 }
 };

 const getDisplayStatusClass = (doc: Document): string => {
 // Proformas, Orçamentos e Notas de Crédito permanecem informativos como "emitido"
 if (doc.documentType === 'proforma' || doc.documentType === 'orçamento' || doc.documentType === 'nota_de_credito') return 'bg-info/20 text-info';
 if (doc.status === 'cancelled') return 'bg-danger/20 text-danger';
 if (doc.payment?.status === 'paid') return 'bg-success/20 text-success';
 if (doc.payment?.status === 'partial') return 'bg-warning/20 text-warning';
 return 'bg-danger/20 text-danger'; // Unpaid
 };

 const getDisplayStatusLabelKey = (doc: Document): string => {
 // Proformas, Orçamentos e Notas de Crédito devem mostrar apenas "Emitido"
 if (doc.documentType === 'proforma' || doc.documentType === 'orçamento' || doc.documentType === 'nota_de_credito') return 'status.issued';
 if (doc.status === 'cancelled') return 'status.cancelled';
 if (doc.payment?.status === 'paid') return 'status.paid';
 if (doc.payment?.status === 'partial') return 'payment.status.partial';
 return 'status.unpaid';
 };

 const getAgtStatusClass = (status?: string): string => {
 switch (status) {
 case 'success': return 'bg-green-500 text-white ';
 case 'error': return 'bg-red-500 text-white ';
 case 'offline_pending': return 'bg-orange-400 text-white ';
 case 'pending': return 'bg-blue-500 text-white animate-pulse';
 case 'blocked': return 'bg-gray-600 text-white ';
 default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
 }
 };

 const getAgtStatusLabel = (status?: string): string => {
 switch (status) {
 case 'success': return '✅ Sincronizado';
 case 'error': return '❌ Erro AGT';
 case 'offline_pending': return '⏳ Offline';
 case 'pending': return '🔵 Processando...';
 case 'blocked': return '🚫 Bloqueado';
 default: return '-';
 }
 };
 
 const getDocumentTypeLabel = (type: string): string => {
 const key =
 type === 'factura' ? 'doc.type.factura' :
 type === 'orçamento' ? 'doc.type.orçamento' :
 type === 'nota_de_credito' ? 'doc.type.nota_de_credito' :
 type === 'nota_de_debito' ? 'doc.type.nota_de_debito' :
 type === 'factura_recibo' ? 'doc.type.factura_recibo' :
 type === 'proforma' ? 'doc.type.proforma' :
 type === 'recibo' ? 'doc.type.recibo' :
 type === 'nota_de_entrega' ? 'doc.type.nota_de_entrega' : undefined;
 return key ? t(key, language) : type;
 };
 
 const formatCurrency = (value: number) => {
 try {
 return new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' }).format(value || 0);
 } catch {
 return `${(value || 0).toFixed(2)} AOA`;
 }
 };

 const formatDateTime = (dateStr?: string) => {
 if (!dateStr) return '-';
 try {
 return new Date(dateStr).toLocaleString('pt-AO', {
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 hour: '2-digit',
 minute: '2-digit',
 });
 } catch {
 return dateStr;
 }
 };

 const getDefaultPaymentMethod = (): 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other' => {
 try {
 const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
 if (raw) {
 const parsed = JSON.parse(raw);
 if (parsed?.method) return parsed.method;
 }
 } catch (err) {
 console.error('Erro ao ler default de pagamento:', err);
 }
 return 'other';
 };

 // FR helpers: open modal, close modal, submit
 const openFrModal = async (sourceDoc: Document, target?: 'pdf' | 'pos') => {
 try {
 setFrSubmitting(false);
 setFrTargetAction(target || null);
 setFrSourceDoc(sourceDoc);
 setShowFrModal(true);

 // Load full document for accurate totals/lines
 let full: any = sourceDoc;
 try {
 const res = await fetch(`/api/documents/${sourceDoc.id}`);
 if (res.ok) {
 const payload = await res.json();
 if (payload?.document) full = payload.document;
 }
 } catch {}
 setFrFullDoc(full);

 const baseTotal = Number(full?.totals?.total || sourceDoc?.totals?.grandTotal || 0);
 const paidSoFar = Number(full?.payment?.paidAmount || 0);
 const remaining = Math.max(baseTotal - paidSoFar, 0);

 // Default method and amount
 const defaultMethod = (full?.payment?.method as any) || getDefaultPaymentMethod();
 setFrMethod(defaultMethod);

 const defaultAmount = sourceDoc.documentType === 'factura' ? (remaining || baseTotal) : baseTotal;
 setFrPaidAmount(String(defaultAmount || ''));
 } catch (e) {
 console.error('Falha ao abrir modal FR:', e);
 toast.info('Falha ao preparar Factura‑Recibo.');
 }
 };

 const closeFrModal = () => {
 setShowFrModal(false);
 setFrSubmitting(false);
 setFrTargetAction(null);
 setFrSourceDoc(null);
 setFrFullDoc(null);
 setFrPaidAmount('');
 };

 const handleFrSubmit = async (action?: 'pdf' | 'pos') => {
 if (!frSourceDoc) return;
 if (!frSourceDoc.id) {
 toast.info('Erro: ID do documento inválido.');
 setFrSubmitting(false);
 return;
 }
 const target = action || frTargetAction || 'pdf';
 try {
 setFrSubmitting(true);

 const full = frFullDoc || frSourceDoc;
 const total = Number(full?.totals?.total || frSourceDoc?.totals?.grandTotal || 0);
 if (!total || total <= 0) {
 toast.info('Valor total inválido.');
 return;
 }

 const paidAmount = parseFloat(String(frPaidAmount || '').replace(',', '.'));
 if (!paidAmount || isNaN(paidAmount) || paidAmount <= 0 || paidAmount > total) {
 toast.info('Valor recebido inválido.');
 return;
 }

 // Special handling for Factura/Nota de Débito: Issue Receipt (Recibo) instead of Factura-Recibo
 if (['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_recibo_autofacturacao'].includes(frSourceDoc.documentType)) {
 toast.info('A processar recibo... Por favor aguarde.');
 const response = await fetch(`/api/documents/${frSourceDoc.id}/confirm-payment`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 paidAmount,
 paidDate: new Date().toISOString().split('T')[0],
 method: frMethod,
 }),
 });

 if (response.ok) {
 const payload = await response.json();
 const receipt = payload?.receipt;

 // Refresh list
 try {
 const updatedResponse = await fetch(`/api/documents${onlyActiveCompany ? '' : '?includeAll=true'}`);
 if (updatedResponse.ok) {
 const data = await updatedResponse.json();
 const sortedDocuments = data.documents.sort((a: Document, b: Document) => {
 return new Date(b.createdAt || b.issueDate).getTime() - new Date(a.createdAt || a.issueDate).getTime();
 });
 setDocuments(sortedDocuments);
 }
 } catch {}

 // Open output
 if (receipt && receipt.id) {
 if (target === 'pos') {
 window.open(`/api/documents/${receipt.id}/pos-pdf?force=1`, '_blank');
 } else {
 window.open(`/api/documents/${receipt.id}/pdf`, '_blank');
 }
 toast.info('Recibo emitido com sucesso.');
 } else {
 toast.info('Pagamento confirmado com sucesso.');
 }
 closeFrModal();
 } else {
 const err = await response.json().catch(() => null);
 console.error('Erro ao emitir Recibo:', err);
 toast.info(`Falha ao emitir Recibo: ${err?.error || 'Erro desconhecido'}`);
 }
 return;
 }

 // Existing logic for Proforma/Orçamento -> Factura-Recibo
 const lines = Array.isArray(full?.lines) ? full.lines : [];
 if (!lines.length) {
 toast.info('Documento sem linhas. Não é possível criar Factura‑Recibo.');
 return;
 }

 toast.info('A processar Factura‑Recibo... Por favor aguarde.');

 const today = new Date().toISOString().split('T')[0];
 const payStatus: 'paid' | 'partial' = paidAmount >= total ? 'paid' : 'partial';

 const response = await fetch('/api/documents', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 documentType: 'factura_recibo',
 buyer: full?.buyer || frSourceDoc.buyer,
 lines,
 payment: {
 method: frMethod,
 status: payStatus,
 dueDate: today,
 paidAmount,
 paidDate: today,
 },
 relatedDocuments: [String(frSourceDoc.id)],
 }),
 });

 if (response.ok) {
 const createdPayload = await response.json();
 const createdDoc = createdPayload?.document;

 // Refresh list
 try {
 await fetchDocuments();
 } catch {}
 closeFrModal();
 toast.info('Factura‑Recibo criada com sucesso.');
 } else {
 const err = await response.json().catch(() => null);
 console.error('Erro ao criar FR:', err);
 toast.info('Falha ao criar Factura‑Recibo.');
 }
 } catch (e) {
 console.error('Erro no submit da FR:', e);
 toast.info('Falha ao processar operação.');
 } finally {
 setFrSubmitting(false);
 }
 };

 const handleCancelInvoice = async (documentId: string) => {
 if (!await confirm(t('prompts.cancelInvoiceConfirm', language))) {
 return;
 }

 const reason = await prompt('Informe a razão do cancelamento (obrigatório):');
 if (!reason || !reason.trim()) {
 toast.info(t('prompts.cancelInvoiceReasonRequired', language));
 return;
 }

 try {
 const response = await fetch(`/api/documents/${documentId}/cancel`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ reason: reason.trim() }),
 });

 if (response.ok) {
 const updatedResponse = await fetch(`/api/documents${onlyActiveCompany ? '' : '?includeAll=true'}`);
 if (updatedResponse.ok) {
 await fetchDocuments();
 }
 toast.info(t('messages.invoiceCancelledSuccess', language));
 } else {
 const error = await response.json();
 toast.info(`${t('errors.cancelInvoiceFailed', language)}: ${error.message}`);
 }
 } catch (error) {
 console.error('Error cancelling invoice:', error);
 toast.info(t('errors.cancelInvoiceFailed', language));
 }
 };

 const handleConfirmPayment = async (doc: Document) => {
 try {
 const proceed = await confirm(t('prompts.confirmPaymentGeneric', language));
 if (!proceed) return;

 const total = Number(doc?.totals?.total || 0);
 const paidSoFar = Number(doc?.payment?.paidAmount || 0);
 const remaining = Math.max(total - paidSoFar, 0);
 const defaultAmountStr = String(remaining || total);
 const amountStr = await prompt(t('prompts.enterPaidAmount', language), defaultAmountStr);
 if (!amountStr) return;
 const amount = parseFloat(amountStr.replace(',', '.'));
 if (isNaN(amount) || amount <= 0 || amount > remaining) {
 toast.info(t('messages.invalidAmount', language));
 return;
 }

 const method = (doc.payment?.method as any) || getDefaultPaymentMethod();
 const response = await fetch(`/api/documents/${doc.id}/confirm-payment`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 paidAmount: amount,
 paidDate: new Date().toISOString().split('T')[0],
 method,
 }),
 });

 if (response.ok) {
 const payload = await response.json();
 const receipt = payload?.receipt;
 
 // Refresh list
 setPage(1);
 await fetchDocuments();
 
 if (receipt && receipt.id) {
 window.open(`/api/documents/${receipt.id}/pdf`, '_blank');
 setTimeout(() => toast.info(t('messages.receiptCreated', language)), 100);
 } else {
 setTimeout(() => toast.info(t('messages.paymentConfirmed', language)), 100);
 }
 } else {
 const error = await response.json();
 console.error('Erro ao confirmar pagamento parcial:', error);
 toast.info(t('messages.paymentConfirmFailed', language));
 }
 } catch (error) {
 console.error('Erro ao confirmar pagamento parcial:', error);
 toast.info(t('messages.paymentConfirmFailed', language));
 }
 };

 const handleCreateReceipt = async (doc: Document) => {
 try {
 const proceed = await confirm(t('prompts.confirmPaymentGeneric', language));
 if (!proceed) return;

 const total = Number(doc?.totals?.total || 0);
 const paidSoFar = Number(doc?.payment?.paidAmount || 0);
 const remaining = Math.max(total - paidSoFar, 0);
 const defaultAmountStr = String(remaining || total);
 const amountStr = await prompt(t('prompts.enterPaidAmount', language), defaultAmountStr);
 if (!amountStr) return;
 const amount = parseFloat(amountStr.replace(',', '.'));
 if (isNaN(amount) || amount <= 0) {
 toast.info(t('messages.paymentConfirmFailed', language));
 return;
 }

 const method = (doc.payment?.method as any) || getDefaultPaymentMethod();
 const response = await fetch(`/api/documents/${doc.id}/confirm-payment`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 paidAmount: amount,
 paidDate: new Date().toISOString().split('T')[0],
 method,
 }),
 });

 if (response.ok) {
 const payload = await response.json();
 const receipt = payload?.receipt;
 
 // Refresh list to reflect new status and link
 // Reset to page 1 to ensure the new receipt is visible
 setPage(1);
 await fetchDocuments();
 
 // Open receipt PDF if available and alert accordingly
 if (receipt && receipt.id) {
 window.open(`/api/documents/${receipt.id}/pdf`, '_blank');
 // Short delay to allow UI to update before alert blocks it
 setTimeout(() => toast.info(t('messages.receiptCreated', language)), 100);
 } else {
 setTimeout(() => toast.info(t('messages.paymentConfirmed', language)), 100);
 }
 } else {
 const error = await response.json();
 console.error('Erro ao criar recibo:', error);
 toast.info(t('messages.receiptCreateFailed', language));
 }
 } catch (error) {
 console.error('Erro ao criar recibo:', error);
 toast.info(t('messages.receiptCreateFailed', language));
 }
 };

 const handleSettlePayment = async (doc: Document) => {
 try {
 const total = Number(doc?.totals?.total || 0);
 const paidSoFar = Number(doc?.payment?.paidAmount || 0);
 const remaining = Math.max(total - paidSoFar, 0);
 if (remaining <= 0) return;

 const method = (doc.payment?.method as any) || getDefaultPaymentMethod();
 const response = await fetch(`/api/documents/${doc.id}/confirm-payment`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 paidAmount: remaining,
 paidDate: new Date().toISOString().split('T')[0],
 method,
 }),
 });

 if (response.ok) {
 const payload = await response.json();
 const receipt = payload?.receipt;
 const updatedResponse = await fetch(`/api/documents${onlyActiveCompany ? '' : '?includeAll=true'}`);
 if (updatedResponse.ok) await fetchDocuments();
 if (receipt && receipt.id) {
 window.open(`/api/documents/${receipt.id}/pdf`, '_blank');
 toast.info(t('messages.receiptCreated', language));
 } else {
 toast.info(t('messages.paymentConfirmed', language));
 }
 } else {
 const error = await response.json();
 console.error('Erro ao liquidar pagamento:', error);
 toast.info(t('messages.receiptCreateFailed', language));
 }
 } catch (error) {
 console.error('Erro ao liquidar pagamento:', error);
 toast.info(t('messages.receiptCreateFailed', language));
 }
 };

 // Universal FR (POS) generator with partial payment support
 const handleGeneratePosFromAnyDocument = async (doc: Document) => {
 try {
 // If already FR, open POS PDF
 if (doc.documentType === 'factura_recibo' || doc.documentType === 'factura_recibo_autofacturacao') {
 window.open(`/api/documents/${doc.id}/pos-pdf?force=1`, '_blank');
 return;
 }

 // If Factura/ND with existing Recibo(s), open POS of the latest Recibo
 if (['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_adiantamento', 'factura_recibo_autofacturacao'].includes(doc.documentType)) {
 let latestReceiptId: string | undefined;
 if (Array.isArray(doc.relatedDocuments) && doc.relatedDocuments.length > 0) {
 const reversed = [...doc.relatedDocuments].reverse();
 for (const rid of reversed) {
 try {
 const resp = await fetch(`/api/documents/${rid}`);
 if (!resp.ok) continue;
 const payload = await resp.json();
 const d = payload?.document;
 if (d && d.documentType === 'recibo') {
 latestReceiptId = d.id;
 break;
 }
 } catch {}
 }
 }
 if (latestReceiptId) {
 window.open(`/api/documents/${latestReceiptId}/pos-pdf?force=1`, '_blank');
 return;
 }
 }

 // Load full document with lines
 const fullRes = await fetch(`/api/documents/${doc.id}`);
 let fullDoc: any = doc;
 if (fullRes.ok) {
 const payload = await fullRes.json();
 if (payload?.document) fullDoc = payload.document;
 }

 const sourceLines = Array.isArray(fullDoc?.lines) ? fullDoc.lines : [];
 if (!sourceLines.length) {
 toast.info('Documento sem linhas. Não é possível gerar POS.');
 return;
 }

 // Proforma/Orçamento → abrir POS diretamente desse documento (sem validar total)
 if (doc.documentType === 'proforma' || doc.documentType === 'orçamento') {
 window.open(`/api/documents/${doc.id}/pos-pdf?force=1`, '_blank');
 return;
 }

 // Determine base total
 const baseTotal = Number(fullDoc?.totals?.total || doc?.totals?.grandTotal || 0);
 if (!baseTotal || baseTotal <= 0) {
 toast.info('Total inválido para emissão POS.');
 return;
 }

 // Factura/ND → emitir Recibo com prompts e abrir POS
 if (['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_recibo_autofacturacao'].includes(doc.documentType)) {
 // Open FR modal to collect method and amount, then emit POS
 openFrModal(doc, 'pos');
 return;
 }

 // Proforma/Orçamento → abrir POS diretamente desse documento
 if (doc.documentType === 'proforma' || doc.documentType === 'orçamento') {
 window.open(`/api/documents/${doc.id}/pos-pdf?force=1`, '_blank');
 return;
 }

 toast.info('Tipo de documento não suportado para emissão POS.');
 } catch (e) {
 console.error('Erro ao emitir FR (POS):', e);
 toast.info('Falha ao emitir Factura‑Recibo (POS).');
 }
 };
 // Replace older POS handler usage in buttons
 const handleConvertProformaToFactura = async (doc: Document) => {
 // Open modal instead of prompts
 if (doc.documentType !== 'orçamento' && doc.documentType !== 'proforma') {
 toast.info('Apenas Orçamentos e Proformas podem ser convertidos em Factura‑Recibo.');
 return;
 }
 openFrModal(doc);
 return;
 };

 // Handle XML export
 const handleXmlExport = async () => {
 if (!startDate || !endDate) {
 toast.info(t('prompts.selectDateRange', language));
 return;
 }

 if (new Date(startDate) > new Date(endDate)) {
 toast.info(t('prompts.startDateBeforeEndDate', language));
 return;
 }

 try {
 const url = `/api/documents/export-xml?startDate=${startDate}&endDate=${endDate}${selectedExportCompanyId ? `&companyId=${encodeURIComponent(selectedExportCompanyId)}` : ''}`;
 const response = await fetch(url);
 
 if (response.ok) {
 const blob = await response.blob();
 const url = window.URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.style.display = 'none';
 a.href = url;
 a.download = `SAF-T_${startDate}_${endDate}.xml`;
 document.body.appendChild(a);
 a.click();
 window.URL.revokeObjectURL(url);
 document.body.removeChild(a);
 setShowXmlExport(false);
 setStartDate('');
 setEndDate('');
 toast.info(t('messages.xmlExportSuccess', language));
 } else {
 const error = await response.json();
 if (error && error.code === 'MISSING_COMPANY_CONFIG') {
 setMissingFields(error.fieldsMissing || []);
 setShowMissingConfigModal(true);
 await loadCompanyConfig();
 } else {
 toast.info(`${t('errors.exportXmlFailed', language)}: ${error.error}${error.details ? ` — ${error.details}` : ''}`);
 }
 }
 } catch (error) {
 console.error('Error exporting XML:', error);
 toast.info(t('errors.exportXmlFailedRetry', language));
 }
 };

 const isMissing = (label: string) => missingFields.includes(label);

 const isValidAgtCert = (s: string) => {
 const val = String(s || '').trim();
 return val === '0' || /^\d{3}\/AGT\/\d{4}$/.test(val);
 };

 const canSaveInline = (
 (!isMissing('NIF da empresa') || !!nif) &&
 (!isMissing('Nome da empresa') || !!companyName) &&
 (!isMissing('Morada da empresa') || !!address) &&
 (!isMissing('Cidade da empresa') || !!city) &&
 (!isMissing('Província da empresa') || !!province) &&
 (!isMissing('Código Postal da empresa') || !!postalCode) &&
 (!isMissing('Telefone da empresa') || !!phone) &&
 (!isMissing('ID do produto (software)') || !!saftProductId) &&
 (!isMissing('Versão do produto (software)') || !!saftProductVersion) &&
 (!isMissing('NIF da entidade de software') || !!saftProductCompanyTaxId) &&
 (!isMissing('Número de certificado AGT') || (saftSoftwareCertificateNumber && isValidAgtCert(saftSoftwareCertificateNumber)))
 );

 const handleSaveCompanyInline = async () => {
 if ((saftSoftwareCertificateNumber || '').trim() && !isValidAgtCert(saftSoftwareCertificateNumber)) {
 toast.info('Número de Certificado AGT inválido. Use NNN/AGT/YYYY (ex.: 456/AGT/2025).');
 return;
 }
 const payload = {
 name: companyName,
 tradeName,
 nif,
 address,
 city,
 province,
 postalCode,
 email,
 phone,
 saftProductId,
 saftProductVersion,
 saftProductCompanyTaxId,
 saftSoftwareCertificateNumber,
 };
 try {
 const isBlank = (v: any) => !String(v || '').trim();
 const needsInitialSet = [nif, saftProductId, saftProductVersion, saftProductCompanyTaxId, saftSoftwareCertificateNumber].some(isBlank);
 const method: 'POST' | 'PUT' = needsInitialSet ? 'POST' : 'PUT';
 const resp = await fetch('/api/settings/company', {
 method,
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 });
 if (resp.ok) {
 // Persistir também na lista de empresas para que estes dados fiquem associados à empresa ativa
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
 }).catch(() => {});
 }
 }
 } catch {}
 setShowMissingConfigModal(false);
 // tentar exportar novamente com os dados preenchidos
 await handleXmlExport();
 } else {
 const err = await resp.json();
 toast.info(`Erro ao guardar configuração: ${err.error || 'Falha desconhecida'}`);
 }
 } catch (e) {
 toast.info('Erro ao guardar configuração. Tente novamente.');
 }
 };
 
 return (
 <Layout title="Documentos | Prakash">
 <div className="container mx-auto px-4 py-8">
 <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
 <div>
 <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('nav.documents', language)}</h1>
 <p className="text-gray-600 dark:text-gray-300 mt-1">{t('documents.subtitle', language)}</p>
 </div>
 
 <div className="mt-4 md:mt-0 flex gap-2">
 <Button 
 variant="secondary"
 onClick={() => setShowXmlExport(true)}
 >
 {t('actions.exportXmlAgt', language)}
 </Button>
 <Link href="/documents/new">
 <Button variant="primary">
 {t('documents.new', language)}
 </Button>
 </Link>
 </div>
 </div>
 
 <div className="bg-white dark:bg-gray-800 dark:text-gray-100 shadow overflow-hidden">
 <div className="p-4 border-b">
 <div className="flex flex-wrap gap-2 items-center justify-between">
 <div className="flex gap-2 items-center">
 <Button 
 variant={filter === 'all' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('all')}
 >
 {t('common.all', language)}
 </Button>
 <Button 
 variant={filter === 'factura' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('factura')}
 >
 {t('documents.filter.invoices', language)}
 </Button>
 <Button 
 variant={filter === 'orçamento' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('orçamento')}
 >
 {t('documents.filter.quotes', language)}
 </Button>
 {/* New document type filters */}
 <Button 
 variant={filter === 'factura_recibo' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('factura_recibo')}
 >
 {t('doc.type.factura_recibo', language)}
 </Button>
 <Button 
 variant={filter === 'nota_de_debito' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('nota_de_debito')}
 >
 {t('doc.type.nota_de_debito', language)}
 </Button>
 <Button 
 variant={filter === 'nota_de_credito' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('nota_de_credito')}
 >
 {t('doc.type.nota_de_credito', language)}
 </Button>
 <Button 
 variant={filter === 'proforma' ? 'primary' : 'secondary'} 
 size="sm"
 onClick={() => setFilter('proforma')}
 >
 {t('doc.type.proforma', language)}
 </Button>
 </div>
 <div className="flex items-center gap-3">
 <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
 <input
 type="checkbox"
 checked={onlyActiveCompany}
 onChange={(e) => setOnlyActiveCompany(e.target.checked)}
 />
 {t('documents.onlyActiveCompany', language)}
 </label>
 <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
 {t('documents.tipMigrateDocuments', language)}
 </span>
 </div>
 </div>
 </div>

 {bankAccounts.length > 0 && (
 <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
 <div className="flex items-center justify-between mb-2">
 <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('bank.accountsTitle', language)}</h2>
 <span className="text-xs text-gray-500 dark:text-gray-400">{t('bank.companyLabel', language)}: {tradeName || companyName || '—'} · {t('bank.nifLabel', language)}: {nif || '—'}</span>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {bankAccounts.map((acc, idx) => (
 <div key={idx} className="rounded border bg-white dark:bg-gray-800 dark:border-gray-700 p-3">
 <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{acc.bankName || t('bank.bankLabel', language)}</div>
 <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{t('bank.currencyLabel', language)}: {acc.currency || 'AOA'}</div>
 {acc.account && (
 <div className="mt-1 flex items-center justify-between">
 <div className="text-xs text-gray-600 dark:text-gray-300">{t('bank.accountLabel', language)}: {acc.account}</div>
 <button
 className="text-xs text-blue-600 hover:underline"
 onClick={() => acc.account && navigator.clipboard.writeText(acc.account)}
 >
 {t('bank.copy', language)}
 </button>
 </div>
 )}
 {acc.iban && (
 <div className="mt-1 flex items-center justify-between">
 <div className="text-xs text-gray-600 dark:text-gray-300">{t('bank.ibanLabel', language)}: {acc.iban}</div>
 <button
 className="text-xs text-blue-600 hover:underline"
 onClick={() => acc.iban && navigator.clipboard.writeText(acc.iban)}
 >
 {t('bank.copy', language)}
 </button>
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 )}
 {bankAccounts.length === 0 && (
 <div className="px-4 py-3 border-b bg-yellow-50 dark:bg-yellow-900/20 dark:border-gray-700">
 <div className="flex items-center justify-between">
 <div className="text-sm text-yellow-800 dark:text-yellow-200">
 {t('bank.noAccountsConfigured', language)}
 </div>
 <Link href="/settings" className="text-sm font-medium text-yellow-900 dark:text-yellow-300 hover:underline">{t('actions.openSettings', language)}</Link>
 </div>
 </div>
 )}

 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
 <thead className="bg-gray-50 dark:bg-gray-900">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.number', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.type', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.date', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.client', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.total', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.agt', language)}
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.status', language)}
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
 {t('table.actions', language)}
 </th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
 {loading ? (
 <tr>
 <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
 {t('common.loadingDocuments', language)}
 </td>
 </tr>
 ) : (
 filteredDocuments.map((doc) => (
 <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
 {doc.sequentialNumber}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
 {getDocumentTypeLabel(doc.documentType)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
 {formatDateTime(doc.createdAt || doc.issueDate)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
 <div>{doc.buyer.name}</div>
 <div className="text-xs text-gray-400 dark:text-gray-500">{t('common.nifShort', language)}: {doc.buyer.nif}</div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">
 <div>{formatCurrency(doc.totals.total)}</div>
 {(doc.documentType !== 'nota_de_credito' && doc.documentType !== 'recibo' && doc.documentType !== 'nota_de_entrega') && Math.max((doc?.totals?.total || 0) - (doc?.payment?.paidAmount || 0), 0) > 0 && (doc.documentType !== 'proforma' && doc.documentType !== 'orçamento') && (
 <div className="text-xs text-amber-600">{t('documents.outstanding', language)}: {formatCurrency(Math.max((doc?.totals?.total || 0) - (doc?.payment?.paidAmount || 0), 0))}</div>
 )}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span 
 className={`px-2 py-1 text-xs ${getAgtStatusClass(doc.agtSubmission?.status)} cursor-help`}
 title={doc.agtSubmission?.message || doc.agtSubmission?.status}
 >
 {getAgtStatusLabel(doc.agtSubmission?.status)}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className={`px-2 py-1 text-xs ${getDisplayStatusClass(doc)}`}>
 {t(getDisplayStatusLabelKey(doc), language)}
 </span>
 </td>
 <td className="px-6 py-4 text-right text-sm font-medium">
 <div className="flex flex-wrap justify-end items-center gap-2 md:gap-3 text-xs md:text-sm">
 {((doc.status === 'issued' || doc.status === 'paid') && doc.agtSubmission?.status !== 'success' && ['factura', 'factura_recibo', 'recibo', 'nota_de_credito', 'nota_de_debito', 'nota_de_entrega'].includes(doc.documentType)) && (
 <button
 onClick={async () => {
 try {
 setDocuments((prev: any[]) => prev.map((d: any) => d.id === doc.id ? { ...d, agtSubmission: { ...(d.agtSubmission || {}), status: 'pending', message: 'Manual sync started' } } : d));
 const res = await fetch('/api/agt/sync-document', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ documentId: doc.id })
 });
 const data = await res.json();
 if (res.status === 202 || data?.pending) {
 setDocuments((prev: any[]) => prev.map((d: any) => d.id === doc.id ? { ...d, agtSubmission: { ...(d.agtSubmission || {}), status: 'pending', message: data?.message || 'Submitted, awaiting processing' } } : d));
 } else if (res.ok && data.success) {
 toast.info('Sincronizado com sucesso!');
 setDocuments((prev: any[]) => prev.map((d: any) => d.id === doc.id ? { ...d, agtSubmission: { ...(d.agtSubmission || {}), status: 'success', message: data?.message || 'Synced successfully' } } : d));
 window.dispatchEvent(new CustomEvent('agt-sync-complete', { detail: { documentId: doc.id } }));
 } else {
 const message = String(data?.error || data?.message || 'Falha na sincronização');
 const lower = message.toLowerCase();
 const alreadyExists = lower.includes('já consta no repositório') || lower.includes('já consta no repositório') || lower.includes('duplicada') || lower.includes('already exists');
 if (alreadyExists) {
 setDocuments((prev: any[]) => prev.map((d: any) => d.id === doc.id ? { ...d, agtSubmission: { ...(d.agtSubmission || {}), status: 'success', message: 'Already exists on AGT' } } : d));
 window.dispatchEvent(new CustomEvent('agt-sync-complete', { detail: { documentId: doc.id } }));
 } else {
 setDocuments((prev: any[]) => prev.map((d: any) => d.id === doc.id ? { ...d, agtSubmission: { ...(d.agtSubmission || {}), status: 'error', message } } : d));
 toast.info('Erro: ' + message);
 }
 }
 } catch (e) {
 toast.info('Erro ao conectar ao servidor');
 }
 }}
 className="text-blue-600 hover:text-blue-800 font-bold"
 title="Sincronizar com AGT"
 >
 Sincronizar
 </button>
 )}
 <Link href={`/documents/${doc.id}`} className="text-primary hover:text-primary/80">
 {t('actions.view', language)}
 </Link>
 {doc.status === 'draft' && doc.documentType !== 'proforma' && doc.documentType !== 'orçamento' && (
 <Link
 href={`/documents/${doc.id}/edit`}
 className="text-secondary hover:text-secondary/80 dark:text-white dark:hover:text-white/80"
 >
 {t('actions.edit', language)}
 </Link>
 )}
 {(doc.documentType === 'factura') && (
 <Link href={`/transport-guides?fromDoc=${doc.id}`} className="text-blue-600 hover:text-blue-800">
 {t('actions.generateTransportGuide', language)}
 </Link>
 )}
 {(doc.status !== 'cancelled') && (
 ['factura','factura_recibo','recibo','proforma','orçamento','nota_de_entrega','nota_de_credito','nota_de_debito'].includes(doc.documentType)
 ) && (
 <button
 onClick={() => handleGeneratePosFromAnyDocument(doc)}
 className="text-secondary hover:text-secondary/80 dark:text-white dark:hover:text-white/80"
 title={'Gerar POS'}
 >
 {'Gerar POS'}
 </button>
 )}
 {/* Ações adicionais sem POS */}
 {(doc.documentType === 'orçamento' || doc.documentType === 'proforma') && !frSourceIds.has(String(doc.id)) && (
 <div className="relative group">
 <button
 onClick={() => handleConvertProformaToFactura(doc)}
 className="text-green-600 hover:text-green-800"
 aria-label="Criar Factura‑Recibo"
 >
 Criar Factura‑Recibo
 </button>
 <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none shadow">
 Converte o {doc.documentType === 'orçamento' ? 'Orçamento' : 'Proforma'} numa Factura‑Recibo com as mesmas linhas.
 </span>
 </div>
 )}
 {(doc.documentType !== 'nota_de_credito' && doc.documentType !== 'proforma' && doc.documentType !== 'orçamento' && doc.documentType !== 'nota_de_entrega' && (doc.status === 'issued' || doc.status === 'paid')) && (
 <button 
 onClick={() => handleCancelInvoice(doc.id)}
 className="text-danger hover:text-danger/80"
 title={t('actions.cancel', language)}
 >
 {t('actions.cancel', language)}
 </button>
 )}
 {((['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_adiantamento', 'factura_recibo_autofacturacao'].includes(doc.documentType)) && (doc.status === 'issued' || doc.status === 'draft') && (doc.payment?.status !== 'paid')) && (
 <button
 onClick={() => handleConfirmPayment(doc)}
 className="text-success hover:text-success/80"
 title={'Pagamento parcial'}
 >
 {'Pagamento parcial'}
 </button>
 )}
 {((['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_adiantamento', 'factura_recibo_autofacturacao'].includes(doc.documentType)) && (doc.status === 'issued' || doc.status === 'draft') && (doc.payment?.status !== 'paid') && ((doc.totals.total - (doc.payment?.paidAmount || 0)) > 0)) && (
 <button
 onClick={() => handleSettlePayment(doc)}
 className="text-success hover:text-success/80"
 title={'Recibo'}
 >
 {'Recibo'}
 </button>
 )}

 </div>
 </td>
 </tr>
 ))
 )
 }
 </tbody>
 </table>
 </div>
 
 {!loading && filteredDocuments.length === 0 && (
 <div className="p-8 text-center">
 <p className="text-gray-500">{t('messages.noDocumentsFound', language)}</p>
 </div>
 )}
 
 {!loading && filteredDocuments.length > 0 && (
 <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
 <div className="text-sm text-gray-600 dark:text-gray-300">
 {t('common.showingRange', language, {
 start: Math.min((page - 1) * LIMIT + 1, totalCount),
 end: Math.min(page * LIMIT, totalCount),
 total: totalCount,
 })}
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="secondary"
 size="sm"
 onClick={() => setPage(1)}
 disabled={page <= 1}
 className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700"
 >
 « {t('pagination.first', language)}
 </Button>
 <Button
 variant="secondary"
 size="sm"
 onClick={() => setPage(p => Math.max(1, p - 1))}
 disabled={page <= 1}
 className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700"
 >
 ‹ {t('pagination.prev', language)}
 </Button>
 <span className="text-sm text-gray-700 dark:text-gray-200 px-3 py-1 rounded border border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
 {t('common.pageOf', language, { current: page, total: totalPages })}
 </span>
 <Button
 variant="secondary"
 size="sm"
 onClick={() => setPage(p => Math.min(totalPages, p + 1))}
 disabled={page >= totalPages}
 className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700"
 >
 {t('pagination.next', language)} ›
 </Button>
 <Button
 variant="secondary"
 size="sm"
 onClick={() => setPage(totalPages)}
 disabled={page >= totalPages}
 className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700"
 >
 {t('pagination.last', language)} »
 </Button>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* XML Export Modal */}
 {showXmlExport && (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
 <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 w-full max-w-md mx-4">
 <h3 className="text-lg font-semibold mb-4">{t('documents.xmlExport.title', language)}</h3>
 <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
 {t('documents.xmlExport.description', language)}
 </p>
 
 <div className="space-y-4">
 <div>
 <label htmlFor="exportCompanyId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('settings.activeCompany.label', language)} ({t('actions.exportXml', language)})
 </label>
 <select
 id="exportCompanyId"
 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 value={selectedExportCompanyId || ''}
 onChange={(e) => setSelectedExportCompanyId(e.target.value)}
 >
 <option value="">{t('common.select', language)} ({t('settings.activeCompany.label', language)})</option>
 {companiesList.map(c => (
 <option key={c.id} value={c.id}>
 {(c.tradeName || c.name || t('bank.companyLabel', language))}{c.nif ? ` · ${t('common.nifShort', language)} ${c.nif}` : ''}
 </option>
 ))}
 </select>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Exporta para a empresa selecionada sem alterar a ativa.</p>
 </div>
 <div>
 <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('documents.xmlExport.startDate', language)}
 </label>
 <input
 type="date"
 id="startDate"
 value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 
 <div>
 <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('documents.xmlExport.endDate', language)}
 </label>
 <input
 type="date"
 id="endDate"
 value={endDate}
 onChange={(e) => setEndDate(e.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 />
 </div>
 </div>
 
 <div className="flex gap-3 mt-6">
 <Button
 variant="secondary"
 onClick={() => {
 setShowXmlExport(false);
 setStartDate('');
 setEndDate('');
 }}
 className="flex-1"
 >
 {t('actions.cancel', language)}
 </Button>
 <Button
 variant="primary"
 onClick={handleXmlExport}
 className="flex-1"
 >
 {t('actions.exportXml', language)}
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* FR Creation Modal */}
 {showFrModal && frSourceDoc && (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
 <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 w-full max-w-md mx-4">
 <h3 className="text-lg font-semibold mb-4">Criar Factura‑Recibo</h3>
 <div className="space-y-3 text-sm">
 <div className="text-gray-700 dark:text-gray-300">
 <div><span className="font-medium">Documento origem:</span> {getDocumentTypeLabel(frSourceDoc.documentType)} · {frSourceDoc.sequentialNumber}</div>
 <div><span className="font-medium">Cliente:</span> {frSourceDoc.buyer?.name || '—'}</div>
 <div>
 <span className="font-medium">Total do documento:</span> {formatCurrency(Number(frFullDoc?.totals?.total || frSourceDoc?.totals?.grandTotal || 0))}
 </div>
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">Tipo de pagamento</label>
 <select
 value={frMethod}
 onChange={(e) => setFrMethod(e.target.value as any)}
 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
 >
 <option value="cash">Numerário</option>
 <option value="bank_transfer">Transferência</option>
 <option value="card">Cartão</option>
 <option value="mobile_money">Mobile Money</option>
 <option value="other">Outro</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">Valor pago</label>
 <input
 type="number"
 step="0.01"
 min="0"
 value={frPaidAmount}
 onChange={(e) => setFrPaidAmount(e.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
 />
 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Indique o valor recebido. Suporta pagamento parcial.</p>
 </div>
 </div>
 <div className="flex gap-3 mt-6">
 <Button
 variant="secondary"
 onClick={closeFrModal}
 disabled={frSubmitting}
 className="flex-1"
 >
 Cancelar
 </Button>
 <Button
 variant="primary"
 onClick={() => handleFrSubmit('pdf')}
 disabled={frSubmitting}
 className="flex-1"
 >
 Gerar PDF
 </Button>
 <Button
 variant="primary"
 onClick={() => handleFrSubmit('pos')}
 disabled={frSubmitting}
 className="flex-1"
 >
 Gerar POS
 </Button>
 </div>
 </div>
 </div>
 )}

 {showMissingConfigModal && (
 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
 <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-6 w-full max-w-2xl mx-4">
 <h3 className="text-lg font-semibold mb-3">{t('documents.xmlExport.missingConfig.title', language)}</h3>
 <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{t('documents.xmlExport.missingConfig.description', language)}</p>
 {missingFields.length > 0 && (
 <div className="mb-4 p-3 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 rounded">
 <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">{t('documents.xmlExport.missingConfig.fieldsTitle', language)}</div>
 <ul className="list-disc list-inside text-sm text-yellow-900">
 {missingFields.map((f) => (
 <li key={f}>{f}</li>
 ))}
 </ul>
 </div>
 )}

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm text-gray-700 mb-1">Nome da empresa{isMissing('Nome da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={companyName} onChange={(e)=>setCompanyName(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Nome comercial</label>
 <input className="w-full border rounded px-3 py-2" value={tradeName} onChange={(e)=>setTradeName(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">NIF{isMissing('NIF da empresa') ? ' *' : ''}</label>
 <input className={`w-full border rounded px-3 py-2 ${((nif || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={nif} onChange={(e)=>setNif(e.target.value)} readOnly={Boolean((nif || '').trim())} />
 </div>
 <div className="md:col-span-2">
 <label className="block text-sm text-gray-700 mb-1">Morada{isMissing('Morada da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={address} onChange={(e)=>setAddress(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Cidade{isMissing('Cidade da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={city} onChange={(e)=>setCity(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Província{isMissing('Província da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={province} onChange={(e)=>setProvince(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Código Postal{isMissing('Código Postal da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={postalCode} onChange={(e)=>setPostalCode(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Email</label>
 <input className="w-full border rounded px-3 py-2" value={email} onChange={(e)=>setEmail(e.target.value)} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Telefone{isMissing('Telefone da empresa') ? ' *' : ''}</label>
 <input className="w-full border rounded px-3 py-2" value={phone} onChange={(e)=>setPhone(e.target.value)} />
 </div>

 <div className="md:col-span-2 mt-2">
 <h4 className="text-sm font-semibold text-gray-800 mb-2">Software (AGT)</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm text-gray-700 mb-1">ID do Produto{isMissing('ID do produto (software)') ? ' *' : ''}</label>
 <input className={`w-full border rounded px-3 py-2 ${((saftProductId || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={saftProductId} onChange={(e)=>setSaftProductId(e.target.value)} readOnly={true} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Versão do Produto{isMissing('Versão do produto (software)') ? ' *' : ''}</label>
 <input className={`w-full border rounded px-3 py-2 ${((saftProductVersion || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={saftProductVersion} onChange={(e)=>setSaftProductVersion(e.target.value)} readOnly={true} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">NIF da Entidade de Software{isMissing('NIF da entidade de software') ? ' *' : ''}</label>
 <input className={`w-full border rounded px-3 py-2 ${((saftProductCompanyTaxId || '').trim() ? 'bg-gray-50 text-gray-700' : '')}`} value={saftProductCompanyTaxId} onChange={(e)=>setSaftProductCompanyTaxId(e.target.value)} readOnly={true} />
 </div>
 <div>
 <label className="block text-sm text-gray-700 mb-1">Nº Certificado AGT{isMissing('Número de certificado AGT') ? ' *' : ''}</label>
 <input className={`w-full border rounded px-3 py-2 ${((saftSoftwareCertificateNumber || '').trim() ? 'bg-gray-50 text-gray-700' : '')} ${((saftSoftwareCertificateNumber || '').trim() && !isValidAgtCert(saftSoftwareCertificateNumber)) ? 'border-red-500' : ''}`} value={saftSoftwareCertificateNumber} onChange={(e)=>setSaftSoftwareCertificateNumber(e.target.value)} readOnly={Boolean((saftSoftwareCertificateNumber || '').trim())} />
 <p className={`text-xs mt-1 ${((saftSoftwareCertificateNumber || '').trim() && !isValidAgtCert(saftSoftwareCertificateNumber)) ? 'text-red-600' : 'text-gray-500'}`}>Formato esperado: NNN/AGT/YYYY (ex.: 456/AGT/2025) ou '0'.</p>
 </div>
 </div>
 </div>
 </div>

 <div className="flex gap-3 mt-6">
 <Button variant="secondary" className="flex-1" onClick={() => setShowMissingConfigModal(false)}>{t('actions.cancel', language)}</Button>
 <Button variant="primary" className="flex-1" onClick={handleSaveCompanyInline} disabled={!canSaveInline}>{t('documents.xmlExport.saveAndExport', language)}</Button>
 </div>
 </div>
 </div>
 )}
 </Layout>
 );
}

export const getServerSideProps: GetServerSideProps<DocumentsPageProps> = async (ctx) => {
 const q = ctx.query || {};
 const page = Math.max(1, Number(q.page || 1) || 1);
 const limit = 20;
 const includeAll = String(q.includeAll || 'true').toLowerCase() === 'true';
 const filterType = typeof q.type === 'string' ? q.type : 'all';

 try {
 const { documentStore } = await import('@/lib/documentStore');
 const { companyJsonPath } = await import('@/lib/dataPaths');
 const fs = await import('fs');

 let activeNif = '';
 let activeName = '';
 let activeTradeName = '';
 try {
 const companyPath = companyJsonPath();
 if (fs.existsSync(companyPath)) {
 const raw = fs.readFileSync(companyPath, 'utf-8');
 const cfg = raw ? JSON.parse(raw) : {};
 activeNif = cfg.nif || '';
 activeName = cfg.name || '';
 activeTradeName = cfg.tradeName || '';
 }
 } catch {}

 const hasActiveCompanyFilter = Boolean(String(activeNif || '').trim() || String(activeName || '').trim() || String(activeTradeName || '').trim());
 const norm = (s: any) => String(s || '').replace(/\s+/g, '').toLowerCase();

 let docs: any[] = documentStore.getAllDocuments();
 docs = docs.filter(d => d && typeof d === 'object');

 if (!includeAll && hasActiveCompanyFilter) {
 docs = docs.filter((d: any) => {
 const s = d.seller || {};
 return (activeNif && s.nif && norm(s.nif) === norm(activeNif))
 || (activeTradeName && s.tradeName && norm(s.tradeName) === norm(activeTradeName))
 || (activeName && s.name && norm(s.name) === norm(activeName));
 });
 }

 if (filterType && filterType !== 'all') {
 const ft = String(filterType).toLowerCase();
 docs = docs.filter((d: any) => String(d.documentType || '').toLowerCase() === ft);
 }

 docs.sort((a: any, b: any) => {
 const da = new Date(a.issueDate || a.createdAt || 0).getTime();
 const db = new Date(b.issueDate || b.createdAt || 0).getTime();
 if (db !== da) return db - da;
 return Number(b.sequentialNumber || 0) - Number(a.sequentialNumber || 0);
 });

 const totalCount = docs.length;
 const totalPages = Math.max(1, Math.ceil(totalCount / limit) || 1);
 const start = (page - 1) * limit;
 const pageDocs = docs.slice(start, start + limit);

 const normalizedDocs = pageDocs.map((d: any) => {
 const totalsSrc = d?.totals || {};
 const total = Number(totalsSrc?.total ?? totalsSrc?.grandTotal ?? d?.total ?? 0) || 0;
 const subtotal = Number(totalsSrc?.subtotal ?? totalsSrc?.taxableBase ?? 0) || 0;
 const vatTotal = Number(totalsSrc?.vatTotal ?? totalsSrc?.taxPayable ?? 0) || 0;
 const discount = Number(totalsSrc?.discount ?? totalsSrc?.discountTotal ?? 0) || 0;
 const vatBreakdown = Array.isArray(totalsSrc?.vatBreakdown) ? totalsSrc.vatBreakdown : [];
 const buyer = d?.buyer || { name: '', nif: '' };
 return {
 ...d,
 buyer: {
 name: buyer?.name || buyer?.tradeName || '—',
 nif: buyer?.nif || '—',
 },
 totals: {
 subtotal,
 discount,
 vatTotal,
 total,
 grandTotal: total,
 vatBreakdown
 }
 };
 });

 return {
 props: {
 initialDocuments: normalizedDocs as any,
 initialPage: page,
 initialTotalPages: totalPages,
 initialTotalCount: totalCount,
 }
 };
 } catch {
 return {
 props: {
 initialDocuments: [],
 initialPage: page,
 initialTotalPages: 1,
 initialTotalCount: 0
 }
 };
 }
};

