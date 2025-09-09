import React, { useState, useEffect, useRef } from 'react';
import { VoiceProfile } from '../types';
import { CloseIcon } from './icons';

interface VoiceSettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  voiceSettings: VoiceProfile;
  onVoiceSettingsChange: (settings: VoiceProfile) => void;
}

const VoiceSettingsMenu: React.FC<VoiceSettingsMenuProps> = ({ isOpen, onClose, voiceSettings, onVoiceSettingsChange }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  useEffect(() => {
    const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ru'));
        setVoices(availableVoices);
    };
    if (isOpen) {
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
          speechSynthesis.onvoiceschanged = loadVoices;
        }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={menuRef} className="absolute bottom-full right-0 mb-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-30 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-white">Настройки голоса</h3>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      
       <div className="space-y-4">
            <div>
            <label htmlFor="session-voice-select" className="block text-sm font-medium text-gray-300 mb-1">Голос диктора</label>
            <select
                id="session-voice-select"
                value={voiceSettings.voiceURI || ''}
                onChange={e => onVoiceSettingsChange({ ...voiceSettings, voiceURI: e.target.value })}
                className="w-full p-2 text-sm bg-gray-700 border border-gray-600 rounded-md text-white"
                disabled // This is a viewer, not an editor in this context. Use main settings to change.
            >
                {voices.map(voice => (
                <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>
                ))}
            </select>
            </div>
            <div>
            <label htmlFor="session-voice-rate" className="block text-sm font-medium text-gray-300 mb-1">Скорость ({voiceSettings.rate.toFixed(1)})</label>
            <input
                type="range" min="0.5" max="2" step="0.1"
                id="session-voice-rate"
                value={voiceSettings.rate}
                onChange={e => onVoiceSettingsChange({ ...voiceSettings, rate: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                disabled
            />
            </div>
            <div>
            <label htmlFor="session-voice-pitch" className="block text-sm font-medium text-gray-300 mb-1">Высота ({voiceSettings.pitch.toFixed(1)})</label>
            <input
                type="range" min="0" max="2" step="0.1"
                id="session-voice-pitch"
                value={voiceSettings.pitch}
                onChange={e => onVoiceSettingsChange({ ...voiceSettings, pitch: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                disabled
            />
            </div>
             <p className="text-xs text-gray-400 text-center">Изменить голоса можно в <br/>главных настройках приложения.</p>
      </div>
    </div>
  );
};

export default VoiceSettingsMenu;
