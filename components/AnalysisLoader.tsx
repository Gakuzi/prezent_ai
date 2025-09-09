import React, { useState, useEffect, useRef } from 'react';
import { UploadedImage, AnalysisProgress, ApiCallLog } from '../types';
import { CheckCircleIcon, WarningIcon, XCircleIcon, RefreshIcon } from './icons';
import Loader from './Loader';

const maskKey = (key: string) => {
    if (key.length < 8) return '****';
    if (key === 'system') return 'Система';
    return `...${key.slice(-4)}`;
};

const ApiStatusLine: React.FC<{ log?: ApiCallLog }> = ({ log }) => {
    if (!log) return null;

    const getStatusIcon = (status: ApiCallLog['status']) => {
        switch(status) {
            case 'attempting': return <RefreshIcon className="w-4 h-4 text-blue-400 animate-spin" />;
            case 'success': return <CheckCircleIcon className="w-4 h-4 text-green-400" />;
            case 'failed': return <XCircleIcon className="w-4 h-4 text-red-400" />;
            case 'info': return <WarningIcon className="w-4 h-4 text-gray-400" />;
            default: return null;
        }
    };

    return (
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-black/70 backdrop-blur-sm p-2 flex items-center justify-between font-mono text-xs text-gray-300">
            <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusIcon(log.status)}
                    <span className="font-bold text-indigo-300">[{maskKey(log.key)}]</span>
                </div>
                <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{log.message}</span>
            </div>
        </div>
    );
};

interface AnalysisLoaderProps {
  images: UploadedImage[];
  allImages: UploadedImage[];
  progress: AnalysisProgress;
  lastApiLog?: ApiCallLog;
  evolvingStorySummary: string;
}

const AnalysisLoader: React.FC<AnalysisLoaderProps> = ({ images, allImages, progress, lastApiLog, evolvingStorySummary }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const activeThumbnailRef = useRef<HTMLButtonElement>(null);
  
  const currentImageInView = images[currentImageIndex];
  const fullCurrentImage = allImages.find(img => img.id === currentImageInView?.id) || currentImageInView;

    useEffect(() => {
        // Automatically move the view to the slide being processed
        if (progress.currentIndex > 0 && progress.currentIndex <= images.length) {
            setCurrentImageIndex(progress.currentIndex - 1);
        }
    }, [progress.currentIndex, images.length]);

  useEffect(() => {
    activeThumbnailRef.current?.scrollIntoView({
        behavior: 'smooth', inline: 'center', block: 'nearest'
    });
  }, [currentImageIndex]);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col h-[85vh]">
      <div className="flex-shrink-0 mb-3 text-white">
        <h2 className="text-xl font-bold text-center mb-3">
            {progress.isSynthesizing ? "Синтез финального сюжета..." : `Анализ изображений... (${progress.currentIndex}/${progress.total})`}
        </h2>
        <div className="w-full bg-gray-700/50 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${(progress.currentIndex / progress.total) * 100}%` }}></div>
        </div>
      </div>
      
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Main Content: Image Preview */}
        <div className="lg:col-span-2 w-full relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
            {fullCurrentImage && (
                <img
                    key={fullCurrentImage.id}
                    src={`data:${fullCurrentImage.file.type};base64,${fullCurrentImage.base64}`}
                    alt={`Анализ изображения ${currentImageIndex + 1}`}
                    className="absolute w-full h-full object-contain animate-fade-in"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
            
            <div className="absolute bottom-12 left-0 right-0 p-6 text-white text-shadow-glow">
              {fullCurrentImage?.description ? (
                <p className="text-lg md:text-xl max-w-4xl animate-text-in">{fullCurrentImage.description}</p>
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                    <RefreshIcon className="w-5 h-5 animate-spin" />
                    <span>ИИ-режиссер описывает кадр...</span>
                </div>
              )}
            </div>
            <ApiStatusLine log={lastApiLog} />
        </div>

        {/* Sidebar: Story Plan */}
        <div className="lg:col-span-1 flex flex-col bg-gray-900/50 rounded-2xl border border-gray-700 p-4 min-h-0">
            <h3 className="text-lg font-semibold text-indigo-300 mb-2 flex-shrink-0">Развитие сюжета</h3>
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                {evolvingStorySummary ? (
                    <p className="text-gray-300 whitespace-pre-wrap">{evolvingStorySummary}</p>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <Loader message="Создание сюжета..." />
                    </div>
                )}
            </div>
        </div>
      </div>
       
       <div className="flex-shrink-0 w-full bg-gray-800/50 backdrop-blur-sm rounded-xl p-2 mt-3">
            <div className="flex items-center gap-3 overflow-x-auto pb-1 custom-scrollbar">
                {images.map((thumbImage, index) => {
                    const isAnalyzed = !!allImages.find(i => i.id === thumbImage.id)?.description;
                    const isActive = index === currentImageIndex;
                    return (
                        <button
                            key={thumbImage.id}
                            ref={isActive ? activeThumbnailRef : null}
                            onClick={() => setCurrentImageIndex(index)}
                            className={`relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 focus:outline-none focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 ${isActive ? 'ring-4 ring-indigo-500' : 'ring-1 ring-white/20 hover:ring-white/50'}`}
                            aria-label={`Перейти к кадру ${index + 1}`}
                        >
                            <img src={`data:${thumbImage.file.type};base64,${thumbImage.base64}`} alt={`Превью кадра ${index + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors"></div>
                            {isAnalyzed && (
                                <CheckCircleIcon className="absolute top-1 right-1 w-5 h-5 text-white bg-green-600 rounded-full" />
                            )}
                            <span className="absolute bottom-1 left-1 text-xs font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                {index + 1}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>

       <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.7s ease-in-out; }
        .animate-text-in { animation: text-in 0.5s ease-out forwards; opacity: 0; }
        @keyframes text-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .text-shadow-glow { text-shadow: 0 0 12px rgba(0, 0, 0, 0.8); }
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
       `}</style>
    </div>
  );
};

export default AnalysisLoader;
