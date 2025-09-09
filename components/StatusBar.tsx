import React, { useRef, useEffect, useState } from 'react';
import { useLogger } from '../context/LoggerContext';
import { LogEntry, ApiKey } from '../types';
import { getKeyPoolState } from '../services/geminiService';
import { CheckCircleIcon, WarningIcon, XCircleIcon, CopyIcon, TrashIcon, ClockIcon, DownloadIcon } from './icons';

interface StatusBarProps {
    onOpenLogViewer: () => void;
}

const LogIcon: React.FC<{ type: LogEntry['type'] }> = ({ type }) => {
    switch (type) {
        case 'success':
            return <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />;
        case 'error':
            return <XCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />;
        case 'warning':
            return <WarningIcon className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
        case 'info':
        default:
            return <div className="w-4 h-4 flex items-center justify-center"><div className="w-2 h-2 bg-gray-500 rounded-full"></div></div>;
    }
};

const KeyStatus: React.FC<{apiKey: ApiKey}> = ({ apiKey }) => {
    const getStatusInfo = () => {
         switch (apiKey.status) {
            case 'active': return { text: 'Active', color: 'text-green-400', icon: <CheckCircleIcon className="w-4 h-4"/> };
            case 'exhausted': return { text: 'Exhausted', color: 'text-yellow-400', icon: <ClockIcon className="w-4 h-4"/> };
            case 'invalid': return { text: 'Invalid', color: 'text-red-400', icon: <XCircleIcon className="w-4 h-4"/> };
            default: return { text: 'Unknown', color: 'text-gray-500', icon: <WarningIcon className="w-4 h-4"/> };
        }
    }
    const { text, color, icon } = getStatusInfo();

    const getTimeLeft = () => {
        if (!apiKey.resetTime) return '';
        const timeLeftMs = apiKey.resetTime - Date.now();
        if (timeLeftMs <= 0) return '';
        const hours = Math.floor(timeLeftMs / 3600000);
        const minutes = Math.floor((timeLeftMs % 3600000) / 60000);
        return ` (resets in ~${hours}h ${minutes}m)`;
    };
    
    return (
         <div className="flex items-center gap-2 text-xs">
            <span className={color}>{icon}</span>
            <span className="font-mono text-gray-400">...{apiKey.value.slice(-4)}:</span>
            <span className={`${color} font-semibold`}>{text}{getTimeLeft()}</span>
        </div>
    );
}

const AllKeysDownReport: React.FC = () => {
    const allKeys = getKeyPoolState();
    if (!allKeys || allKeys.length === 0) return null;

    const now = Date.now();
    const availableKeys = allKeys.filter(k => k.status !== 'invalid' && (!k.resetTime || k.resetTime <= now));
    
    if (availableKeys.length > 0) return null;

    return (
        <div className="flex-grow flex items-center justify-center gap-4 text-sm text-yellow-300">
            <WarningIcon className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold">All API keys are unavailable.</span>
            <div className="flex items-center gap-4">
                {allKeys.map(k => <KeyStatus key={k.value} apiKey={k} />)}
            </div>
        </div>
    );
}


const StatusBar: React.FC<StatusBarProps> = ({ onOpenLogViewer }) => {
    const { logs, clearLogs, setDetailedLog, setDetailedError } = useLogger();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = 0;
        }
    }, [logs]);

    const handleLogClick = (e: React.MouseEvent, log: LogEntry) => {
        e.stopPropagation();
        if (log.details) {
             if (log.type === 'error') {
                setDetailedError(log);
            } else {
                setDetailedLog(log);
            }
        }
    };
    
    const formatLogsAsText = () => {
        // NOTE: According to the request, in a production build, this should filter logs.
        // Assuming 'dev' mode here, where all logs are included with full details.
        // const isProd = process.env.NODE_ENV === 'production';
        // const logsToSave = isProd ? logs.filter(l => l.type === 'error' || l.type === 'warning') : logs;
        
        const logsToSave = logs; // Dev mode behavior
        if (logsToSave.length === 0) return "Лог пуст.";
        
        return logsToSave
            .slice().reverse() // Oldest first
            .map(log => {
                const details = log.details ? `\n${JSON.stringify(log.details, null, 2)}` : '';
                return `[${new Date(log.timestamp).toISOString()}] [${log.type.toUpperCase()}] ${log.message}${details}`;
            })
            .join('\n\n');
    }

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(formatLogsAsText());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveToFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const filename = `log-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.txt`;
        
        const content = formatLogsAsText();
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        // The modal will show a confirmation.
        clearLogs();
    };

    const getLogTextColor = (type: LogEntry['type']) => {
        switch (type) {
            case 'success': return 'text-green-300';
            case 'error': return 'text-red-300';
            case 'warning': return 'text-yellow-300';
            case 'info':
            default: return 'text-gray-300';
        }
    };
    
    return (
        <div 
            onClick={onOpenLogViewer}
            className="fixed bottom-0 left-0 right-0 h-[50px] bg-[#222] border-t border-gray-700/50 shadow-2xl flex items-center justify-between px-4 z-50 cursor-pointer group"
            title="Open Log Viewer"
        >
             <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={handleCopy} title="Копировать весь лог" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
                    {copied ? <CheckCircleIcon className="w-5 h-5 text-green-400" /> : <CopyIcon className="w-5 h-5" />}
                </button>
                <button onClick={handleSaveToFile} title="Сохранить лог в файл" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
                    <DownloadIcon className="w-5 h-5" />
                </button>
             </div>

            <div ref={scrollRef} className="flex-grow flex items-center gap-4 overflow-x-auto whitespace-nowrap custom-scrollbar px-4 h-full">
                {logs.length > 0 ? logs.map(log => (
                    <div key={log.id} onClick={(e) => handleLogClick(e, log)} title={log.details ? "Нажмите для просмотра деталей" : ""} className={`flex items-center gap-2 text-sm flex-shrink-0 h-full ${log.details ? 'hover:bg-white/10' : ''} px-2 rounded-md`}>
                        <LogIcon type={log.type} />
                        <span className="text-gray-500 font-mono text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={getLogTextColor(log.type)}>{log.message}</span>
                    </div>
                )) : (logs.length === 0 ? <p className="text-sm text-gray-500 w-full text-center">Лог пуст. Нажмите, чтобы открыть полное окно лога.</p> : <AllKeysDownReport />)}
            </div>
            
             <div className="flex items-center gap-2 flex-shrink-0">
                 <button onClick={handleClear} title="Очистить лог (требует подтверждения)" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full">
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
            `}</style>
        </div>
    );
};

export default StatusBar;