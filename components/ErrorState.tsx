import React, { useState } from 'react';
import { WarningIcon, RefreshIcon, SettingsIcon } from './icons';
import Loader from './Loader';

interface ErrorStateProps {
  error: string | null;
  // FIX: Allow onRetry to return void or a Promise to match the type of retryAction in App.tsx.
  onRetry: () => Promise<void> | void;
  onOpenSettings: () => void;
  onRestart: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry, onOpenSettings, onRestart }) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryClick = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      // При успехе App компонент изменит состояние и этот компонент размонтируется.
    } catch (e) {
      // Если повторная попытка не удалась, handleError в App будет вызван снова,
      // повторно отрендерив этот компонент с новым сообщением об ошибке.
      console.error("Retry attempt failed:", e);
      // setIsRetrying(false) может не вызваться, если компонент размонтирован,
      // но это хорошая практика на случай, если он останется видимым.
      setIsRetrying(false);
    }
  };

  return (
    <div className="text-center p-8 bg-gray-800/50 rounded-2xl max-w-2xl mx-auto border border-red-500/30">
      <WarningIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-red-300 mb-4">Произошла ошибка</h2>
      <p className="text-gray-300 mb-8 max-w-md mx-auto whitespace-pre-wrap">
        {error || 'Произошла неизвестная ошибка. Пожалуйста, проверьте ваше интернет-соединение и настройки API.'}
      </p>

      {isRetrying ? (
        <Loader message="Повторяю операцию..." />
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleRetryClick}
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
      )}

      <div className="mt-8">
        <button onClick={onRestart} className="text-sm text-gray-400 hover:text-white hover:underline">
          Начать заново
        </button>
      </div>
    </div>
  );
};

export default ErrorState;