import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', options = {}) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, ...options }]);

    // Auto-remove after duration (default 5s, or never if actions exist)
    const duration =
      options.duration !== undefined
        ? options.duration
        : options.actions
          ? null
          : 5000;
    if (duration) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const confirm = useCallback((message, title) => {
    return new Promise(resolve => {
      const id = Date.now();
      setToasts(prev => [
        ...prev,
        {
          id,
          message,
          title,
          type: 'confirm',
          actions: [
            {
              label: 'Cancel',
              variant: 'secondary',
              onClick: () => {
                setToasts(prev => prev.filter(t => t.id !== id));
                resolve(false);
              },
            },
            {
              label: 'OK',
              variant: 'primary',
              onClick: () => {
                setToasts(prev => prev.filter(t => t.id !== id));
                resolve(true);
              },
            },
          ],
        },
      ]);
    });
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, confirm }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function Toast({ toast, onRemove }) {
  const Icon =
    toast.type === 'success'
      ? CheckCircleIcon
      : toast.type === 'confirm'
        ? ExclamationTriangleIcon
        : XCircleIcon;

  const bgColor =
    toast.type === 'success'
      ? 'bg-green-500/10 border-green-500/30'
      : toast.type === 'confirm'
        ? 'bg-slate-800/90 border-slate-600'
        : 'bg-red-500/10 border-red-500/30';

  const iconColor =
    toast.type === 'success'
      ? 'text-green-400'
      : toast.type === 'confirm'
        ? 'text-amber-400'
        : 'text-red-400';

  // Confirm dialogs get a specific test ID
  const isConfirm = toast.type === 'confirm';

  return (
    <div
      className={`${bgColor} border rounded-lg p-4 shadow-lg backdrop-blur-sm pointer-events-auto animate-slide-up`}
      data-testid={isConfirm ? 'confirm-dialog' : undefined}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          {toast.title && (
            <p className="text-white font-medium text-sm mb-1">{toast.title}</p>
          )}
          <p className="text-gray-300 text-sm">{toast.message}</p>
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex gap-2 mt-3">
              {toast.actions.map(action => (
                <button
                  type="button"
                  key={action.label}
                  onClick={action.onClick}
                  data-testid={
                    isConfirm
                      ? `confirm-${action.label.toLowerCase()}`
                      : undefined
                  }
                  className={
                    action.variant === 'primary'
                      ? 'px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded transition-colors'
                      : 'px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors'
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!toast.actions && (
          <button
            type="button"
            onClick={() => onRemove(toast.id)}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
