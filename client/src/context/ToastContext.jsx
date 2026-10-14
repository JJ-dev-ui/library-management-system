import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { CircleAlert, CircleCheck } from 'lucide-react';

const ToastContext = createContext(null);

// useToast() -> { success(message, options), error(message, options) }. Call it after every create/update/delete.
// options.id: toasts with the same id REPLACE each other (e.g. saving the theme several times shows one toast).
export const useToast = () => useContext(ToastContext);

let nextId = 1;

// Global toast notifications: shown bottom-right (full width at the bottom on phones), hidden
// automatically after 4 seconds. Bottom-right never covers the page header buttons (Export, Add…).
// Each toast slides up and fades out (CSS in index.css). To let the exit animation play, a closing
// toast is first marked show: false, and only removed from the list when its animation has finished.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const hide = useCallback((id) => setToasts((list) => list.map((t) => (t.id === id ? { ...t, show: false } : t))), []);
  const remove = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  // options.action = { label, onClick }: a small button inside the toast (e.g. "Undo")
  const push = useCallback((tone, message, { id: key, action } = {}) => {
    const id = nextId++;
    setToasts((list) => {
      // The same message again, or the same id, replaces the older toast instead of stacking a copy
      const replaced = list.map((t) => (t.show && (t.message === message || (key && t.key === key)) ? { ...t, show: false } : t));
      const visible = replaced.filter((t) => t.show);
      // At most 4 on screen: older ones leave (with their animation)
      const tooMany = new Set(visible.slice(0, Math.max(0, visible.length - 3)).map((t) => t.id));
      return [...replaced.map((t) => (tooMany.has(t.id) ? { ...t, show: false } : t)), { id, key, tone, message, action, show: true }];
    });
  }, []);

  // useMemo keeps the same object between renders, so pages can safely put `toast` in useEffect deps
  const api = useMemo(() => ({
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, options),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live lets screen readers announce new toasts */}
      <ToastContainer position="bottom-end" className="toast-stack" containerPosition="fixed" aria-live="polite">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            className={`app-toast tone-${t.tone}`}
            show={t.show}
            autohide
            delay={4000}
            onClose={() => hide(t.id)}
            onExited={() => remove(t.id)} // removed only after the fade-out animation
          >
            <Toast.Body>
              {t.tone === 'error'
                ? <CircleAlert size={18} className="toast-icon" aria-hidden="true" />
                : <CircleCheck size={18} className="toast-icon" aria-hidden="true" />}
              <span className="flex-grow-1">{t.message}</span>
              {t.action && (
                <button type="button" className="btn btn-link btn-sm p-0 fw-semibold text-nowrap"
                  onClick={() => { t.action.onClick(); hide(t.id); }}>
                  {t.action.label}
                </button>
              )}
              <button type="button" className="btn-close ms-2" aria-label="Close" onClick={() => hide(t.id)} />
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}
