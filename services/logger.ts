import { LogEntry, LogDetails } from '../types';

const log = (type: LogEntry['type'], message: string, details?: LogDetails) => {
    const event = new CustomEvent('add-log', {
        detail: {
            type,
            message,
            details,
            timestamp: Date.now(),
        }
    });
    window.dispatchEvent(event);
};

const logger = {
    logInfo: (message: string, details?: LogDetails) => log('info', message, details),
    logSuccess: (message: string, details?: LogDetails) => log('success', message, details),
    logError: (message: string, details?: LogDetails) => log('error', message, details),
    logWarning: (message: string, details?: LogDetails) => log('warning', message, details),
};

export default logger;
