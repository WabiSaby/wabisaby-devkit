import React, { createContext, use, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

/* eslint-disable react-refresh/only-export-components -- useToast is a hook, not a component; exported from same module as ToastProvider for convenience */
export function useToast() {
    const context = use(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback(
        (message, type = 'info', duration = 5000) => {
            const id = Date.now().toString();
            setToasts((prev) => [...prev, { id, message, type }]);

            if (duration > 0) {
                setTimeout(() => {
                    removeToast(id);
                }, duration);
            }
        },
        [removeToast]
    );

    const success = (msg) => addToast(msg, 'success');
    const error = (msg) => addToast(msg, 'error');
    const info = (msg) => addToast(msg, 'info');

    const value = { addToast, removeToast, success, error, info };
    return (
        <ToastContext value={value}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <div key={toast.id} className={`toast toast--${toast.type}`}>
                        {toast.type === 'success' && <CheckCircle size={18} className="text-success" />}
                        {toast.type === 'error' && <AlertCircle size={18} className="text-danger" />}
                        {toast.type === 'info' && <Info size={18} className="text-primary" />}
                        <span>{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="btn btn--ghost btn--sm"
                            style={{ padding: 4, marginLeft: 'auto' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext>
    );
}
