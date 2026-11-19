import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((type, message) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
  }, [dismiss]);

  const toast = useRef(null);
  if (!toast.current) toast.current = {};
  toast.current.success = (m) => push('success', m);
  toast.current.error = (m) => push('error', typeof m === 'string' ? m : (m && m.message) || 'Something went wrong');
  toast.current.info = (m) => push('info', m);

  return (
    <ToastCtx.Provider value={toast.current}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="toast-icon">{t.type === 'success' ? '✓' : t.type === 'error' ? '!' : 'i'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
