import React from 'react';
import { KeyIcon, CloseIcon } from './icons';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string | null;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, message }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
        <div className="p-6 relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/20 rounded-lg"><KeyIcon className="w-6 h-6 text-indigo-400" /></div>
            <h2 className="text-xl font-bold text-white">Требуется настройка API ключа</h2>
          </div>
          
          <p className="text-gray-300 mb-4 text-sm">{message || 'Для работы приложения необходим как минимум один рабочий API ключ от Google AI.'}</p>

          <div className="bg-gray-900/50 p-4 rounded-lg">
            <h3 className="font-semibold text-white mb-2">Что делать?</h3>
            <p className="text-sm text-gray-300">
             Пожалуйста, добавьте свой собственный API ключ в панели настроек.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Открыть настройки
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
