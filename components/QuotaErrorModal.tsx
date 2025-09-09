


import React from 'react';
import { ApiKey } from '../types';
import { WarningIcon, RefreshIcon, SettingsIcon, ClockIcon, XCircleIcon, CheckCircleIcon, CloseIcon } from './icons';

interface QuotaErrorModalProps {
  isOpen: boolean;
  failedKeys: ApiKey[];
  onRetry: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const maskKey = (key: string) => {
    if (key.length < 8) return '****';
    return `...${key.slice(-4)}`;
};

const formatTimeLeft = (resetTime: number): string => {
    const timeLeftMs = resetTime - Date.now();
    if (timeLeftMs <= 0) return '';
    
    const totalSeconds = Math.round(timeLeftMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) return `(повтор ~${hours}ч ${minutes}м)`;
    if (minutes > 0) return `(повтор ~${minutes}м)`;
    
    return `(повтор ~${totalSeconds}с)`;
};

const getStatusInfo = (key: ApiKey) => {
    switch (key.status) {
        case 'active':
             return { icon: <CheckCircleIcon className="w-5 h-5 text-green-400" />, text: 'Активен', textColor: 'text-green-300' };
        case 'exhausted':
            return { icon: <WarningIcon className="w-5 h-5 text-yellow-400" />, text: 'Дневной лимит', textColor: 'text-yellow-300' };
        case 'rate_limited':
            return { icon: <ClockIcon className="w-5 h-5 text-blue-400" />, text: 'Частый запрос', textColor: 'text-blue-300' };
        case 'invalid':
            return { icon: <XCircleIcon className="w-5 h-5 text-red-400" />, text: 'Неверный', textColor: 'text-red-300' };
        default:
            return { icon: <WarningIcon className="w-5 h-5 text-gray-500" />, text: 'Неизвестно', textColor: 'text-gray-400' };
    }
};

const getSmartSummary = (keys: ApiKey[]): { title: string, message: string } => {
    if (keys.length === 0) {
        return {
            title: "Нет доступных API ключей",
            message: "Пожалуйста, добавьте хотя бы один API ключ в настройках, чтобы продолжить."
        };
    }

    const now = Date.now();
    const allKeysOnCooldown = keys.length > 0 && keys.every(k => (k.resetTime && k.resetTime > now));

    if (allKeysOnCooldown) {
        return {
            title: "Все ключи временно недоступны",
            message: "Все ключи на паузе из-за превышения лимитов или временных ошибок API. Попробуйте повторить запрос позже. Статус каждого ключа указан ниже."
        };
    }

    if (keys.some(k => k.status === 'invalid' && k.lastError?.includes('API key not valid'))) {
         return {
            title: "Неверный API ключ",
            message: "Один или несколько из ваших ключей недействительны. Пожалуйста, проверьте их в настройках."
        }
    }
    
    if (keys.some(k => k.status === 'invalid' && k.lastError?.includes('permission denied'))) {
        return {
            title: "API не активирован",
            message: "Для одного из ключей не включен 'Generative Language API' в Google Cloud. Следуйте инструкции в настройках, чтобы активировать его."
        }
    }
    
    return {
        title: "Ошибка API",
        message: "Не удалось выполнить запрос с использованием доступных ключей. Ниже приведен детальный отчет. Проверьте настройки или попробуйте снова."
    };
};


const QuotaErrorModal: React.FC<QuotaErrorModalProps> = ({ isOpen, failedKeys, onRetry, onOpenSettings, onClose }) => {
    if (!isOpen) return null;
    
    const summary = getSmartSummary(failedKeys);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-2xl border border-yellow-500/30">
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <WarningIcon className="w-10 h-10 text-yellow-400 flex-shrink-0" />
                        <div>
                            <h2 className="text-xl font-bold text-white">{summary.title}</h2>
                            <p className="text-sm text-gray-300">{summary.message}</p>
                        </div>
                    </div>

                    <div className="bg-gray-900/50 p-3 rounded-lg max-h-60 overflow-y-auto custom-scrollbar">
                        <h3 className="font-semibold text-gray-200 mb-2 text-sm">Детальный отчет о ключах:</h3>
                        <div className="space-y-2">
                            {failedKeys.map((key, index) => {
                                const statusInfo = getStatusInfo(key);
                                const countdown = key.resetTime ? formatTimeLeft(key.resetTime) : '';

                                return (
                                     <div key={index} className="p-2 bg-gray-800/50 rounded-md">
                                        <div className="flex items-center gap-3 text-xs">
                                            {statusInfo.icon}
                                            <span className="font-mono text-gray-400">Ключ {maskKey(key.value)}</span>
                                            <span className={`font-semibold ${statusInfo.textColor}`}>{statusInfo.text} {countdown}</span>
                                        </div>
                                        {key.lastError && (
                                            <p className="text-xs text-gray-500 mt-1 pl-8 truncate" title={key.lastError}>
                                                Причина: {key.lastError}
                                            </p>
                                        )}
                                     </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
                        <button
                            onClick={onRetry}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-transform hover:scale-105"
                        >
                            <RefreshIcon className="w-5 h-5" />
                            Повторить
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-gray-600 rounded-lg hover:bg-gray-700"
                        >
                            <SettingsIcon className="w-5 h-5" />
                            Настройки
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
             <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
             `}</style>
        </div>
    );
};

export default QuotaErrorModal;