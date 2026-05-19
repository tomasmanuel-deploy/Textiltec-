import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (options: PromptOptions | string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(DialogContext);
  if (!ctx) return async (_opts: ConfirmOptions | string) => window.confirm(typeof _opts === 'string' ? _opts : _opts.message);
  return ctx.confirm;
}

export function usePrompt() {
  const ctx = useContext(DialogContext);
  if (!ctx) return async (_opts: PromptOptions | string) => window.prompt(typeof _opts === 'string' ? _opts : _opts.message);
  return ctx.prompt;
}

type DialogState =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { type: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [promptValue, setPromptValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise(resolve => {
      setDialog({ type: 'confirm', options: opts, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions | string): Promise<string | null> => {
    const opts = typeof options === 'string' ? { message: options } : options;
    setPromptValue(opts.defaultValue || '');
    return new Promise(resolve => {
      setDialog({ type: 'prompt', options: opts, resolve });
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }, []);

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.type === 'confirm') {
      dialog.resolve(true);
    } else {
      dialog.resolve(promptValue);
    }
    setDialog(null);
    setPromptValue('');
  };

  const handleCancel = () => {
    if (!dialog) return;
    if (dialog.type === 'confirm') {
      dialog.resolve(false);
    } else {
      dialog.resolve(null);
    }
    setDialog(null);
    setPromptValue('');
  };

  const getVariantColor = (variant?: string) => {
    switch (variant) {
      case 'danger': return 'bg-red-600 hover:bg-red-700';
      case 'warning': return 'bg-amber-600 hover:bg-amber-700';
      default: return 'bg-gray-900 hover:bg-gray-800';
    }
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}

      {/* Modal overlay */}
      {dialog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCancel}
          />

          {/* Dialog box */}
          <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 rounded-md shadow-lg overflow-hidden animate-dialogIn">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-2">
                {(dialog.type === 'confirm' ? dialog.options.title : dialog.options.title) || (dialog.type === 'prompt' ? 'Atenção' : 'Confirmação')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {dialog.options.message}
              </p>
            </div>

            {/* Prompt input */}
            {dialog.type === 'prompt' && (
              <div className="px-6 pb-4">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
                  value={promptValue}
                  placeholder={dialog.options.placeholder || ''}
                  onChange={e => setPromptValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                />
              </div>
            )}

            {/* Actions */}
            <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none"
              >
                {(dialog.type === 'confirm' ? dialog.options.cancelText : dialog.options.cancelText) || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors focus:outline-none ${
                  dialog.type === 'confirm'
                    ? getVariantColor(dialog.options.variant)
                    : 'bg-gray-900 hover:bg-gray-800'
                }`}
              >
                {(dialog.type === 'confirm' ? dialog.options.confirmText : dialog.options.confirmText) || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.95) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-dialogIn {
          animation: dialogIn 0.15s ease-out;
        }
      `}</style>
    </DialogContext.Provider>
  );
}
