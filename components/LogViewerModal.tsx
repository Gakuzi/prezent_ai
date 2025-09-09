
import React from 'react';
import { useLogger } from '../context/LoggerContext';
import { LogEntry } from '../types';
import { CloseIcon, CheckCircleIcon, XCircleIcon, WarningIcon } from './icons';

const LogIcon: React.FC<{ type: LogEntry['type'] }> = ({ type }) => {
    switch (type) {
        case 'success':
            return <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />;
        case 'error':
            return <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />;
        case 'warning':
            return <WarningIcon className="w-5 h-5 text-yellow-400 flex-shrink-0" />;
        case 'info':
        default:
            return <div className="w-5 h-5 flex items-center justify-center"><div className="w-2 h-2 bg-gray-500 rounded-full flex-shrink-0"></div></div>;
    }
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

const LogViewerModal: React.FC<{ isOpen: boolean, onClose: () => void }> = ({ isOpen, onClose }) => {
    const { logs, clearLogs, setDetailedLog, setDetailedError } = useLogger();

    if (!isOpen) return null;

    const handleLogClick = (log: LogEntry) => {
        if (log.details) {
            if (log.type === 'error') {
                setDetailedError(log);
            } else {
                setDetailedLog(log);
            }
        }
    };

    return (
        <div className="fixed top-0 left-0 right-0 bottom-[50px] bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full h-full max-w-4xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-xl font-bold text-white">Журнал событий</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={clearLogs} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-md">Очистить</button>
                        <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>

                <main className="flex-grow p-2 overflow-y-auto custom-scrollbar font-mono text-sm">
                    {logs.length > 0 ? (
                        logs.map(log => (
                            <div 
                                key={log.id} 
                                onClick={() => handleLogClick(log)}
                                className={`flex items-start gap-3 p-2 rounded-md ${log.details ? 'cursor-pointer hover:bg-white/5' : ''}`}
                            >
                                <LogIcon type={log.type} />
                                <span className="text-gray-500 flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                                <p className={`whitespace-pre-wrap break-words ${getLogTextColor(log.type)}`}>{log.message}</p>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>Нет записей в журнале.</p>
                        </div>
                    )}
                </main>
                 <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
                `}</style>
            </div>
        </div>
    );
};

export default LogViewerModal;