import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, UploadedImage, Slide } from '../types';
import { SparklesIcon, SearchIcon, RefreshIcon, EditIcon } from './icons';
import { isPexelsConfigured } from '../services/imageSearchService';

interface ChatWindowProps {
  slides: Slide[];
  allImages: UploadedImage[];
  onSendMessage: (text: string) => void;
  onFinalize: () => void;
  isTyping: boolean;
  onSearch: (query: string, slideIndex: number) => void;
  onGenerate: (prompt: string, slideIndex: number) => void;
  onChangeImage: (slideIndex: number) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  slides,
  allImages,
  onSendMessage, 
  onFinalize, 
  isTyping, 
  onSearch, 
  onGenerate,
  onChangeImage
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [lastSystemMessage, setLastSystemMessage] = useState("Вот первоначальный план вашей презентации. Вы можете попросить меня внести любые изменения: поменять порядок, переписать текст, добавить или удалить слайды. Когда все будет готово, нажмите 'Создать презентацию'.");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [slides, isTyping]);

  const handleSend = () => {
    if (input.trim() && !isTyping) {
      onSendMessage(input.trim());
      setInput('');
      setLastSystemMessage("Я обновил структуру презентации согласно вашим пожеланиям. Что-нибудь еще?");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col flex-grow bg-gray-800/50 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700 min-h-0">
      <div className="p-3 border-b border-gray-700">
        <h2 className="text-lg font-bold text-center text-white">Интерактивный редактор сценария</h2>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4" ref={messagesEndRef}>
        <div className="flex gap-3 items-start justify-start">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0"><SparklesIcon className="w-5 h-5 text-white" /></div>
            <div className="px-4 py-3 rounded-2xl max-w-2xl bg-gray-700 text-gray-200 rounded-bl-none">
                <p>{lastSystemMessage}</p>
            </div>
        </div>
        
        <div className="space-y-4">
            {slides.map((slide, index) => (
                <SlideCard 
                    key={index}
                    slide={slide}
                    slideIndex={index}
                    image={allImages.find(img => img.id === slide.imageId) || null}
                    onSearch={onSearch}
                    onGenerate={onGenerate}
                    onChangeImage={onChangeImage}
                    isProcessing={isTyping}
                />
            ))}
        </div>
        
        {isTyping && (
          <div className="flex items-center justify-center p-4">
              <div className="flex items-center gap-2 text-gray-400">
                  <RefreshIcon className="w-5 h-5 animate-spin" />
                  <span>Режиссер вносит правки...</span>
              </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-700 flex items-center gap-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Дайте режиссеру общее указание (например, 'Сделай историю короче')..."
          className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-full text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          disabled={isTyping}
        />
        <div className="flex items-center gap-2">
            <button onClick={handleSend} disabled={isTyping || !input.trim()} className="px-6 py-3 font-semibold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-gray-500 transition-colors">
              Обсудить с режиссером
            </button>
            <button onClick={onFinalize} disabled={isTyping || slides.some(s => s.needsImage)} title={slides.some(s => s.needsImage) ? "Добавьте изображения на все слайды" : "Создать презентацию"} className="px-6 py-3 font-semibold text-white bg-green-600 rounded-full hover:bg-green-700 disabled:bg-gray-500 transition-colors">
              Создать презентацию
            </button>
        </div>
      </div>
    </div>
  );
};


interface SlideCardProps {
    slide: Slide;
    slideIndex: number;
    image: UploadedImage | null;
    onSearch: (query: string, slideIndex: number) => void;
    onGenerate: (prompt: string, slideIndex: number) => void;
    onChangeImage: (slideIndex: number) => void;
    isProcessing: boolean;
}

const SlideCard: React.FC<SlideCardProps> = ({ slide, slideIndex, image, onSearch, onGenerate, onChangeImage, isProcessing }) => {
    const pexelsReady = isPexelsConfigured();
    
    return (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-4 flex gap-4 items-center">
            <div className="w-48 h-28 flex-shrink-0 bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden relative group">
                {image ? (
                  <>
                    <img src={`data:${image.file.type};base64,${image.base64}`} alt={slide.title} className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                            onClick={() => onChangeImage(slideIndex)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-black/60 rounded-full hover:bg-black/80 backdrop-blur-sm"
                        >
                            <EditIcon className="w-4 h-4" />
                            Изменить
                        </button>
                    </div>
                  </>
                ) : (
                    <div className="text-center p-2">
                        <p className="text-xs text-gray-400 mb-2">Требуется изображение</p>
                        {slide.suggestions?.search && (
                             <button
                                onClick={() => pexelsReady && onSearch(slide.suggestions.search || '', slideIndex)}
                                disabled={!pexelsReady || isProcessing}
                                title={!pexelsReady ? 'Для использования поиска необходим ключ Pexels API.' : `Найти: "${slide.suggestions.search}"`}
                                className="w-full inline-flex items-center justify-center gap-2 px-2 py-1.5 mb-1 text-xs font-semibold text-white bg-indigo-500 rounded-md hover:bg-indigo-600 transition-colors disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <SearchIcon className="w-4 h-4" /> Найти
                            </button>
                        )}
                        {slide.suggestions?.generate && (
                            <button
                                onClick={() => onGenerate(slide.suggestions.generate || '', slideIndex)}
                                disabled={isProcessing}
                                title={`Сгенерировать: "${slide.suggestions.generate}"`}
                                className="w-full inline-flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-semibold text-white bg-purple-500 rounded-md hover:bg-purple-600 transition-colors disabled:bg-gray-500"
                            >
                                <SparklesIcon className="w-4 h-4" /> Сгенерировать
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="flex-grow min-w-0">
                <span className="text-xs font-mono text-gray-500">СЛАЙД {slideIndex + 1}</span>
                <p className="w-full bg-transparent text-lg font-bold text-white p-0 mb-1">{slide.title}</p>
                <p className="w-full bg-transparent text-sm text-gray-300 p-0">{slide.script}</p>
            </div>
        </div>
    );
}


export default ChatWindow;
