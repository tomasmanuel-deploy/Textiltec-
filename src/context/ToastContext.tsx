import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback so pages outside provider don't crash
    return {
      toast: (msg) => console.warn('[Toast fallback]', msg),
      success: (msg) => console.warn('[Toast fallback]', msg),
      error: (msg) => console.warn('[Toast fallback]', msg),
      info: (msg) => console.warn('[Toast fallback]', msg),
      warning: (msg) => console.warn('[Toast fallback]', msg),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${++counterRef.current}-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur ?? 6000),
    info: (msg, dur) => addToast(msg, 'info', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur ?? 5000),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-md shadow-md border text-sm transition-all duration-300 animate-toastIn ${getToastStyle(t.type)}`}
              role="alert"
            >
              <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-opacity-10 dark:bg-opacity-20 ${getToastIconContainerStyle(t.type)}`}>
                {getToastIcon(t.type)}
              </div>
              <span className="flex-1 font-medium text-gray-800 dark:text-gray-100">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors focus:outline-none"
                aria-label="Fechar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes toastIn {
          0% { opacity: 0; transform: translateX(100%) scale(0.9); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .animate-toastIn {
          animation: toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
}

function getToastStyle(type: ToastType): string {
  const base = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700";
  switch (type) {
    case 'success': return `${base} border-l-4 !border-l-emerald-500`;
    case 'error':   return `${base} border-l-4 !border-l-red-500`;
    case 'warning': return `${base} border-l-4 !border-l-amber-500`;
    case 'info':
    default:        return `${base} border-l-4 !border-l-blue-500`;
  }
}

function getToastIconContainerStyle(type: ToastType): string {
  switch (type) {
    case 'success': return 'bg-emerald-500 text-emerald-600 dark:text-emerald-400';
    case 'error':   return 'bg-red-500 text-red-600 dark:text-red-400';
    case 'warning': return 'bg-amber-500 text-amber-600 dark:text-amber-400';
    case 'info':
    default:        return 'bg-blue-500 text-blue-600 dark:text-blue-400';
  }
}

function getToastIcon(type: ToastType): React.ReactNode {
  switch (type) {
    case 'success': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
    case 'error':   return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'warning': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    case 'info':
    default:        return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  }
}
