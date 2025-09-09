import React, { useState, useEffect } from 'react';
import { ApiKey, VoiceSettings, VoiceProfile, GithubUser, AppSettings, SyncStatus } from '../types';
import { CloseIcon, KeyIcon, SpeakerIcon, PaperclipIcon, SyncIcon, SparklesIcon } from './icons';
import ApiKeyManager from './ApiKeyManager';
import SyncStatusIndicator from './SyncStatusIndicator';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  githubUser: GithubUser | null;
  onLogout: () => void;
  syncStatus: SyncStatus;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen, onClose, settings, onSettingsChange,
  githubUser, onLogout, syncStatus
}) => {
  const [activeTab, setActiveTab] = useState<'api' | 'voice' | 'integrations' | 'account'>('api');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (isOpen) {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ru'));
            setAvailableVoices(voices);
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
          speechSynthesis.onvoiceschanged = loadVoices;
        }
    }
  }, [isOpen]);

  const handleKeysChange = (apiKeys: ApiKey[]) => {
    onSettingsChange({ ...settings, apiKeys });
  };
  
  const handleVoiceChange = (voiceSettings: VoiceSettings) => {
    onSettingsChange({ ...settings, voiceSettings });
  };

  const handlePexelsKeyChange = (pexelsApiKey: string | null) => {
    onSettingsChange({ ...settings, pexelsApiKey });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-gray-800 shadow-2xl border-l border-gray-700 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 flex-shrink-0 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Настройки</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <nav className="flex-shrink-0 flex border-b border-gray-700">
          <TabButton id="api" activeTab={activeTab} setActiveTab={setActiveTab} icon={<KeyIcon />} label="Ключи API" />
          <TabButton id="voice" activeTab={activeTab} setActiveTab={setActiveTab} icon={<SpeakerIcon />} label="Голос" />
          <TabButton id="integrations" activeTab={activeTab} setActiveTab={setActiveTab} icon={<PaperclipIcon />} label="Интеграции" />
          <TabButton id="account" activeTab={activeTab} setActiveTab={setActiveTab} icon={<SyncIcon />} label="Аккаунт" />
        </nav>

        <main className="flex-grow p-6 overflow-y-auto">
          {activeTab === 'api' && <ApiKeyManager keys={settings.apiKeys} onKeysChange={handleKeysChange} />}
          {activeTab === 'voice' && <VoiceSettingsEditor settings={settings.voiceSettings} onSettingsChange={handleVoiceChange} availableVoices={availableVoices} />}
          {activeTab === 'integrations' && <IntegrationsEditor pexelsApiKey={settings.pexelsApiKey} onPexelsKeyChange={handlePexelsKeyChange} />}
          {activeTab === 'account' && <AccountTab user={githubUser} onLogout={onLogout} syncStatus={syncStatus} />}
        </main>
      </div>
    </div>
  );
};

// --- Sub-components for clarity ---

const TabButton: React.FC<{id: any, activeTab: any, setActiveTab: any, icon: React.ReactNode, label: string}> = ({ id, activeTab, setActiveTab, icon, label }) => (
    <button onClick={() => setActiveTab(id)} className={`flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === id ? 'text-indigo-400 border-b-2 border-indigo-400 bg-gray-900/20' : 'text-gray-400 hover:bg-gray-700/50'}`}>
        <div className="w-5 h-5">{icon}</div> {label}
    </button>
);

const IntegrationsEditor: React.FC<{ pexelsApiKey: string | null, onPexelsKeyChange: (key: string | null) => void }> = ({ pexelsApiKey, onPexelsKeyChange }) => (
    <div className="space-y-6">
        <div>
            <h3 className="text-lg font-semibold text-white">Pexels API</h3>
            <p className="text-sm text-gray-400 mt-1">Добавьте ключ Pexels API для поиска стоковых изображений в интернете прямо из чата.</p>
        </div>
        <div>
            <label htmlFor="pexels-api-key" className="block text-sm font-medium text-gray-300 mb-2">API Ключ Pexels</label>
            <input
                id="pexels-api-key"
                type="password"
                value={pexelsApiKey || ''}
                onChange={(e) => onPexelsKeyChange(e.target.value.trim() || null)}
                placeholder="Ваш ключ от Pexels"
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white font-mono text-sm"
            />
            <p className="text-xs text-gray-400 mt-2">
                Получить бесплатный ключ можно на <a href="https://www.pexels.com/ru-ru/api/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">официальном сайте Pexels</a>.
            </p>
        </div>
    </div>
);

const AccountTab: React.FC<{ user: GithubUser | null, onLogout: () => void, syncStatus: SyncStatus }> = ({ user, onLogout, syncStatus }) => (
    <div className="space-y-6">
        <h3 className="text-lg font-semibold">Синхронизация с GitHub</h3>
        <p className="text-sm text-gray-400">Ваши настройки автоматически сохраняются в приватный Gist в вашем GitHub аккаунте.</p>
        {user ? (
            <div className="p-3 bg-gray-700 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full" />
                    <div>
                        <p className="font-semibold">{user.name || user.login}</p>
                        <p className="text-xs text-gray-400">Вы вошли в систему</p>
                    </div>
                </div>
                <button onClick={onLogout} className="px-3 py-1 text-xs font-semibold bg-red-600 rounded-md hover:bg-red-700">Выйти</button>
            </div>
        ) : <p>Ошибка: нет данных о пользователе.</p>}
        
        <div className="p-3 bg-gray-900/50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-200 mb-2">Статус синхронизации</h4>
            <SyncStatusIndicator status={syncStatus} />
            <p className="text-xs text-gray-500 mt-2">Все изменения сохраняются автоматически через 2 секунды.</p>
        </div>
    </div>
);

const VoiceSettingsEditor: React.FC<{ settings: VoiceSettings, onSettingsChange: (settings: VoiceSettings) => void, availableVoices: SpeechSynthesisVoice[] }> = ({ settings, onSettingsChange, availableVoices }) => {
    
    const handleToggle = (prop: keyof VoiceSettings) => {
        onSettingsChange({ ...settings, [prop]: !settings[prop] });
    };

    const handleAddSpeaker = () => {
        if (settings.voices.length < 4) {
            const newSpeaker: VoiceProfile = { voiceURI: availableVoices[0]?.voiceURI || null, rate: 1, pitch: 1 };
            onSettingsChange({ ...settings, voices: [...settings.voices, newSpeaker] });
        }
    };

    const handleRemoveSpeaker = (index: number) => {
        if (settings.voices.length > 1) {
            onSettingsChange({ ...settings, voices: settings.voices.filter((_, i) => i !== index) });
        }
    };

    const handleVoicePropChange = (index: number, prop: keyof VoiceProfile, value: string | number) => {
        const newVoices = settings.voices.map((v, i) => i === index ? { ...v, [prop]: value } : v);
        onSettingsChange({ ...settings, voices: newVoices });
    };

    const speakersToRender = settings.isPodcastMode ? settings.voices : [settings.voices[0]];
    
    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Настройки голоса</h3>
            
            <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-center justify-between">
                    <label htmlFor="ai-narration-mode" className="font-semibold text-white flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-indigo-400" /> AI-Enhanced Narration</label>
                    <input type="checkbox" id="ai-narration-mode" className="toggle-switch" checked={settings.aiEnhancedNarration} onChange={() => handleToggle('aiEnhancedNarration')} />
                </div>
                <p className="text-xs text-gray-400 px-1">Использует ИИ для добавления пауз и интонаций в речь диктора (требует вызовов API).</p>
            </div>

            <div className="p-3 bg-gray-900/50 rounded-lg">
                <div className="flex items-center justify-between">
                    <label htmlFor="podcast-mode" className="font-semibold text-white">Режим подкаста</label>
                    <input type="checkbox" id="podcast-mode" className="toggle-switch" checked={settings.isPodcastMode} onChange={() => handleToggle('isPodcastMode')} />
                </div>
                <p className="text-xs text-gray-400 pt-2">Включает возможность использования нескольких дикторов для создания диалогов.</p>
            </div>

            {speakersToRender.map((voice, index) => (
                <div key={index} className="p-4 border border-gray-700 rounded-lg space-y-4 bg-gray-900/30 relative">
                     <h4 className="font-semibold text-indigo-300">Диктор {index + 1}</h4>
                     {settings.isPodcastMode && settings.voices.length > 1 && (
                        <button onClick={() => handleRemoveSpeaker(index)} className="absolute top-2 right-2 p-1 rounded-full text-gray-500 hover:bg-red-500/20 hover:text-red-300"><CloseIcon className="w-4 h-4" /></button>
                     )}
                     <div>
                        <label htmlFor={`voice-select-${index}`} className="block text-sm font-medium text-gray-300 mb-2">Голос</label>
                        <select id={`voice-select-${index}`} value={voice.voiceURI || ''} onChange={e => handleVoicePropChange(index, 'voiceURI', e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                            <option value="">Автоматический выбор (по умолчанию)</option>
                            {availableVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor={`voice-rate-${index}`} className="block text-sm font-medium text-gray-300 mb-2">Скорость ({voice.rate.toFixed(1)})</label>
                        <input type="range" min="0.5" max="2" step="0.1" id={`voice-rate-${index}`} value={voice.rate} onChange={e => handleVoicePropChange(index, 'rate', parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    </div>
                    <div>
                        <label htmlFor={`voice-pitch-${index}`} className="block text-sm font-medium text-gray-300 mb-2">Высота ({voice.pitch.toFixed(1)})</label>
                        <input type="range" min="0" max="2" step="0.1" id={`voice-pitch-${index}`} value={voice.pitch} onChange={e => handleVoicePropChange(index, 'pitch', parseFloat(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    </div>
                </div>
            ))}
            {settings.isPodcastMode && settings.voices.length < 4 && (
                 <button onClick={handleAddSpeaker} className="w-full p-2 text-sm font-semibold border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:bg-gray-700 hover:border-gray-500 hover:text-gray-200">+ Добавить диктора</button>
            )}
        </div>
    );
};

export default SettingsPanel;

// Add a generic toggle switch style to avoid repetition
const style = document.createElement('style');
style.textContent = `
.toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px; /* w-11 */
    height: 24px; /* h-6 */
    flex-shrink: 0;
}
.toggle-switch {
    -webkit-appearance: none;
    appearance: none;
    background-color: #4b5563; /* bg-gray-600 */
    border-radius: 9999px; /* rounded-full */
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;
}
.toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px; /* top-0.5 */
    left: 2px; /* left-[2px] */
    width: 20px; /* w-5 */
    height: 20px; /* h-5 */
    background-color: white;
    border-radius: 9999px; /* rounded-full */
    transition: transform 0.2s ease-in-out;
}
.toggle-switch:checked {
    background-color: #4f46e5; /* peer-checked:bg-indigo-600 */
}
.toggle-switch:checked::after {
    transform: translateX(100%); /* peer-checked:after:translate-x-full */
}
`;
document.head.append(style);
