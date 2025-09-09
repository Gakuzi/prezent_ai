import React from 'react';
import { LogEntry } from '../types';
import { CloseIcon, WarningIcon } from './icons';

interface ErrorDetailModalProps {
  log: LogEntry | null;
  onClose: () => void;
  isGeneric?: boolean; // If true, it acts as a generic log detail viewer
}

const getErrorExplanation = (log: LogEntry): { title: string; explanation: string; solution: string } => {
    const errorDetails = log.details?.apiResponse?.error;
    const message = (errorDetails?.message || log.message || '').toLowerCase();

    if (message.includes('api key not valid') || message.includes('invalid_api_key')) {
        return {
            title: "Неверный API ключ",
            explanation: "API ключ, который был использован для запроса, недействителен или был отозван.",
            solution: "Проверьте правильность ключа в настройках. Убедитесь, что он не содержит опечаток и не был удален в Google Cloud Console."
        };
    }
    if (message.includes('permission denied')) {
        return {
            title: "API не активирован",
            explanation: "У этого API ключа нет разрешения на использование Generative Language API. Это самая частая проблема.",
            solution: "Перейдите в Google Cloud Console, выберите проект, к которому относится этот ключ, найдите 'Generative Language API' и нажмите 'Enable' (Включить)."
        };
    }
     if (message.includes('quota') || errorDetails?.status === 'RESOURCE_EXHAUSTED') {
        return {
            title: "Квота исчерпана",
            explanation: "Для этого API ключа был превышен дневной или минутный лимит запросов, установленный Google.",
            solution: "Подождите некоторое время (до 24 часов) для сброса лимита или используйте другой API ключ. Для увеличения лимитов привяжите платежный аккаунт к вашему проекту в Google Cloud."
        };
    }
    if (message.includes('network request failed')) {
         return {
            title: "Сетевая ошибка",
            explanation: "Приложению не удалось связаться с серверами Google. Это может быть вызвано проблемами с вашим интернет-соединением, блокировками CORS или временной недоступностью серверов Google.",
            solution: "Проверьте ваше интернет-соединение. Если проблема не решается, возможно, это временный сбой на стороне Google."
        };
    }
    
    return {
        title: "Произошла ошибка",
        explanation: "Случилась непредвиденная ошибка во время выполнения запроса к API.",
        solution: "Попробуйте повторить запрос позже. Если ошибка повторяется, изучите технические детали ниже для выявления проблемы."
    };
};


const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({ log, onClose, isGeneric = false }) => {
  if (!log) return null;
  
  const isError = log.type === 'error';
  const explanation = isError && !isGeneric ? getErrorExplanation(log) : null;
  const title = isGeneric ? "Детали лога" : (explanation ? explanation.title : "Детали ошибки");
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className={`p-4 border-b ${isError && !isGeneric ? 'border-yellow-500/30' : 'border-gray-700'} flex items-center justify-between`}>
            <div className="flex items-center gap-3">
                 <WarningIcon className={`w-6 h-6 ${isError && !isGeneric ? 'text-yellow-400' : 'text-indigo-400'}`} />
                 <h2 className="text-xl font-bold text-white">{title}</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
                <CloseIcon className="w-6 h-6" />
            </button>
        </header>

        <main className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            {explanation && (
                <div className="bg-gray-900/50 p-4 rounded-lg mb-6">
                    <h3 className="font-semibold text-white">Что это значит?</h3>
                    <p className="text-sm text-gray-300 mt-1">{explanation.explanation}</p>
                    <h3 className="font-semibold text-white mt-3">Что делать?</h3>
                    <p className="text-sm text-gray-300 mt-1">{explanation.solution}</p>
                </div>
            )}
            
            <div>
                 <h3 className="font-semibold text-gray-300 mb-2">Основное сообщение:</h3>
                 <p className="p-2 bg-gray-700 rounded-md font-mono text-sm">{log.message}</p>
            </div>

            {log.details && (
                 <div className="mt-4">
                    <h3 className="font-semibold text-gray-300 mb-2">Технические детали:</h3>
                    <div className="p-3 bg-black/30 rounded-md">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">
                            {JSON.stringify(log.details, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </main>
      </div>
       <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
       `}</style>
    </div>
  );
};

export default ErrorDetailModal;
