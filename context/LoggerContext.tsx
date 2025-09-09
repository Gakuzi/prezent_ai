import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { LogEntry, ApiCallLog } from '../types';

interface LoggerContextType {
    logs: LogEntry[];
    lastError: LogEntry | null;
    addLog: (log: Omit<ApiCallLog, 'timestamp'>) => void; // Legacy support
    clearLogs: () => void;
    // States for modals
    detailedLog: LogEntry | null;
    setDetailedLog: (log: LogEntry | null) => void;
    detailedError: LogEntry | null;
    setDetailedError: (log: LogEntry | null) => void;
}

const LoggerContext = createContext<LoggerContextType | undefined>(undefined);

const MAX_LOGS = 100;

export const LoggerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [lastError, setLastError] = useState<LogEntry | null>(null);

    // Modal states
    const [detailedLog, setDetailedLog] = useState<LogEntry | null>(null);
    const [detailedError, setDetailedError] = useState<LogEntry | null>(null);


    const handleAddLogEvent = useCallback((event: Event) => {
        const logDetail = (event as CustomEvent<Omit<LogEntry, 'id'>>).detail;
        const newLog: LogEntry = {
            ...logDetail,
            id: crypto.randomUUID(),
        };
        
        setLogs(prevLogs => [newLog, ...prevLogs.slice(0, MAX_LOGS - 1)]);
        if (newLog.type === 'error') {
            setLastError(newLog);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('add-log', handleAddLogEvent);
        return () => {
            window.removeEventListener('add-log', handleAddLogEvent);
        };
    }, [handleAddLogEvent]);

    const clearLogs = useCallback(() => {
        setLogs([]);
        setLastError(null);
    }, []);
    
    // Legacy support for onApiLog callback for components not yet migrated
     const addLog = useCallback((log: Omit<ApiCallLog, 'timestamp'>) => {
        let type: LogEntry['type'] = 'info';
        if (log.status === 'success') type = 'success';
        if (log.status === 'failed') type = 'error';

        const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: type,
            message: `${log.message} [${log.key}]`,
        };
         setLogs(prev => [newLog, ...prev.slice(0, MAX_LOGS - 1)]);
         if (type === 'error') setLastError(newLog);
    }, []);
    
    return (
        <LoggerContext.Provider value={{ 
            logs, 
            lastError, 
            addLog, 
            clearLogs,
            detailedLog,
            setDetailedLog,
            detailedError,
            setDetailedError
        }}>
            {children}
        </LoggerContext.Provider>
    );
};

export const useLogger = (): LoggerContextType => {
    const context = useContext(LoggerContext);
    if (context === undefined) {
        throw new Error('useLogger must be used within a LoggerProvider');
    }
    return context;
};
