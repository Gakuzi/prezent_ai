
import React from 'react';
import { UploadedImage } from '../types';
import { CloseIcon, ImageIcon } from './icons';

interface ImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: UploadedImage[];
  onSelect: (imageId: string) => void;
}

const ImagePickerModal: React.FC<ImagePickerModalProps> = ({ isOpen, onClose, images, onSelect }) => {
  if (!isOpen) return null;

  const userImages = images.filter(img => img.source === 'user');
  const aiImages = images.filter(img => img.source === 'ai');

  return (
    <div className="fixed top-0 left-0 right-0 bottom-[50px] bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full h-full max-w-4xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-500/20 rounded-lg"><ImageIcon className="w-6 h-6 text-indigo-400" /></div>
             <h2 className="text-xl font-bold text-white">Выбрать изображение из загруженных</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-grow p-4 overflow-y-auto custom-scrollbar">
            {userImages.length > 0 && (
                 <div>
                    <h3 className="text-lg font-semibold text-gray-300 mb-3">Ваши фотографии</h3>
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {userImages.map(image => (
                            <div key={image.id} 
                                className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                                onClick={() => onSelect(image.id)}>
                                <img src={`data:${image.file.type};base64,${image.base64}`} alt={image.file.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-indigo-900/40 transition-colors"></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
           
            {aiImages.length > 0 && (
                 <div className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-300 mb-3">Сгенерированные ИИ</h3>
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {aiImages.map(image => (
                            <div key={image.id} 
                                className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
                                onClick={() => onSelect(image.id)}>
                                <img src={`data:${image.file.type};base64,${image.base64}`} alt={image.query || 'ai-image'} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-indigo-900/40 transition-colors"></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {images.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Нет загруженных изображений.</p>
                </div>
            )}
        </main>
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

export default ImagePickerModal;