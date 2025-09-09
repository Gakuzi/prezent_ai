import React, { useState, useEffect } from 'react';
import { PexelsImage } from '../types';
import { searchPexelsImages } from '../services/imageSearchService';
import { CloseIcon, CheckCircleIcon, SearchIcon, WarningIcon } from './icons';

interface ImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onAddImages: (images: {url: string, query: string}[]) => void;
}

const ImageSearchModal: React.FC<ImageSearchModalProps> = ({ isOpen, onClose, query, onAddImages }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PexelsImage[]>([]);
  const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && query) {
      const performSearch = async () => {
        setIsLoading(true);
        setError(null);
        setResults([]);
        setSelectedImageUrls(new Set());
        try {
          const response = await searchPexelsImages(query);
          setResults(response.photos);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setIsLoading(false);
        }
      };
      performSearch();
    }
  }, [isOpen, query]);
  
  const handleToggleSelection = (url: string) => {
    const newSelection = new Set(selectedImageUrls);
    if (newSelection.has(url)) {
        newSelection.delete(url);
    } else {
        newSelection.add(url);
    }
    setSelectedImageUrls(newSelection);
  };

  const handleAddClick = () => {
    const imagesToAdd = Array.from(selectedImageUrls).map(url => ({ url, query }));
    onAddImages(imagesToAdd);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full h-full max-w-6xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-500/20 rounded-lg"><SearchIcon className="w-6 h-6 text-indigo-400" /></div>
             <div>
                <h2 className="text-xl font-bold text-white">Поиск изображений</h2>
                <p className="text-sm text-gray-400">Результаты для: "{query}"</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-grow p-4 overflow-y-auto">
            {isLoading && (
                 <div className="flex flex-col items-center justify-center h-full">
                    <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-indigo-400"></div>
                    <p className="mt-4 text-gray-300">Идет поиск...</p>
                 </div>
            )}
            {error && (
                 <div className="flex flex-col items-center justify-center h-full text-center">
                    <WarningIcon className="w-12 h-12 text-yellow-400 mb-4" />
                    <h3 className="text-lg font-semibold text-white">Не удалось выполнить поиск</h3>
                    <p className="text-sm text-yellow-300 bg-yellow-900/50 p-3 rounded-md mt-2 max-w-lg">{error}</p>
                    <p className="text-xs text-gray-400 mt-4">
                        Пожалуйста, проверьте встроенный ключ Pexels API или попробуйте снова позже.
                        <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline ml-1">Pexels API</a>
                    </p>
                 </div>
            )}
            {!isLoading && !error && results.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-gray-400">По вашему запросу ничего не найдено. Попробуйте изменить формулировку.</p>
                 </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {results.map(image => (
                    <div key={image.id} 
                         className="relative aspect-video rounded-lg overflow-hidden cursor-pointer group"
                         onClick={() => handleToggleSelection(image.src.large2x)}>
                        <img src={image.src.landscape} alt={image.alt} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div className={`absolute inset-0 transition-all duration-300 ${selectedImageUrls.has(image.src.large2x) ? 'bg-black/20 ring-4 ring-indigo-500' : 'bg-black/40 group-hover:bg-black/20'}`}></div>
                         {selectedImageUrls.has(image.src.large2x) && (
                            <CheckCircleIcon className="absolute top-1.5 right-1.5 w-6 h-6 text-white bg-indigo-600 rounded-full" />
                        )}
                        <a href={image.photographer_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
                            {image.photographer}
                        </a>
                    </div>
                ))}
            </div>
        </main>
        
        {selectedImageUrls.size > 0 && (
             <footer className="p-4 border-t border-gray-700 flex-shrink-0 flex items-center justify-between">
                <span className="font-semibold">{selectedImageUrls.size} изображение(й) выбрано</span>
                <button 
                    onClick={handleAddClick}
                    className="px-6 py-2 font-semibold text-white bg-green-600 rounded-full hover:bg-green-700 transition-transform hover:scale-105"
                >
                    Добавить в презентацию
                </button>
             </footer>
        )}
      </div>
    </div>
  );
};

export default ImageSearchModal;