
import React, { useState, useEffect } from 'react';
import { AppSettings, GithubUser, SyncStatus } from '../types';
import { CloseIcon, KeyIcon, SpeakerIcon, GlobeIcon, UserIcon } from './icons';
import ApiKeyManager from './ApiKeyManager';
import SyncStatusIndicator from './SyncStatusIndicator';

type SettingsTab = 'api' | 'voice' | 'integrations' | 'account';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  githubUser: GithubUser | null;
  onLogout: () => void;
  syncStatus: SyncStatus;
  initialTab: SettingsTab;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  githubUser,
  onLogout,
  syncStatus,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handlePexelsKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, pexelsApiKey: e.target.value });
  };
  
  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, geminiModel: e.target.value });
  };

  const handleEndpointChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, geminiEndpoint: e.target.value });
  };

  const tabs: { id: SettingsTab; name: string; icon: React.ReactNode }[] = [
    { id: 'api', name: 'API Ключи', icon: <KeyIcon className="w-5 h-5" /> },
    { id: 'voice', name: 'Голос', icon: <SpeakerIcon className="w-5 h-5" /> },
    { id: 'integrations', name: 'Интеграции', icon: <GlobeIcon className="w-5 h-5" /> },
    { id: 'account', name: 'Аккаунт', icon: <UserIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 bottom-[50px] bg-black/60 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-gray-800 shadow-2xl border-l border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 flex-shrink-0 flex items-center justify-between border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Настройки</h2>
          <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        
        <nav className="flex-shrink-0 p-2 flex items-center justify-center gap-2 border-b border-gray-700 bg-gray-900/20">
            {tabs.map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                    {tab.icon}
                    {tab.name}
                </button>
            ))}
        </nav>

        <main className="flex-grow p-6 overflow-y-auto custom-scrollbar">
            {activeTab === 'api' && (
                <div className="space-y-8">
                    <ApiKeyManager keys={settings.apiKeys} onKeysChange={(newKeys) => onSettingsChange({...settings, apiKeys: newKeys})} settings={settings} />
                    <div>
                        <h3 className="text-lg font-semibold text-white">Конфигурация модели</h3>
                        <p className="text-sm text-gray-400 mt-1">Изменяйте эти значения, только если вы знаете, что делаете.</p>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label htmlFor="gemini-model" className="block text-sm font-medium text-gray-300 mb-1">Gemini Model Name</label>
                                <input id="gemini-model" type="text" value={settings.geminiModel} onChange={handleModelChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white font-mono text-sm" />
                            </div>
                            <div>
                                <label htmlFor="gemini-endpoint" className="block text-sm font-medium text-gray-300 mb-1">Gemini API Endpoint</label>
                                <input id="gemini-endpoint" type="text" value={settings.geminiEndpoint} onChange={handleEndpointChange} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white font-mono text-sm" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'voice' && (
                 <div><h3 className="text-lg font-semibold text-white">Настройки голоса (в разработке)</h3></div>
            )}
            {activeTab === 'integrations' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Pexels API</h3>
                        <p className="text-sm text-gray-400 mt-1">Добавьте ключ для поиска стоковых изображений.</p>
                        <div className="mt-4">
                            <label htmlFor="pexels-key" className="block text-sm font-medium text-gray-300 mb-1">Pexels API Key</label>
                            <input id="pexels-key" type="text" value={settings.pexelsApiKey || ''} onChange={handlePexelsKeyChange} placeholder="Ваш ключ от Pexels" className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'account' && githubUser && (
                <div className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg">
                        <img src={githubUser.avatar_url} alt="GitHub Avatar" className="w-16 h-16 rounded-full" />
                        <div>
                            <h3 className="text-xl font-bold text-white">{githubUser.name || githubUser.login}</h3>
                            <p className="text-gray-400">@{githubUser.login}</p>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-300 mb-2">Синхронизация настроек</h4>
                        <div className="p-3 bg-gray-900/50 rounded-lg">
                             <SyncStatusIndicator status={syncStatus} />
                        </div>
                       
                    </div>
                    <button onClick={onLogout} className="w-full px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700">
                        Выйти
                    </button>
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

export default SettingsPanel;