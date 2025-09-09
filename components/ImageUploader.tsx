import React, { useState } from 'react';
import { UploadedImage } from '../types';
import ImageSelectionTray from './ImageSelectionTray';
import { SparklesIcon } from './icons';

interface ImageUploaderProps {
  onUpload: (images: UploadedImage[]) => void;
  initialPlan: string | null;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onUpload, initialPlan }) => {
  const [allImages, setAllImages] = useState<UploadedImage[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const handleAddImages = (newImages: UploadedImage[]) => {
    setAllImages(prev => [...prev, ...newImages]);
  };

  const handleStartAnalysis = () => {
    if (selectedIndexes.size > 0) {
      const selectedImages = allImages.filter((_, index) => selectedIndexes.has(index));
      onUpload(selectedImages);
    }
  };
  
  const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
    const renderHtml = () => {
        if (!text) return { __html: '' };
        let html = text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/###\s*(.*$)/gm, '<h3 class="text-lg font-semibold text-indigo-300 mt-4 mb-2">$1</h3>')
            .replace(/##\s*(.*$)/gm, '<h2 class="text-xl font-bold text-indigo-200 mt-6 mb-3">$1</h2>')
            .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
            .replace(/^\* (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
            .replace(/\n/g, '<br />')
            .replace(/<br \/>(\s*<br \/>)+/g, '<br />');
        return { __html: html };
    };
    return <div className="prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={renderHtml()} />;
  };

  return (
    <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 h-[85vh]">
        {/* Left Column: AI Plan */}
        <div className="lg:col-span-1 bg-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-gray-700 flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-3 flex-shrink-0">План от ИИ-Режиссера</h2>
            <p className="text-sm text-gray-400 mb-4 flex-shrink-0">Следуйте этому плану, чтобы подобрать наиболее подходящие фотографии для вашей истории.</p>
            <div className="flex-grow overflow-y-auto pr-3 text-gray-300 custom-scrollbar">
                {initialPlan ? <MarkdownRenderer text={initialPlan} /> : <p>Загрузка плана...</p>}
            </div>
        </div>
        
        {/* Right Column: Uploader and Selector */}
        <div className="lg:col-span-2 flex flex-col min-h-0 gap-4">
            <div className="flex-shrink-0 flex justify-between items-center p-4 bg-gray-800/50 rounded-2xl border border-gray-700">
                <div>
                    <h2 className="text-xl font-bold">Загрузка и выбор изображений</h2>
                    <p className="text-sm text-gray-400">Добавьте фотографии и отметьте те, которые ИИ должен проанализировать.</p>
                </div>
                <button
                    onClick={handleStartAnalysis}
                    disabled={selectedIndexes.size === 0}
                    className="flex items-center gap-2 px-6 py-3 text-lg font-bold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    <SparklesIcon className="w-6 h-6" />
                    Анализировать ({selectedIndexes.size})
                </button>
            </div>
            
            <div className="flex-grow min-h-0">
                <ImageSelectionTray
                    allImages={allImages}
                    selectedIndexes={selectedIndexes}
                    onSelectionChange={setSelectedIndexes}
                    onAddImages={handleAddImages}
                    onReplaceImage={() => {}}
                    generatingImageIndex={null}
                />
            </div>
        </div>
        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 8px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
        `}</style>
    </div>
  );
};

export default ImageUploader;
