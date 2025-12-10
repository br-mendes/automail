import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = 'danger',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full shrink-0 ${
                variant === 'danger' ? 'bg-red-100 text-red-600' : 
                variant === 'warning' ? 'bg-yellow-100 text-yellow-600' : 
                'bg-blue-100 text-blue-600'
            }`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 flex justify-end gap-3">
            <button 
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition shadow-sm"
            >
                {cancelLabel}
            </button>
            <button 
                onClick={onConfirm}
                className={`px-4 py-2 text-white rounded-lg font-medium transition shadow-lg ${
                    variant === 'danger' ? 'bg-red-600 hover:bg-red-700' :
                    variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700' :
                    'bg-blue-600 hover:bg-blue-700'
                }`}
            >
                {confirmLabel}
            </button>
        </div>
      </div>
    </div>
  );
};