import React, { useState } from 'react';
import { SyncIcon, ExternalLinkIcon, LogoIcon } from './icons';
import Loader from './Loader';

interface GitHubAuthModalProps {
  onLogin: (pat: string) => Promise<boolean>;
}

const GitHubAuthModal: React.FC<GitHubAuthModalProps> = ({ onLogin }) => {
  const [patInput, setPatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginClick = async () => {
    if (!patInput.trim()) {
      setError("Пожалуйста, введите ваш Personal Access Token.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const success = await onLogin(patInput.trim());
    if (!success) {
      setError("Не удалось войти. Проверьте правильность токена и наличие интернет-соединения.");
      setIsLoading(false);
    }
    // On success, the App component will switch the view
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8 text-center">
        <LogoIcon className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Мастер Презентаций ИИ</h1>
        <p className="text-gray-400 mb-6">Для сохранения настроек требуется авторизация GitHub</p>

        <div className="space-y-4">
          <input
            type="password"
            value={patInput}
            onChange={(e) => setPatInput(e.target.value)}
            placeholder="GitHub Personal Access Token"
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-center"
            disabled={isLoading}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleLoginClick}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 font-bold text-lg bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-500"
          >
            {isLoading ? <Loader message="Вход..." /> : (
                <>
                    <SyncIcon className="w-6 h-6" />
                    Войти и синхронизировать
                </>
            )}
          </button>
        </div>

        <div className="mt-8 text-left text-sm">
            <details className="bg-gray-900/50 p-3 rounded-lg">
                <summary className="cursor-pointer font-semibold text-gray-300">Как получить Personal Access Token?</summary>
                <div className="mt-2 space-y-2 text-gray-400 text-xs">
                    <p>Для работы приложению нужен токен с доступом к Gists, чтобы сохранять ваши настройки.</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Перейдите на страницу <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">создания токена GitHub <ExternalLinkIcon className="inline w-3 h-3"/></a>.</li>
                        <li>В поле "Note" введите имя, например, "МастерПрезентаций".</li>
                        <li>В "Expiration" выберите срок действия (рекомендуется "No expiration" для удобства).</li>
                        <li>В разделе "Select scopes" поставьте галочку только напротив **`gist`**.</li>
                        <li>Нажмите "Generate token", скопируйте его и вставьте в поле выше.</li>
                    </ol>
                    <p className="mt-2 text-yellow-300/80">Ваш токен будет сохранен только в локальном хранилище вашего браузера и никуда не передается, кроме как для авторизации с GitHub.</p>
                </div>
            </details>
        </div>
      </div>
    </div>
  );
};

export default GitHubAuthModal;
