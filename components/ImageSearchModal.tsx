
import React, { useState, useEffect, useCallback } from 'react';
import { PexelsImage, PexelsResponse } from '../types';
import { searchPexelsImages, isPexelsConfigured } from '../services/imageSearchService';
import { CloseIcon, SearchIcon, RefreshIcon, CheckCircleIcon } from './icons';
import Loader from './Loader';

interface ImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onAddImages: (images: { url: string, query: string }[]) => void;
}

const ImageSearchModal: React.FC<ImageSearchModalProps> = ({ isOpen, onClose, query, onAddImages }) => {
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<PexelsImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }
    if (!isPexelsConfigured()) {
        setError("Ключ Pexels API не настроен. Пожалуйста, добавьте его в настройках.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setSelectedImages(new Set());
    try {
      const response: PexelsResponse = await searchPexelsImages(searchQuery);
      setResults(response.photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  useEffect(() => {
    if (isOpen && query) {
      performSearch();
    } else if (isOpen) {
        setResults([]);
        setError(null);
        setIsLoading(false);
        if(!isPexelsConfigured()) {
            setError("Ключ Pexels API не настроен. Пожалуйста, добавьте его в настройках.");
        }
    }
  }, [isOpen, query, performSearch]);
  
  const handleToggleSelection = (url: string) => {
      const newSelection = new Set(selectedImages);
      if (newSelection.has(url)) {
          newSelection.delete(url);
      } else {
          newSelection.add(url);
      }
      setSelectedImages(newSelection);
  };
  
  const handleAddClick = () => {
      const imagesToAdd = Array.from(selectedImages).map(url => ({ url, query: searchQuery }));
      onAddImages(imagesToAdd);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-[50px] bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full h-full max-w-4xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex-grow flex items-center gap-3">
            <SearchIcon className="w-6 h-6 text-indigo-400" />
            <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                placeholder="Поиск изображений на Pexels..."
                className="w-full bg-transparent text-lg font-semibold text-white focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={performSearch} className="p-2 rounded-full text-gray-300 hover:bg-gray-700"><RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
            <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </header>

        <main className="flex-grow p-4 overflow-y-auto custom-scrollbar">
          {isLoading && <div className="flex items-center justify-center h-full"><Loader message="Поиск..." /></div>}
          {error && <div className="flex items-center justify-center h-full text-red-400 text-center">{error}</div>}
          {!isLoading && !error && results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map(image => (
                <div 
                    key={image.id}
                    className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => handleToggleSelection(image.src.large)}
                >
                  <img src={image.src.medium} alt={image.alt} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  <div className={`absolute inset-0 transition-all duration-300 ${selectedImages.has(image.src.large) ? 'bg-black/20 ring-4 ring-indigo-500' : 'bg-black/60 group-hover:bg-black/40'}`}></div>
                  {selectedImages.has(image.src.large) && (
                    <CheckCircleIcon className="absolute top-2 right-2 w-7 h-7 text-white bg-indigo-600 rounded-full" />
                  )}
                   <a href={image.photographer_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-1 left-1 text-xs text-white bg-black/60 px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    © {image.photographer}
                  </a>
                </div>
              ))}
            </div>
          )}
           {!isLoading && !error && results.length === 0 && !searchQuery && (
             <div className="flex items-center justify-center h-full text-gray-500">
                <p>Введите запрос для поиска изображений.</p>
            </div>
           )}
           {!isLoading && !error && results.length === 0 && searchQuery && (
            <div className="flex items-center justify-center h-full text-gray-500">
                <p>Ничего не найдено по запросу "{searchQuery}". Попробуйте другие ключевые слова.</p>
            </div>
           )}
        </main>
        
        {selectedImages.size > 0 && (
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex items-center justify-between">
                <p className="text-sm text-gray-400">Выбрано изображений: {selectedImages.size}</p>
                 <button onClick={handleAddClick} className="px-6 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                    Добавить ({selectedImages.size})
                </button>
            </footer>
        )}
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
export default ImageSearchModal;