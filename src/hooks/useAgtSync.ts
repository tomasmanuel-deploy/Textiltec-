import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface PendingDocument {
  id: string;
  documentType: string;
  series: string;
  sequentialNumber: number;
  date: string;
  total: number;
  status: string;
  error?: string;
}

export function useAgtSync() {
  const [queue, setQueue] = useState<PendingDocument[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'syncing' | 'error' | 'complete'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  
  const fetchingRef = useRef(false);
  const pollingStatusRef = useRef(false);
  const nextRetryAtRef = useRef<number>(0);

  // Initial check and periodic polling
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      setIsOnline(true);
      fetchQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Fetch immediately
    fetchQueue();

    const interval = setInterval(fetchQueue, 60000);
    const pollStatusInterval = setInterval(() => {
      pollPendingStatus();
    }, 180000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      clearInterval(pollStatusInterval);
    };
  }, []);

  const fetchQueue = async () => {
    if (!navigator.onLine) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setSyncStatus('checking');
      const res = await axios.get('/api/agt/pending', { timeout: 8000 });
      const pending = res.data.pending || [];
      // Only update queue if we are not currently syncing to avoid race conditions
      // or if the queue was empty
      setQueue(prev => {
        if (isSyncing) return prev; // Don't disturb current sync
        // Filter out items that are already in the queue to avoid UI flicker? 
        // Or just replace. Replacing is safer to get latest status.
        return pending;
      });
      setError(null);
      setSyncStatus(Array.isArray(pending) && pending.length > 0 ? 'idle' : 'complete');
    } catch (err) {
      console.error('Failed to fetch AGT queue:', err);
      setSyncStatus('idle');
    } finally {
      fetchingRef.current = false;
    }
  };

  const pollPendingStatus = async () => {
    if (!navigator.onLine) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (pollingStatusRef.current) return;
    if (queue.length === 0) return;
    pollingStatusRef.current = true;
    try {
      await axios.get('/api/agt/pending?poll=true', { timeout: 50000 });
      await fetchQueue();
    } catch {
    } finally {
      pollingStatusRef.current = false;
    }
  };

  const processNextItem = async () => {
    if (queue.length === 0) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (Date.now() < nextRetryAtRef.current) return;

    // Filter out skippable docs (Proforma/Orçamento) silently
    const doc = queue[0];
    const type = (doc.documentType || '').toLowerCase();
    if (type === 'proforma' || type === 'pp' || type === 'orçamento' || type === 'or') {
      setQueue(prev => prev.filter(d => d.id !== doc.id));
      return;
    }

    setIsSyncing(true);
    setSyncStatus('syncing');
    setCurrentDocId(doc.id);
    setProgress(0);
    setError(null);

    try {
      // Simulate rapid progress for small payloads if real progress is too fast
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 90) return 90;
          return p + 10;
        });
      }, 100);

      const resp = await axios.post('/api/agt/sync-document', { documentId: doc.id }, {
        timeout: 300000, // 5 minutes timeout for slow AGT portal
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
          // Use real progress if it's slower than simulated
          setProgress(p => Math.max(p, percent));
        }
      });

      clearInterval(interval);
      const isPending = resp?.status === 202 || resp?.data?.pending === true;
      if (isPending) {
        const msg = String(resp?.data?.message || '').toLowerCase();
        const delayMs = msg.includes('limite de requisi') ? 120_000 : 60_000;
        nextRetryAtRef.current = Date.now() + delayMs;
        setProgress(0);
        setSyncStatus('idle');
        setIsSyncing(false);
        setCurrentDocId(null);
        setQueue(prev => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
        return;
      }

      setProgress(100);

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('agt-sync-complete', { detail: { documentId: doc.id } }));
      }, 500);

      setQueue(prev => prev.filter(d => d.id !== doc.id));
      setLastSyncTime(new Date());
      nextRetryAtRef.current = 0;

      setTimeout(() => {
        setIsSyncing(false);
        setCurrentDocId(null);
        setProgress(0);
        const remaining = queue.filter(d => d.id !== doc.id);
        const validRemaining = remaining.filter(d => {
           const t = (d.documentType || '').toLowerCase();
           return t !== 'proforma' && t !== 'pp' && t !== 'orçamento' && t !== 'or';
        });

        if (validRemaining.length === 0) {
            setSyncStatus('complete');
        }
      }, 100);

    } catch (err: any) {
      console.error(`Sync failed for ${doc.id}:`, err);
      const errorMessage = err.response?.data?.error || err.message;
      const msg = String(errorMessage || '').toLowerCase();
      const isTimeout = msg.includes('timeout') || msg.includes('aborted') || msg.includes('network');
      const delayMs = isTimeout ? 90_000 : 45_000;
      nextRetryAtRef.current = Date.now() + delayMs;
      setError(errorMessage);
      setSyncStatus('idle');
      setIsSyncing(false);
      setQueue(prev => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));

      // Decide: remove from queue or keep?
      // If we keep it, we might get stuck in a loop.
      // But if we remove it, the user won't know it failed until next poll.
      // Let's keep it but pause syncing?
      // Or move it to end?
      // For now, let's stop auto-syncing until next manual trigger or poll.
    }
  };

  return {
    queue,
    isSyncing,
    currentDocId,
    progress,
    syncStatus,
    lastSyncTime,
    error,
    isOnline,
    refresh: fetchQueue,
    syncAll: () => {
      nextRetryAtRef.current = 0;
      processNextItem();
    }
  };
}
