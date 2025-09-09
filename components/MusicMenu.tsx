import React, { useRef, useEffect } from 'react';
import { MusicTrack } from '../types';
import { CloseIcon, SpeakerIcon, SparklesIcon } from './icons';

interface MusicMenuProps {
  isOpen: boolean;
  onClose: () => void;
  recommendedMusic: MusicTrack[];
  otherMusic: MusicTrack[];
  selectedMusic: MusicTrack | null;
  onMusicChange: (track: MusicTrack | null) => void;
  musicVolume: number;
  onVolumeChange: (volume: number) => void;
}

const MusicMenu: React.FC<MusicMenuProps> = ({ isOpen, onClose, recommendedMusic, otherMusic, selectedMusic, onMusicChange, musicVolume, onVolumeChange }) => {
  const menuRef = useRef<HTMLDivElement>(null);

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
        <h3 className="font-semibold text-white">Фоновая музыка</h3>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      
      <ul className="space-y-1 mb-4 max-h-48 overflow-y-auto custom-scrollbar">
        <li>
          <button
            onClick={() => onMusicChange(null)}
            className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${!selectedMusic ? 'bg-indigo-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
          >
            Без музыки
          </button>
        </li>

        {recommendedMusic.length > 0 && (
          <>
            <li className="pt-2">
                <p className="px-3 text-xs font-semibold text-indigo-300 flex items-center gap-1"><SparklesIcon className="w-4 h-4"/> Рекомендации ИИ</p>
            </li>
            {recommendedMusic.map((track) => (
            <li key={track.url}>
                <button
                onClick={() => onMusicChange(track)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedMusic?.url === track.url ? 'bg-indigo-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
                >
                {track.name}
                </button>
            </li>
            ))}
             <li className="pt-2">
                <p className="px-3 text-xs font-semibold text-gray-400">Другие треки</p>
            </li>
          </>
        )}
        
        {otherMusic.map((track) => (
          <li key={track.url}>
            <button
              onClick={() => onMusicChange(track)}
              className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${selectedMusic?.url === track.url ? 'bg-indigo-600 text-white' : 'text-gray-200 hover:bg-gray-700'}`}
            >
              {track.name}
            </button>
          </li>
        ))}
      </ul>
      
      <div>
        <label htmlFor="volume-slider" className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1">
          <SpeakerIcon className="w-4 h-4" /> Громкость
        </label>
        <input
          id="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={musicVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
      </div>
       <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
       `}</style>
    </div>
  );
};

export default MusicMenu;
