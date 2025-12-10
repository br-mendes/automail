import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message, title }]);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border w-80 transform transition-all animate-in slide-in-from-right-10 duration-300 ${
              toast.type === 'success' ? 'bg-white border-green-100' :
              toast.type === 'error' ? 'bg-white border-red-100' :
              toast.type === 'warning' ? 'bg-white border-yellow-100' :
              'bg-white border-blue-100'
            }`}
          >
            {/* Icon */}
            <div className={`mt-0.5 rounded-full p-1 shrink-0 ${
               toast.type === 'success' ? 'bg-green-100 text-green-600' :
               toast.type === 'error' ? 'bg-red-100 text-red-600' :
               toast.type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
               'bg-blue-100 text-blue-600'
            }`}>
                {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
                {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
                {toast.type === 'warning' && <AlertTriangle className="w-4 h-4" />}
                {toast.type === 'info' && <Info className="w-4 h-4" />}
            </div>

            {/* Content */}
            <div className="flex-1">
                {toast.title && <h4 className={`text-sm font-bold mb-0.5 ${
                     toast.type === 'success' ? 'text-green-800' :
                     toast.type === 'error' ? 'text-red-800' :
                     toast.type === 'warning' ? 'text-yellow-800' :
                     'text-blue-800'
                }`}>{toast.title}</h4>}
                <p className="text-sm text-gray-600 leading-snug">{toast.message}</p>
            </div>

            {/* Close */}
            <button 
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition"
            >
                <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};