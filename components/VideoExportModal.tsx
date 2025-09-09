import React, { useState } from 'react';
import { CloseIcon, VideoIcon } from './icons';

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (style: string) => void;
}

const videoStyles = [
  { id: 'cinematic', name: 'Кинематографичный', description: 'Эмоциональный, с плавными переходами и драматизмом.' },
  { id: 'slideshow', name: 'Динамичное слайд-шоу', description: 'Энергичный, с быстрыми сменами кадров и яркими эффектами.' },
  { id: 'documentary', name: 'Документальный', description: 'Информативный, в спокойном и повествовательном тоне.' },
];

const VideoExportModal: React.FC<VideoExportModalProps> = ({ isOpen, onClose, onGenerate }) => {
  const [selectedStyle, setSelectedStyle] = useState<string>(videoStyles[0].id);

  if (!isOpen) return null;

  const handleGenerate = () => {
    onGenerate(selectedStyle);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-800 rounded-2xl shadow-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg"><VideoIcon className="w-6 h-6 text-indigo-400" /></div>
                <h2 className="text-xl font-bold text-white">Настройки экспорта видео</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
                <CloseIcon className="w-6 h-6" />
            </button>
          </div>
          
          <p className="text-gray-300 mb-6 text-sm">Выберите стиль для вашего видео. ИИ будет использовать его как основу для генерации визуального ряда, переходов и настроения.</p>

          <div className="space-y-3 mb-8">
            {videoStyles.map(style => (
              <label key={style.id} className={`flex items-center p-4 rounded-lg cursor-pointer transition-all border-2 ${selectedStyle === style.id ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 hover:bg-gray-700/50'}`}>
                <input
                  type="radio"
                  name="video-style"
                  value={style.id}
                  checked={selectedStyle === style.id}
                  onChange={() => setSelectedStyle(style.id)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center mr-4 ${selectedStyle === style.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600'}`}>
                  {selectedStyle === style.id && <div className="w-2 h-2 rounded-full bg-white"></div>}
                </div>
                <div>
                  <p className="font-semibold text-white">{style.name}</p>
                  <p className="text-sm text-gray-400">{style.description}</p>
                </div>
              </label>
            ))}
          </div>

          <button onClick={handleGenerate} className="w-full px-4 py-3 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-transform hover:scale-105">
            Начать генерацию
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoExportModal;