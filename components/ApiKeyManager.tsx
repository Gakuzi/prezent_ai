// FIX: Import 'useEffect' from 'react' to resolve the 'Cannot find name' error.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ApiKey, AppSettings } from '../types';
import { checkApiKey, healthCheckAllKeys, getKeyPoolState, forceResetAllKeys } from '../services/geminiService';
import { RefreshIcon, PinIcon, PinOffIcon, XCircleIcon, CheckCircleIcon, WarningIcon, MenuIcon, ExternalLinkIcon, ClockIcon } from './icons';

interface ApiKeyManagerProps {
  keys: ApiKey[];
  onKeysChange: (keys: ApiKey[]) => void;
  settings: AppSettings;
}

const maskKey = (key: string) => {
    if (!key || key.length < 8) return '****';
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
};

const formatTimeLeft = (resetTime: number): string => {
    const timeLeftMs = resetTime - Date.now();
    if (timeLeftMs <= 0) return '';
    
    const totalSeconds = Math.round(timeLeftMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) return `(~${hours}ч ${minutes}м)`;
    if (minutes > 0) return `(~${minutes}м)`;
    
    return `(~${totalSeconds}с)`;
};

const Countdown: React.FC<{ resetTime: number }> = ({ resetTime }) => {
    const [_, rerender] = useState(0);

    useEffect(() => {
        const timeLeftMs = resetTime - Date.now();
        if (timeLeftMs <= 0) return;

        const updateInterval = timeLeftMs > 3600 * 1000 ? 60000 : 1000;

        const interval = setInterval(() => {
            if (resetTime - Date.now() > 0) {
                rerender(c => c + 1);
            } else {
                clearInterval(interval);
                rerender(c => c + 1);
            }
        }, updateInterval);
        return () => clearInterval(interval);
    }, [resetTime]);
    
    const formattedTime = formatTimeLeft(resetTime);
    if (!formattedTime) return null;

    return <span className="text-xs"> {formattedTime}</span>;
};


const getStatusInfo = (key: ApiKey) => {
    switch (key.status) {
        case 'active':
            return { icon: <CheckCircleIcon className="w-5 h-5 text-green-400" />, text: 'Активен', textColor: 'text-green-300' };
        case 'exhausted':
            return { icon: <WarningIcon className="w-5 h-5 text-yellow-400" />, text: 'Лимит', textColor: 'text-yellow-300' };
        case 'rate_limited':
            return { icon: <ClockIcon className="w-5 h-5 text-blue-400" />, text: 'Ограничен', textColor: 'text-blue-300' };
        case 'invalid':
            return { icon: <XCircleIcon className="w-5 h-5 text-red-400" />, text: 'Неверный', textColor: 'text-red-300' };
        case 'config_error':
            return { icon: <WarningIcon className="w-5 h-5 text-orange-400" />, text: 'Ошибка конфиг.', textColor: 'text-orange-300' };
        default:
            return { icon: <WarningIcon className="w-5 h-5 text-gray-500" />, text: 'Неизвестно', textColor: 'text-gray-400' };
    }
};

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ keys, onKeysChange, settings }) => {
    const [newKeyValue, setNewKeyValue] = useState('');
    const [checkingStatus, setCheckingStatus] = useState<Record<string, boolean>>({});
    const [addKeyError, setAddKeyError] = useState<string | null>(null);

    const dragKey = useRef<number | null>(null);
    const dragOverKey = useRef<number | null>(null);
    const [_, forceUpdate] = useState(0);

    const handleCheckKey = useCallback(async (keyToCheck: string) => {
        setCheckingStatus(prev => ({ ...prev, [keyToCheck]: true }));
        try {
            // FIX: Explicitly type 'status' to prevent TypeScript from widening it to a generic 'string'.
            const status: ApiKey['status'] = await checkApiKey(keyToCheck, settings.geminiModel, settings.geminiEndpoint);
            const newKeys = keys.map(k => 
                k.value === keyToCheck ? { ...k, status, lastChecked: Date.now(), resetTime: undefined, lastError: undefined } : k
            );
            onKeysChange(newKeys);
        } catch (error: any) {
             if (error.name === 'ConfigError') {
                alert(`Ошибка конфигурации: ${error.message}. Проверьте модель и эндпоинт в настройках.`);
                 const newKeys = keys.map(k => 
                    k.value === keyToCheck ? { ...k, status: 'config_error', lastChecked: Date.now(), lastError: error.message } : k
                );
                onKeysChange(newKeys);
            } else {
                 console.error(`Failed to check key ...${keyToCheck.slice(-4)}`, error);
            }
        } finally {
            setCheckingStatus(prev => ({ ...prev, [keyToCheck]: false }));
        }
    }, [keys, onKeysChange, settings.geminiModel, settings.geminiEndpoint]);
    
    const handleAddKey = () => {
        const trimmedKey = newKeyValue.trim();
        if (!trimmedKey) return;

        if (keys.some(k => k.value === trimmedKey)) {
            setAddKeyError('Этот ключ уже существует в списке.');
            return;
        }
        
        setAddKeyError(null);
        const newKey: ApiKey = { value: trimmedKey, status: 'unknown' };
        onKeysChange([...keys, newKey]);
        setNewKeyValue('');
        handleCheckKey(trimmedKey);
    };

    const handleRemoveKey = (keyToRemove: string) => {
        onKeysChange(keys.filter(k => k.value !== keyToRemove));
    };

    const handleTogglePin = (keyToPin: string) => {
        onKeysChange(keys.map(k => ({
            ...k,
            isPinned: k.value === keyToPin ? !k.isPinned : false
        })));
    };

    const handleCheckAllKeys = async () => {
        const allKeys = keys.map(k => k.value);
        const checkingState: Record<string, boolean> = {};
        allKeys.forEach(v => { checkingState[v] = true; });
        setCheckingStatus(checkingState);

        await healthCheckAllKeys();
        
        const updatedPoolState = getKeyPoolState();
        onKeysChange(updatedPoolState);
        
        setCheckingStatus({});
    };

    const handleForceReset = () => {
        const updatedKeys = forceResetAllKeys();
        onKeysChange(updatedKeys);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        dragKey.current = index;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        dragOverKey.current = index;
        forceUpdate(c => c + 1);
    };
    
    const handleDragEnd = () => {
        dragKey.current = null;
        dragOverKey.current = null;
        forceUpdate(c => c + 1);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (dragKey.current === null || dragOverKey.current === null || dragKey.current === dragOverKey.current) {
            handleDragEnd();
            return;
        };
        
        const reorderedKeys = [...keys];
        const draggedItemContent = reorderedKeys.splice(dragKey.current, 1)[0];
        reorderedKeys.splice(dragOverKey.current, 0, draggedItemContent);
        
        handleDragEnd();
        onKeysChange(reorderedKeys);
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-white">Управление API ключами</h3>
                <p className="text-sm text-gray-400 mt-1">Добавьте несколько ключей Google AI из разных проектов Google Cloud. Приоритет использования - сверху вниз.</p>
            </div>
            
            <details className="bg-gray-900/50 p-3 rounded-lg">
                <summary className="cursor-pointer font-semibold text-gray-300 text-sm">Инструкция по созданию РАБОЧЕГО ключа</summary>
                <div className="mt-3 space-y-2 text-gray-400 text-xs">
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>Перейдите в <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google Cloud Console <ExternalLinkIcon className="inline w-3 h-3"/></a> и войдите.</li>
                        <li>Создайте новый проект (или выберите существующий). Название может быть любым.</li>
                        <li>В строке поиска наверху введите <code className="bg-gray-700 px-1 rounded">Generative Language API</code> и перейдите на страницу этого API.</li>
                        <li>**Нажмите синюю кнопку `ENABLE` (Включить). Это самый важный шаг. Если API не активирован, ключ будет бесполезен.**</li>
                        <li>После активации перейдите в меню <code className="bg-gray-700 px-1 rounded">Учетные данные (Credentials)</code> в левой панели.</li>
                        <li>Нажмите <code className="bg-gray-700 px-1 rounded">+ CREATE CREDENTIALS</code> → <code className="bg-gray-700 px-1 rounded">API key</code>.</li>
                        <li>Скопируйте сгенерированный ключ и вставьте его в поле ниже.</li>
                    </ol>
                    <p className="mt-2">Для снятия жестких ограничений на частоту запросов может потребоваться <a href="https://cloud.google.com/billing/docs/how-to/modify-project" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">привязать платежный аккаунт</a> к проекту. Google предоставляет щедрый бесплатный уровень.</p>
                </div>
            </details>

            <div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newKeyValue}
                        onChange={(e) => {
                            setNewKeyValue(e.target.value);
                            if (addKeyError) setAddKeyError(null);
                        }}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddKey()}
                        placeholder="AIza..."
                        className={`flex-grow p-2 bg-gray-700 border rounded-md text-white font-mono text-sm ${addKeyError ? 'border-red-500' : 'border-gray-600'}`}
                    />
                    <button
                        onClick={handleAddKey}
                        disabled={!newKeyValue.trim()}
                        className="px-4 py-2 text-sm font-semibold bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-500"
                    >
                        Добавить
                    </button>
                </div>
                {addKeyError && <p className="text-xs text-red-400 mt-1">{addKeyError}</p>}
            </div>

            <div className="space-y-2 max-h-[20rem] overflow-y-auto pr-2 -mr-2 custom-scrollbar" onDragOver={(e) => e.preventDefault()}>
                {keys.map((key, index) => {
                    const statusInfo = getStatusInfo(key);
                    const isChecking = checkingStatus[key.value];
                    const isDraggedOver = dragOverKey.current === index;

                    return (
                        <div key={key.value}
                             draggable
                             onDragStart={(e) => handleDragStart(e, index)}
                             onDragEnter={(e) => handleDragEnter(e, index)}
                             onDragEnd={handleDragEnd}
                             onDrop={handleDrop}
                             className={`flex items-center gap-2 p-2 bg-gray-900/50 rounded-lg border border-gray-700 transition-all duration-200 ${isDraggedOver ? 'border-indigo-500 scale-105 bg-gray-900' : ''}`}
                             title={key.lastError || ''}
                        >
                            <div className="cursor-grab p-1" title="Перетащить для изменения приоритета"><MenuIcon className="w-5 h-5 text-gray-500"/></div>
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                {isChecking ? <RefreshIcon className="w-5 h-5 text-indigo-400 animate-spin" /> : statusInfo.icon}
                            </div>
                            <div className="flex-grow">
                                <p className="font-mono text-sm text-gray-300">{maskKey(key.value)}</p>
                                <p className={`text-xs ${isChecking ? 'text-indigo-300' : statusInfo.textColor}`}>
                                    {isChecking ? 'Проверка...' : statusInfo.text}
                                    {key.resetTime && <Countdown resetTime={key.resetTime} />}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleCheckKey(key.value)}
                                    disabled={isChecking}
                                    className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50"
                                    title="Проверить статус"
                                >
                                    <RefreshIcon className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                    onClick={() => handleTogglePin(key.value)}
                                    className={`p-2 rounded-full ${key.isPinned ? 'text-indigo-400' : 'text-gray-400 hover:text-white'} hover:bg-gray-700`}
                                    title={key.isPinned ? "Открепить ключ" : "Закрепить ключ"}
                                >
                                    {key.isPinned ? <PinIcon className="w-4 h-4" /> : <PinOffIcon className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => handleRemoveKey(key.value)}
                                    className="p-2 rounded-full text-gray-400 hover:bg-red-500/50 hover:text-red-300"
                                    title="Удалить ключ"
                                >
                                    <XCircleIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {keys.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">Нет добавленных ключей.</p>
                )}
            </div>
            
            <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                 <button
                    onClick={handleCheckAllKeys}
                    className="text-sm text-indigo-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                    disabled={Object.values(checkingStatus).some(Boolean)}
                >
                    Проверить все ключи
                </button>
                 <button
                    onClick={handleForceReset}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-yellow-300 bg-yellow-900/50 border border-yellow-700 rounded-md hover:bg-yellow-800/50"
                    title="Сбрасывает локальный статус всех ключей на 'active', чтобы попробовать их использовать снова. Полезно, если вы уверены, что лимиты на стороне Google уже сброшены."
                >
                    <WarningIcon className="w-4 h-4" />
                    Принудительный сброс
                </button>
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
            `}</style>
        </div>
    );
};

export default ApiKeyManager;
