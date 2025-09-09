import React, { useState, useEffect } from 'react';
// FIX: Added AppSettings to the import list from '../types'.
import { ApiKey, AppSettings } from '../types';
// FIX: Renamed function to match the export from geminiService.
import { checkApiKey } from '../services/geminiService';
import { RefreshIcon, CheckCircleIcon, WarningIcon, XCircleIcon, ClockIcon } from './icons';

interface ApiKeyStatusReportProps {
    initialKeys: ApiKey[];
    // FIX: Added 'settings' prop to provide model and endpoint for the API check.
    settings: AppSettings;
}

const maskKey = (key: string) => {
    if (key.length < 8) return '****';
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
};

const getStatusInfo = (key: ApiKey) => {
    switch (key.status) {
        case 'active':
            return { icon: <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" title="Активен"/>, text: 'Статус: Активен', textColor: 'text-green-300' };
        case 'exhausted':
            return { icon: <WarningIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" title="Квота исчерпана"/>, text: 'Статус: Лимит исчерпан', textColor: 'text-yellow-300' };
        case 'invalid':
            return { icon: <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" title="Неверный ключ"/>, text: 'Статус: Неверный ключ', textColor: 'text-red-300' };
        default:
            return { icon: <WarningIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />, text: 'Статус: Неизвестно', textColor: 'text-gray-400' };
    }
};

const ApiKeyStatusReport: React.FC<ApiKeyStatusReportProps> = ({ initialKeys, settings }) => {
    const [keysWithStatus, setKeysWithStatus] = useState<ApiKey[]>(initialKeys);
    const [checkingStatus, setCheckingStatus] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const checkAllKeys = async () => {
            // Set all keys to checking state initially
            const initialCheckingState: Record<string, boolean> = {};
            initialKeys.forEach(key => initialCheckingState[key.value] = true);
            setCheckingStatus(initialCheckingState);

            const checkedKeys = await Promise.all(
                initialKeys.map(async (key) => {
                    // FIX: Pass the required model and endpoint arguments to 'checkApiKey'.
                    const status = await checkApiKey(key.value, settings.geminiModel, settings.geminiEndpoint);
                    setCheckingStatus(prev => ({...prev, [key.value]: false }));
                    return { ...key, status, lastChecked: Date.now() };
                })
            );
            setKeysWithStatus(checkedKeys);
        };

        checkAllKeys();
    }, [initialKeys, settings]);

    return (
        <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
            {keysWithStatus.length > 0 ? keysWithStatus.map(key => {
                const isChecking = checkingStatus[key.value];
                const statusInfo = getStatusInfo(key);

                return (
                    <div key={key.value} className="flex items-center gap-3 p-2 bg-gray-800 rounded-md">
                        {isChecking ? (
                            <RefreshIcon className="w-5 h-5 text-indigo-400 animate-spin flex-shrink-0" />
                        ) : (
                            statusInfo.icon
                        )}
                        <div className="flex-grow">
                            <p className="font-mono text-sm text-gray-400">{maskKey(key.value)}</p>
                            <p className={`text-xs ${isChecking ? 'text-indigo-300' : statusInfo.textColor}`}>
                                {isChecking ? 'Проверка...' : statusInfo.text}
                            </p>
                        </div>
                        {key.lastChecked && !isChecking && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0" title="Время последней проверки">
                                <ClockIcon className="w-3 h-3" />
                                <span>{new Date(key.lastChecked).toLocaleTimeString()}</span>
                            </div>
                        )}
                    </div>
                );
            }) : (
                <p className="text-sm text-gray-500 text-center py-2">Нет ключей для проверки.</p>
            )}
        </div>
    );
};

export default ApiKeyStatusReport;