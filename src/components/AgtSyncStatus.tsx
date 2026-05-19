import React, { useState, useEffect } from 'react';
import { useAgtSync } from '@/hooks/useAgtSync';
import { useAppSettings } from '@/context/AppSettingsContext';

export function AgtSyncStatus() {
  const {
    queue,
    isSyncing,
    progress,
    syncStatus,
    error,
    isOnline,
    currentDocId,
    syncAll
  } = useAgtSync();
  const { language } = useAppSettings();
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasSession(!!localStorage.getItem('user_session'));
    }
  }, []);

  if (!hasSession) return null;
  if (queue.length === 0 && syncStatus !== 'complete' && syncStatus !== 'error') return null;
  if (queue.length === 0 && syncStatus === 'complete') return null;

  // Exclude Proforma (PP) and Orçamento (OR)
  const visibleQueue = queue.filter(d => {
    const type = (d.documentType || '').toLowerCase();
    return type !== 'proforma' && type !== 'pp' && type !== 'orçamento' && type !== 'or';
  });

  if (visibleQueue.length === 0 && !isSyncing && syncStatus !== 'error') return null;

  const statusColor = isSyncing
    ? 'bg-blue-600'
    : syncStatus === 'error'
    ? 'bg-red-600'
    : 'bg-amber-500';

  const statusLabel = isSyncing
    ? 'A sincronizar...'
    : syncStatus === 'error'
    ? 'Erro de sincronização'
    : `${visibleQueue.length} doc${visibleQueue.length !== 1 ? 's' : ''} pendente${visibleQueue.length !== 1 ? 's' : ''}`;

  return (
    <div className="fixed bottom-0 right-0 z-50 w-72 border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 shadow-sm">
      {/* Header bar — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span className="relative flex h-2 w-2">
            {isSyncing && (
              <span className="animate-ping absolute inline-flex h-full w-full bg-blue-500 opacity-75" />
            )}
            <span className={`relative inline-flex h-2 w-2 ${statusColor}`} />
          </span>
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-wide">
            AGT
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable body */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-3 space-y-3">

          {/* Error message */}
          {error && (
            <div className="text-xs text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-2">
              <div className="font-medium mb-1">Falha: {error}</div>
              <button
                onClick={syncAll}
                className="text-[10px] font-semibold uppercase text-red-700 dark:text-red-400 hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Progress bar while syncing */}
          {isSyncing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-mono truncate">{currentDocId ? `Doc ${currentDocId.substring(0, 12)}…` : 'A processar…'}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-1.5 transition-all duration-150 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Queue info + action */}
          {!isSyncing && visibleQueue.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isOnline ? 'Aguarda transmissão' : 'Sem ligação à rede'}
              </span>
              <button
                onClick={syncAll}
                className="text-[10px] font-semibold uppercase tracking-wider border border-gray-800 dark:border-gray-200 px-3 py-1 text-gray-800 dark:text-gray-200 hover:bg-gray-800 hover:text-white dark:hover:bg-gray-200 dark:hover:text-gray-900 transition-colors"
              >
                Enviar tudo
              </button>
            </div>
          )}

          {/* Online indicator */}
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-100 dark:border-gray-700">
            <span className={`h-1.5 w-1.5 inline-block ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {isOnline ? 'Online — AGT conectado' : 'Offline — aguarda rede'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
