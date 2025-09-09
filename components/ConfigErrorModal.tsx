import React from 'react';
import { WarningIcon, SettingsIcon, CloseIcon } from './icons';

interface ConfigErrorModalProps {
  isOpen: boolean;
  errorDetails: { model: string, endpoint: string };
  onOpenSettings: () => void;
  onClose: () => void;
}

const ConfigErrorModal: React.FC<ConfigErrorModalProps> = ({ isOpen, errorDetails, onOpenSettings, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-2xl border border-orange-500/30">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <WarningIcon className="w-10 h-10 text-orange-400 flex-shrink-0" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Ошибка конфигурации API</h2>
                            <p className="text-sm text-gray-300">Модель или конечная точка не найдены. Проверьте model и endpoint.</p>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 p-3 rounded-lg mb-6">
                        <h3 className="font-semibold text-gray-200 mb-2 text-sm">Текущие настройки:</h3>
                        <div className="space-y-1 font-mono text-xs">
                            <p><span className="text-gray-400">Model:</span> <span className="text-orange-300">{errorDetails.model}</span></p>
                            <p><span className="text-gray-400">Endpoint:</span> <span className="text-orange-300">{errorDetails.endpoint}</span></p>
                        </div>
                         <p className="text-xs text-gray-500 mt-2">
                            Убедитесь, что указанная модель доступна и имя эндпоинта введено корректно.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={onOpenSettings}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                        >
                            <SettingsIcon className="w-5 h-5" />
                            Перейти к настройкам
                        </button>
                    </div>

                    <div className="mt-4 text-center">
                        <button
                            onClick={onClose}
                            className="text-sm text-gray-400 hover:text-white hover:underline"
                        >
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigErrorModal;