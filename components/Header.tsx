import React from 'react';
import { LogoIcon, SettingsIcon } from './icons';

interface HeaderProps {
  onRestart: () => void;
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onRestart, onOpenSettings }) => (
  <header className="flex-shrink-0 flex items-center justify-between p-2 bg-white/5 backdrop-blur-lg rounded-xl shadow-lg mb-4">
    <div className="flex items-center gap-3">
      <LogoIcon className="w-8 h-8 text-indigo-400" />
      <h1 className="text-xl font-bold text-white">Мастер Презентаций ИИ</h1>
    </div>
    <div className="flex items-center gap-4">
      <button
        onClick={onRestart}
        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Начать сначала
      </button>
       <button
        onClick={onOpenSettings}
        className="p-2 text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
        title="Настройки"
      >
        <SettingsIcon className="w-6 h-6" />
      </button>
    </div>
  </header>
);

export default Header;
