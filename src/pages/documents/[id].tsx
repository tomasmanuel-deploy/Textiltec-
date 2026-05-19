import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { useAppSettings } from '@/context/AppSettingsContext';
import { t } from '@/lib/i18n';
import { useToast } from '@/context/ToastContext';
import { useConfirm, usePrompt } from '@/context/DialogContext';

interface DocumentBuyer {
  name: string;
  nif: string;
}

interface DocumentTotals {
  netTotal: number;
  taxTotal: number;
  grandTotal: number;
}

interface LineItem {
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  total: number;
  discount?: number;
}

interface Document {
  id: string;
  sequentialNumber: string | number;
  documentType: string;
  issueDate: string;
  dueDate?: string;
  taxableDate?: string;
  buyer: DocumentBuyer;
  totals: DocumentTotals;
  status: string;
  lines: LineItem[];
  payment?: {
    status?: 'pending' | 'partial' | 'paid';
    method?: string;
    dueDate?: string;
    paidAmount?: number;
    paidDate?: string;
  };
  cancellation?: {
    reason?: string;
    cancelledAt?: string;
  };
  relatedDocuments?: string[];
  agtSubmission?: {
    status: 'pending' | 'success' | 'error' | 'offline_pending';
    message?: string;
    submissionDate?: string;
    agtId?: string;
  };
}

// Removed mockDocuments fallback to ensure first-run is empty

export default function DocumentDetail() {
  const { language } = useAppSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const router = useRouter();
  const { id } = router.query;
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfCached, setPdfCached] = useState<boolean>(false);
  const [pdfCacheLoading, setPdfCacheLoading] = useState<boolean>(false);
  const [company, setCompany] = useState<{ bankAccounts?: Array<{ bankName?: string; accountName?: string; accountNumber?: string; iban?: string; swift?: string }> } | null>(null);
  const [companyLoading, setCompanyLoading] = useState<boolean>(true);
  const [receipts, setReceipts] = useState<Array<{ id: string; issueDate?: string; method?: string; amount?: number; series?: string; sequentialNumber?: number | string }>>([]);

  const hasReceipts = Array.isArray(receipts) && receipts.length > 0;
  const latestReceiptId = hasReceipts ? receipts.reduce((acc, r) => {
    const accTs = acc ? new Date(acc.issueDate || '').getTime() : 0;
    const rTs = new Date(r.issueDate || '').getTime();
    return (!acc || rTs >= accTs) ? r : acc;
  }, null as any)?.id : undefined;
  // Pagamento misto: dinheiro + outro método
  const [mixedOpen, setMixedOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [otherAmount, setOtherAmount] = useState<number>(0);
  const [otherMethod, setOtherMethod] = useState<'bank_transfer' | 'card' | 'mobile_money' | 'other'>('bank_transfer');
  const [autoBalance, setAutoBalance] = useState(true);
  const [clampHint, setClampHint] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // AGT Compliance: Rounding helper (Round Half Up)
  const round = (value: number, decimals: number = 2): number => {
    return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
  };

  useEffect(() => {
    if (!clampHint) return;
    const t = setTimeout(() => setClampHint(null), 3000);
    return () => clearTimeout(t);
  }, [clampHint]);
  const getDefaultMethod = (): 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other' => {
    let m: any = 'other';
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.method) m = parsed.method;
      }
    } catch {}
    return m;
  };

  const openMixedPayment = () => {
    if (!document) return;
    const remaining = Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0);
    const def = getDefaultMethod();
    const nextMethod = def === 'cash' ? 'bank_transfer' : def;
    setOtherMethod(nextMethod as any);
    setCashAmount(0);
    setOtherAmount(remaining);
    setAutoBalance(true);
    setMixedOpen(true);
  };

  const handleCashAmountChange = (val: number) => {
    if (!document) return;
    const remaining = Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0);
    const rawCash = Math.max(val, 0);
    if (autoBalance) {
      const cash = round(rawCash);
      const other = round(Math.max(remaining - cash, 0));
      setCashAmount(cash);
      setOtherAmount(other);
      setClampHint(null);
    } else {
      const maxCash = Math.max(remaining - Number(otherAmount || 0), 0);
      const clamped = Math.min(rawCash, maxCash);
      const cash = round(clamped);
      setCashAmount(cash);
      if (rawCash > maxCash + 1e-9) setClampHint('Valor de dinheiro ajustado para não exceder o restante.');
      else setClampHint(null);
    }
  };

  const handleOtherAmountChange = (val: number) => {
    if (!document) {
      setOtherAmount(Math.max(val, 0));
      return;
    }
    const remaining = Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0);
    const rawOther = Math.max(val, 0);
    if (autoBalance) {
      const other = round(rawOther);
      const cash = round(Math.max(remaining - other, 0));
      setOtherAmount(other);
      setCashAmount(cash);
      setClampHint(null);
    } else {
      const maxOther = Math.max(remaining - Number(cashAmount || 0), 0);
      const clamped = Math.min(rawOther, maxOther);
      const other = round(clamped);
      setOtherAmount(other);
      if (rawOther > maxOther + 1e-9) setClampHint('Valor do outro método ajustado para não exceder o restante.');
      else setClampHint(null);
    }
  };

  const handleConfirmMixedPayment = async () => {
    if (!document) return;
    const remaining = Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0);
    const sum = Number(cashAmount || 0) + Number(otherAmount || 0);
    if (sum <= 0) {
      toast.warning('Indique valores para pagamento.');
      return;
    }

    // Se a soma atinge ou supera o restante, ajustar para liquidar exatamente o total
    const epsilon = 0.01;
    const shouldLiquidate = sum >= (remaining - epsilon);
    let cashPortion = Number(cashAmount || 0);
    let otherPortion = Number(otherAmount || 0);
    if (shouldLiquidate) {
      cashPortion = Math.min(Math.max(cashPortion, 0), remaining);
      otherPortion = Math.min(Math.max(otherPortion, 0), Math.max(0, remaining - cashPortion));
    } else if (sum > remaining) {
      const proceed = await confirm('Valor total excede o restante. Continuar como duas entradas parciais?');
      if (!proceed) return;
    }

    try {
      let lastReceiptId: string | undefined;

      if (cashPortion > 0) {
        const resp1 = await fetch(`/api/documents/${document.id}/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'cash', paidAmount: cashPortion }),
        });
        if (!resp1.ok) {
          const err = await resp1.json().catch(() => null);
          throw new Error(err?.error || 'Falha ao confirmar pagamento em dinheiro.');
        }
        const r1 = await resp1.json().catch(() => null);
        lastReceiptId = r1?.receipt?.id || lastReceiptId;
      }

      if (otherPortion > 0) {
        const resp2 = await fetch(`/api/documents/${document.id}/confirm-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: otherMethod, paidAmount: otherPortion }),
        });
        if (!resp2.ok) {
          const err = await resp2.json().catch(() => null);
          throw new Error(err?.error || 'Falha ao confirmar pagamento com segundo método.');
        }
        const r2 = await resp2.json().catch(() => null);
        lastReceiptId = r2?.receipt?.id || lastReceiptId;
      }

      // Atualizar documento e abrir recibo final quando liquidado
      try {
        const refresh = await fetch(`/api/documents/${document.id}`);
        if (refresh.ok) {
          const payload = await refresh.json();
          const updatedDoc = payload?.document;
          if (updatedDoc) setDocument(updatedDoc);
          if (lastReceiptId) {
            router.push(`/documents/${lastReceiptId}`);
            return;
          }
        }
      } catch {}

      setMixedOpen(false);
      toast.success(shouldLiquidate ? 'Pagamento misto confirmado e documento liquidado.' : 'Pagamento misto confirmado com sucesso.');
    } catch (error) {
      console.error('Erro no pagamento misto:', error);
      toast.error(error instanceof Error ? error.message : 'Ocorreu um erro ao confirmar pagamento misto.');
    }
  };

  const handleCancel = async () => {
    if (!document) return;
    
    // Check if document can be cancelled
    if (document.status === 'cancelled') {
      toast.info('Documento já anulado.');
      return;
    }
    
    if (document.documentType === 'nota_de_credito') {
      toast.warning('Não é possível anular uma Nota de Crédito. Se houve erro, deve emitir uma nova Factura ou Nota de Débito para corrigir.');
      return;
    }

    if (!await confirm('Tem a certeza que deseja anular este documento? Esta acção é irreversível e irá gerar uma Nota de Crédito para estorno (se aplicável).')) {
      return;
    }

    const reason = await prompt('Por favor, indique o motivo da anulação (obrigatório para AGT):');
    if (reason === null) return; // Cancelled prompt
    if (!reason.trim()) {
      toast.warning('O motivo é obrigatório.');
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao anular documento');
      }

      const data = await response.json();
      
      toast.success('Documento anulado com sucesso. ' + (data.creditNote ? 'Nota de Crédito gerada automaticamente.' : ''));
      
      // Refresh document
      const refresh = await fetch(`/api/documents/${document.id}`);
      if (refresh.ok) {
        const payload = await refresh.json();
        if (payload.document) {
          setDocument(payload.document);
        } else {
          router.reload();
        }
      } else {
        router.reload();
      }
    } catch (error) {
      console.error('Error cancelling document:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao anular documento');
    } finally {
      setCancelling(false);
    }
  };

  const handleSync = async () => {
    if (!document) return;
    
    setSyncing(true);
    try {
      const response = await fetch('/api/agt/sync-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha na sincronização');
      }

      toast.success('Documento sincronizado com sucesso com a AGT.');
      
      // Refresh
      const refresh = await fetch(`/api/documents/${document.id}`);
      if (refresh.ok) {
        const payload = await refresh.json();
        if (payload.document) {
          setDocument(payload.document);
        } else {
          router.reload();
        }
      } else {
        router.reload();
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };
  
  useEffect(() => {
    if (id) {
      const fetchDocument = async () => {
        try {
          const documentId = Array.isArray(id) ? id[0] : id;
          
          // Try to fetch from API first
          const response = await fetch(`/api/documents/${documentId}`);
          if (response.ok) {
            const data = await response.json();
            const d = data.document || {};
            const normalizedTotals = d.totals && (typeof d.totals.subtotal !== 'undefined' || typeof d.totals.vatTotal !== 'undefined' || typeof d.totals.total !== 'undefined')
              ? {
                  netTotal: Number(d.totals.subtotal) || 0,
                  taxTotal: Number(d.totals.vatTotal) || 0,
                  grandTotal: Number(d.totals.total) || 0,
                }
              : d.totals;
            const normalizedLines = (d.lines || []).map((ln: any) => ({
              sku: ln.sku,
              description: ln.description,
              quantity: Number(ln.quantity) || 0,
              unitPrice: Number(ln.unitPrice) || 0,
              vatRate: Number(ln.vatRate) || 0,
              discount: Number(ln.discount) || 0,
              total: typeof ln.total === 'number' ? ln.total : ((Number(ln.quantity) || 0) * (Number(ln.unitPrice) || 0)) * (1 + (Number(ln.vatRate) || 0) / 100),
            }));
            setDocument({
              ...d,
              totals: normalizedTotals,
              lines: normalizedLines,
            });
            // Check if PDF is cached
            checkPdfCacheStatus(documentId);
          } else if (response.status === 404) {
            // Documento não encontrado
            setDocument(null);
          } else {
            console.error('Failed to fetch document');
            // Sem fallback: manter vazio
            setDocument(null);
          }
        } catch (error) {
          console.error('Error fetching document:', error);
          // Sem fallback: manter vazio
          setDocument(null);
        } finally {
          setLoading(false);
        }
      };

      fetchDocument();
    }
  }, [id]);

  useEffect(() => {
    const status = String(document?.agtSubmission?.status || '').toLowerCase();
    if (!document?.id) return;
    
    // Polling logic for statuses that can change in the background
    if (status !== 'pending' && status !== 'blocked' && status !== 'offline_pending') return;

    let stopped = false;
    const interval = setInterval(async () => {
      // For offline_pending, we don't necessarily want to call sync-document every 10s 
      // if the background worker is already doing it, but we definitely want to REFRESH the UI.
      // If it's pending/blocked, we might want to poke the sync API.
      if (status === 'pending' || status === 'blocked') {
        try {
          await fetch('/api/agt/sync-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: document.id }),
          });
        } catch {}
      }

      if (stopped) return;
      refreshDocument();
    }, 10_000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [document?.id, document?.agtSubmission?.status]);

  // Global event listener for real-time updates from background worker
  useEffect(() => {
    const handleSyncComplete = (e: any) => {
      if (e.detail?.documentId === id) {
        console.log(`Document ${id} sync complete event received. Refreshing...`);
        refreshDocument();
      }
    };
    window.addEventListener('agt-sync-complete', handleSyncComplete);
    return () => window.removeEventListener('agt-sync-complete', handleSyncComplete);
  }, [id]);

  const refreshDocument = async () => {
    if (!id) return;
    try {
      const refresh = await fetch(`/api/documents/${id}`);
      if (refresh.ok) {
        const payload = await refresh.json();
        if (payload.document) {
          const d = payload.document || {};
          const normalizedTotals = d.totals && (typeof d.totals.subtotal !== 'undefined' || typeof d.totals.vatTotal !== 'undefined' || typeof d.totals.total !== 'undefined')
            ? {
                netTotal: Number(d.totals.subtotal) || 0,
                taxTotal: Number(d.totals.vatTotal) || 0,
                grandTotal: Number(d.totals.total) || 0,
              }
            : d.totals;
          const normalizedLines = (d.lines || []).map((ln: any) => ({
            sku: ln.sku,
            description: ln.description,
            quantity: Number(ln.quantity) || 0,
            unitPrice: Number(ln.unitPrice) || 0,
            vatRate: Number(ln.vatRate) || 0,
            discount: Number(ln.discount) || 0,
            total: typeof ln.total === 'number' ? ln.total : ((Number(ln.quantity) || 0) * (Number(ln.unitPrice) || 0)) * (1 + (Number(ln.vatRate) || 0) / 100),
          }));
          setDocument({
            ...d,
            totals: normalizedTotals,
            lines: normalizedLines,
          });
        }
      }
    } catch (err) {
      console.error('Error refreshing document:', err);
    }
  };

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const resp = await fetch('/api/settings/company');
        if (resp.ok) {
          const data = await resp.json();
          setCompany(data);
        } else {
          setCompany(null);
        }
      } catch {
        setCompany(null);
      } finally {
        setCompanyLoading(false);
      }
    };
    fetchCompany();
  }, []);

  const checkPdfCacheStatus = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/status`);
      if (response.ok) {
        const data = await response.json();
        setPdfCached(data.cached);
      }
    } catch (error) {
      console.error('Erro ao verificar status do PDF:', error);
    }
  };

  const getAgtStatusClass = (status?: string): string => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'offline_pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getAgtStatusLabel = (status?: string): string => {
    switch (status) {
      case 'success': return t('agt.status.success', language) || 'Sucesso';
      case 'error': return t('agt.status.error', language) || 'Erro';
      case 'offline_pending': return t('agt.status.offline', language) || 'Offline';
      case 'pending': return t('agt.status.pending', language) || 'Pendente';
      default: return '-';
    }
  };

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

  // Display status derived from cancellation/payment for invoices
  const getDisplayStatusClass = (doc: Document): string => {
    if (doc.status === 'cancelled') return 'bg-danger/20 text-danger';
    if (doc.payment?.status === 'paid') return 'bg-success/20 text-success';
    if (doc.payment?.status === 'partial') return 'bg-warning/20 text-warning';
    // Proformas, Orçamentos e Notas de Crédito não têm estado de dívida; se emitidos, tratamos como informativo
    if ((doc.documentType === 'proforma' || doc.documentType === 'orçamento' || doc.documentType === 'nota_de_credito') && doc.status === 'issued') return 'bg-info/20 text-info';
    // Orçamentos em rascunho: estilo neutro
    if (doc.documentType === 'orçamento' && doc.status === 'draft') return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100';
    return 'bg-danger/20 text-danger';
  };

  const getDisplayStatusLabelKey = (doc: Document): string => {
    if (doc.status === 'cancelled') return 'status.cancelled';
    if (doc.payment?.status === 'paid') return 'status.paid';
    if (doc.payment?.status === 'partial') return 'payment.status.partial';
    if ((doc.documentType === 'proforma' || doc.documentType === 'orçamento' || doc.documentType === 'nota_de_credito') && doc.status === 'issued') return 'status.issued';
    if (doc.documentType === 'orçamento' && doc.status === 'draft') return 'status.draft';
    return 'status.unpaid';
  };
  
  const getStatusLabel = (status: string): string => {
    switch(status) {
      case 'accepted': return 'Aceite';
      case 'submitted': return 'Submetido';
      case 'draft': return 'Rascunho';
      case 'rejected': return 'Rejeitado';
      case 'issued': return 'Emitida';
      case 'paid': return 'Pago';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };
  
  const getDocumentTypeLabel = (type: string): string => {
    switch(type) {
      case 'factura': return 'Fatura';
      case 'orçamento': return 'Orçamento';
      case 'nota_de_credito': return 'Nota de Crédito';
      case 'recibo': return 'Recibo';
      case 'nota_de_entrega': return 'Nota de Entrega';
      case 'nota_de_debito': return 'Nota de Débito';
      case 'factura_recibo': return 'Factura-Recibo';
      case 'proforma': return 'Proforma';
      default: return type;
    }
  };
  
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-AO', {
      style: 'currency',
      currency: 'AOA'
    }).format(value);
  };

  const formatIban = (iban?: string): string => {
    if (!iban) return '—';
    return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
  };

  // Carregar recibos relacionados (histórico de pagamentos)
  useEffect(() => {
    const loadReceipts = async () => {
      try {
        if (!document || !Array.isArray(document.relatedDocuments) || document.relatedDocuments.length === 0) {
          setReceipts([]);
          return;
        }
        const results: Array<{ id: string; issueDate?: string; method?: string; amount?: number; series?: string; sequentialNumber?: number | string }> = [];
        for (const rid of document.relatedDocuments) {
          try {
            const resp = await fetch(`/api/documents/${rid}`);
            if (!resp.ok) continue;
            const data = await resp.json();
            const d = data.document;
            if (d && d.documentType === 'recibo') {
              results.push({
                id: d.id,
                issueDate: d.issueDate,
                method: d.payment?.method,
                amount: Number(d.payment?.paidAmount || d.totals?.total || 0),
                series: d.series,
                sequentialNumber: d.sequentialNumber,
              });
            }
          } catch {}
        }
        setReceipts(results);
      } catch (e) {
        console.error('Erro ao carregar recibos relacionados:', e);
        setReceipts([]);
      }
    };
    loadReceipts();
  }, [document]);

  const handleGeneratePdf = async () => {
    setPdfLoading(true);
    
    try {
      if (!document) return;
      
      // Generate PDF URL (without forcing regeneration unless explicitly needed)
    // This allows caching to work and prevents "Via" counter from incrementing on every view
    const pdfUrl = `/api/documents/${document.id}/pdf`;      
      // Open the PDF in a new tab for viewing
      window.open(pdfUrl, '_blank');
      
      // Update cache status after generation
      const documentId = Array.isArray(id) ? id[0] : id;
      if (documentId) {
        await checkPdfCacheStatus(documentId);
      }
      
      console.log('PDF com certificação AGT gerado para o documento:', document.id);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Ocorreu um erro ao gerar o PDF. Por favor tente novamente.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleViewPdf = async () => {
    setPdfCacheLoading(true);
    
    try {
      if (!document) return;
      
      // Try to view cached PDF first
      const viewUrl = `/api/documents/${document.id}/view`;
      
      // Open the cached PDF in a new tab
      window.open(viewUrl, '_blank');
      
      console.log('PDF em cache visualizado para o documento:', document.id);
    } catch (error) {
      console.error('Erro ao visualizar PDF:', error);
      toast.error('Ocorreu um erro ao visualizar o PDF. Por favor tente novamente.');
    } finally {
      setPdfCacheLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    try {
      if (!document) return;
      const seq = document.sequentialNumber;
      const label = typeof seq === 'number'
        ? String(seq).padStart(4, '0')
        : (seq || 'esta fatura');
      const proceed = await confirm(t('prompts.confirmPaymentLabel', language, { label }));
      if (!proceed) return;

      // Use document method or default from Settings
      // Calcular restante em dívida
      const remaining = Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0);

      // Método de pagamento: manter o atual ou usar predefinição das definições
      let defaultMethod: 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other' = 'other';
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.method) defaultMethod = parsed.method;
        }
      } catch {}
      const method = (document.payment?.method as any) || defaultMethod;

      // Solicitar valor pago (pré-preenchido com valor restante)
      const paidStr = await prompt(t('prompts.enterPaidAmount', language), String(remaining));
      if (paidStr == null) return; // cancelado
      const paidAmount = Number(paidStr);
      if (!isFinite(paidAmount) || paidAmount <= 0) {
        toast.warning(t('messages.invalidAmount', language) || 'Valor inválido.');
        return;
      }

      const response = await fetch(`/api/documents/${document.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, paidAmount }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error || t('messages.paymentConfirmFailed', language));
      }
      const result = await response.json();
      setDocument(result.document);
      
      if (result.receipt && result.receipt.id) {
        router.push(`/documents/${result.receipt.id}`);
      } else {
        toast.success(t('messages.paymentConfirmed', language));
      }
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      toast.error(error instanceof Error ? error.message : t('messages.paymentConfirmFailed', language));
    }
  };

  const handleSettlePayment = async () => {
    try {
      if (!document) return;
      const total = Number(document?.totals?.grandTotal || 0);
      const paidSoFar = Number(document?.payment?.paidAmount || 0);
      const remaining = Math.max(total - paidSoFar, 0);
      if (remaining <= 0) return;

      let defaultMethod: 'cash' | 'bank_transfer' | 'card' | 'mobile_money' | 'other' = 'other';
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem('paymentDefaults') : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.method) defaultMethod = parsed.method;
        }
      } catch {}
      const method = (document.payment?.method as any) || defaultMethod;

      const response = await fetch(`/api/documents/${document.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, paidAmount: remaining, paidDate: new Date().toISOString().split('T')[0] }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.error || t('messages.paymentConfirmFailed', language));
      }
      const result = await response.json();
      if (result.receipt && result.receipt.id) {
        // Navegar para a página do documento do Recibo recém-criado
        router.push(`/documents/${result.receipt.id}`);
        // window.open(`/api/documents/${result.receipt.id}/pdf`, '_blank');
        // alert(t('messages.receiptCreated', language));
      } else {
        toast.success(t('messages.paymentConfirmed', language));
      }
    } catch (error) {
      console.error('Erro ao finalizar pagamento:', error);
      toast.error(error instanceof Error ? error.message : t('messages.paymentConfirmFailed', language));
    }
  };

  const handleGeneratePosInvoice = async () => {
    try {
      if (!document) return;
      // Se já for FR ou Recibo, abre o PDF POS diretamente
      if (document.documentType === 'factura_recibo' || document.documentType === 'recibo') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Carregar documento completo (linhas)
      let fullDoc: any = document;
      try {
        const res = await fetch(`/api/documents/${document.id}`);
        if (res.ok) {
          const payload = await res.json();
          if (payload?.document) fullDoc = payload.document;
        }
      } catch {}

      const sourceLines = Array.isArray(fullDoc?.lines) ? fullDoc.lines : [];
      if (!sourceLines.length) {
        toast.warning('Documento sem linhas. Não é possível emitir POS.');
        return;
      }

      // Notas de entrega: permite POS sem validar total
      if (document.documentType === 'nota_de_entrega') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Nota de Crédito: permite POS sem validar total
      if (document.documentType === 'nota_de_credito') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Nota de Débito: permite POS sem validar total
      if (document.documentType === 'nota_de_debito') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Se Proforma/Orçamento: gerar POS direto do próprio documento (sem validar total)
      if (document.documentType === 'proforma' || document.documentType === 'orçamento') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Total base
      const baseTotal = Number(fullDoc?.totals?.grandTotal || fullDoc?.totals?.total || 0);
      if (!baseTotal || baseTotal <= 0) {
        toast.warning('Total inválido para emissão POS.');
        return;
      }

      // Se for Factura: emitir POS diretamente do próprio documento, sem prompts nem criação de recibo
      if (document.documentType === 'factura') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      // Se Proforma/Orçamento: gerar POS direto do próprio documento
      if (document.documentType === 'proforma' || document.documentType === 'orçamento') {
        window.open(`/api/documents/${document.id}/pos-pdf?force=1`, '_blank');
        return;
      }

      toast.info('Emissão POS suportada para Factura, Nota de Débito, Proforma, Orçamento e Recibo.');
    } catch (error) {
      console.error('Erro ao gerar Factura POS (FR):', error);
      toast.error(error instanceof Error ? error.message : 'Ocorreu um erro ao gerar a FR.');
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <p className="text-gray-500">Carregando documento...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Documento não encontrado</h2>
          <p className="text-gray-600 mb-4">O documento solicitado não existe ou foi removido.</p>
          <Link href="/documents">
            <Button variant="primary">
              Voltar para Documentos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{document.sequentialNumber} | Prakash</title>
      </Head>
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => router.push('/documents')}
                className="inline-flex items-center text-primary hover:text-primary/80 focus:outline-none mr-3"
                aria-label="Voltar"
              >
                <span className="text-2xl leading-none">←</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-800">{getDocumentTypeLabel(document.documentType)} {document.sequentialNumber}</h1>
            </div>
            <div className="flex items-center mt-1">
              <span className={`px-2 py-1 text-xs rounded-full ${getDisplayStatusClass(document)} mr-2`}>
                {t(getDisplayStatusLabelKey(document), language)}
              </span>
              <span className="text-gray-600">Emitido em {document.issueDate}</span>
            </div>
          </div>
          
          <div className="mt-4 md:mt-0 flex space-x-3">
            {document.status === 'draft' && document.documentType !== 'proforma' && document.documentType !== 'orçamento' && (
              <Link href={`/documents/${document.id}/edit`}>
                <Button variant="secondary">
                  Editar
                </Button>
              </Link>
            )}
            {pdfCached && (
              <Button 
                variant="secondary" 
                onClick={handleViewPdf}
                disabled={pdfCacheLoading}
              >
                {pdfCacheLoading ? 'Carregando...' : 'Ver PDF'}
              </Button>
            )}
            <Button 
              variant="primary" 
              onClick={handleGeneratePdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? 'Gerando...' : pdfCached ? 'Regenerar PDF' : 'Gerar PDF'}
            </Button>
            {document.status !== 'cancelled' && (
              document.documentType === 'factura' ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleGeneratePosInvoice}
                  >
                    Gerar POS
                  </Button>
                  {document.agtSubmission?.status !== 'success' && (
                     <Button
                       variant="primary"
                       onClick={handleSync}
                       disabled={syncing}
                       className="bg-blue-600 hover:bg-blue-700"
                     >
                       {syncing ? 'A sincronizar...' : 'Sincronizar AGT'}
                     </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {cancelling ? 'A anular...' : 'Anular'}
                  </Button>
                </>
              ) : (
                (document.documentType === 'factura_recibo' ||
                 document.documentType === 'recibo' ||
                 document.documentType === 'proforma' ||
                 document.documentType === 'orçamento' ||
                 document.documentType === 'nota_de_entrega' ||
                 document.documentType === 'nota_de_credito' ||
                 document.documentType === 'nota_de_debito') && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={handleGeneratePosInvoice}
                    >
                      Gerar POS
                    </Button>
                    {document.agtSubmission?.status !== 'success' && 
                     document.documentType !== 'proforma' && 
                     document.documentType !== 'orçamento' && (
                       <Button
                         variant="primary"
                         onClick={handleSync}
                         disabled={syncing}
                         className="bg-blue-600 hover:bg-blue-700"
                       >
                         {syncing ? 'A sincronizar...' : 'Sincronizar AGT'}
                       </Button>
                    )}
                    {document.documentType !== 'nota_de_credito' && 
                     document.documentType !== 'proforma' && 
                     document.documentType !== 'orçamento' && 
                     document.documentType !== 'nota_de_entrega' && (
                      <Button
                        variant="danger"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {cancelling ? 'A anular...' : 'Anular'}
                      </Button>
                    )}
                  </>
                )
              )
            )}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-b">
            <div>
              <h2 className="text-lg font-medium text-gray-800 mb-3">Informações do Documento</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Número:</span>
                  <span className="font-medium">{document.sequentialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tipo:</span>
                  <span>{getDocumentTypeLabel(document.documentType)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data de Emissão:</span>
                  <span>{document.issueDate}</span>
                </div>
                
                {/* AGT Status Section */}
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-600 font-medium">Estado AGT:</span>
                    <span 
                      className={`px-2 py-1 text-xs rounded-full ${getAgtStatusClass(document.agtSubmission?.status)} cursor-help`}
                      title={document.agtSubmission?.message || document.agtSubmission?.status}
                    >
                      {getAgtStatusLabel(document.agtSubmission?.status)}
                    </span>
                  </div>
                  
                  {document.agtSubmission?.submissionDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Submetido em:</span>
                      <span>{new Date(document.agtSubmission.submissionDate).toLocaleString()}</span>
                    </div>
                  )}
                  
                  {document.agtSubmission?.agtId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">ID AGT:</span>
                      <span className="font-mono text-xs">{document.agtSubmission.agtId}</span>
                    </div>
                  )}
                  
                  {document.agtSubmission?.status === 'error' && document.agtSubmission.message && (
                    <div className="mt-2 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-100 break-words">
                      <strong>Erro:</strong> {document.agtSubmission.message}
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data de Vencimento:</span>
                  <span>{document.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Estado:</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getDisplayStatusClass(document)}`}>
                    {t(getDisplayStatusLabelKey(document), language)}
                  </span>
                </div>
                {document.status === 'cancelled' && (
                  <div className="mt-3 border border-red-200 bg-red-50 rounded p-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-red-700">Razão do Cancelamento:</span>
                      <span className="text-red-800 font-medium">{document.cancellation?.reason || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-700">Cancelado em:</span>
                      <span className="text-red-800 font-medium">{document.cancellation?.cancelledAt ? new Date(document.cancellation.cancelledAt).toLocaleString() : '—'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h2 className="text-lg font-medium text-gray-800 mb-3">Informações do Cliente</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Nome:</span>
                  <span className="font-medium">{document.buyer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">NIF:</span>
                  <span>{document.buyer.nif}</span>
                </div>
              </div>
              <div className="mt-6">
                <h2 className="text-lg font-medium text-gray-800 mb-3">Informações de Pagamento</h2>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Estado do Pagamento:</span>
                    <span className="font-medium">{document.payment?.status || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Método:</span>
                    <span>{document.payment?.method || '—'}</span>
                  </div>
                  {Array.isArray(company?.bankAccounts) && company!.bankAccounts!.length > 0 ? (
                    <div className="space-y-1">
                      {company!.bankAccounts!.map((acc, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600">Coordenadas Bancárias:</span>
                          <span>
                            {(acc.bankName || '—')} • {(acc.accountNumber || '—')} • {(acc.iban ? formatIban(acc.iban) : '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Banco:</span>
                        <span>—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Conta:</span>
                        <span>—</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">IBAN:</span>
                        <span>—</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data de Vencimento:</span>
                    <span>{document.payment?.dueDate || document.dueDate || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pago em:</span>
                    <span>{document.payment?.paidDate || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valor Pago:</span>
                    <span>{document.payment?.paidAmount != null ? formatCurrency(document.payment.paidAmount) : '—'}</span>
                  </div>
                  {Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0) > 0 && (document.documentType !== 'proforma' && document.documentType !== 'orçamento') && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('documents.outstanding', language)}:</span>
                      <span className={Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0) > 0 ? 'text-amber-600 font-medium' : 'font-medium'}>
                        {formatCurrency(Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Itens do Documento</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantidade
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preço Unit.
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IVA (%)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {document.lines && document.lines.map((item) => (
                    <tr key={item.sku || item.description}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {item.vatRate}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {(!document.lines || document.lines.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum item encontrado neste documento.
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end">
              <div className="w-full md:w-1/3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>{formatCurrency(document.totals.netTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">IVA:</span>
                  <span>{formatCurrency(document.totals.taxTotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>{formatCurrency(document.totals.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Histórico de Pagamentos</h2>
            {receipts && receipts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recibo</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.issueDate || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{r.method || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(Number(r.amount || 0))}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <Link href={`/documents/${r.id}`} className="text-blue-600 hover:underline">
                            {`${r.series || 'RC'}-${String(r.sequentialNumber || '').toString().padStart(4, '0')}`}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <Button variant="secondary" size="sm" onClick={() => window.open(`/api/documents/${r.id}/pdf`, '_blank')}>
                            Ver PDF
                          </Button>
                          <Button variant="secondary" size="sm" className="ml-2" onClick={() => window.open(`/api/documents/${r.id}/pos-pdf?force=1`, '_blank')}>
                            Gerar POS
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Nenhum pagamento registado.
              </div>
            )}
          </div>
          
          <div className="bg-gray-50 px-6 py-4 border-t">
            <div className="flex justify-between items-center">
              <Link href="/documents" className="text-primary hover:text-primary/80">
                ← Voltar para Documentos
              </Link>
              <div className="flex space-x-3">
                {((['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_adiantamento', 'factura_recibo_autofacturacao'].includes(document.documentType)) && (document.status === 'issued' || document.status === 'draft') && (document.payment?.status !== 'paid')) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleConfirmPayment}
                  >
                    Pagamento parcial
                  </Button>
                )}
                {((['factura', 'nota_de_debito', 'factura_global', 'factura_generica', 'factura_adiantamento', 'factura_recibo_autofacturacao'].includes(document.documentType)) && (document.status === 'issued' || document.status === 'draft') && (document.payment?.status !== 'paid') && Math.max((document?.totals?.grandTotal || 0) - (document?.payment?.paidAmount || 0), 0) > 0) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSettlePayment}
                  >
                    Recibo
                  </Button>
                )}
                {/* Removido: botão 'Ver PDF' no fim da página */}
                {document.documentType === 'nota_de_entrega' && (
                  <span className="text-gray-600 text-xs md:text-sm" title="Regra de negócio">
                    Este documento não pode ser anulado
                  </span>
                )}
              </div>
             </div>
             {mixedOpen && (
               <div className="mt-4 border-t pt-4">
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Valor em Dinheiro (AOA)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border rounded px-3 py-2"
                      value={Number(cashAmount || 0)}
                      onChange={(e) => handleCashAmountChange(Number(e.target.value))}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Valor Outro Método (AOA)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border rounded px-3 py-2"
                      value={Number(otherAmount || 0)}
                      onChange={(e) => handleOtherAmountChange(Number(e.target.value))}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Outro Método</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={otherMethod}
                      onChange={(e) => setOtherMethod(e.target.value as any)}
                    >
                      <option value="bank_transfer">Transferência Bancária</option>
                      <option value="card">Cartão (Multicaixa)</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-3">
                    <label className="inline-flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={autoBalance}
                        onChange={(e) => setAutoBalance(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">Ajustar automaticamente</span>
                    </label>
                  </div>
                </div>
                {!(document.documentType === 'factura' && Array.isArray(document.relatedDocuments) && (document.relatedDocuments?.length || 0) > 0) && (
                  <div className="mt-3 text-sm text-gray-600">
                    Em falta: {Math.max(((document?.totals?.grandTotal ?? ((document?.totals as any)?.total || 0))) - (document?.payment?.paidAmount || 0), 0).toFixed(2)} AOA
                  </div>
                )}
                {clampHint && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-700 bg-gray-50 border border-amber-300 rounded px-3 py-2 transition-opacity">
                    <span className="inline-block w-4 h-4 text-amber-600">ℹ️</span>
                    <span>{clampHint}</span>
                  </div>
                )}
                <div className="mt-4 flex space-x-3">
                  <Button variant="primary" size="sm" onClick={handleConfirmMixedPayment}>Confirmar Pagamento</Button>
-                  <Button variant="secondary" size="sm" onClick={() => setMixedOpen(false)}>Cancelar</Button>
+                  <Button variant="secondary" size="sm" onClick={() => setMixedOpen(false)}>Anular</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
