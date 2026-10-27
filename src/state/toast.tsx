import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '../components/Marks';

export interface Toast {
  message: string;
  tone?: 'default' | 'error';
  action?: { label: string; run: () => void };
  /** Work in progress: shows a spinner and stays until the next message replaces it. */
  busy?: boolean;
}

const ToastContext = createContext<(toast: Toast) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null);
  const nextId = useRef(0);

  const notify = useCallback((next: Toast) => setToast({ ...next, id: ++nextId.current }), []);

  useEffect(() => {
    if (!toast || toast.busy) return;
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast toast--${toast.tone ?? 'default'}${toast.busy ? ' toast--busy' : ''}`}>
            {toast.busy && <Spinner />}
            <span className="toast__message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
