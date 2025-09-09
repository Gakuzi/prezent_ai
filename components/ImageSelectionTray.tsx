import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadedImage, ExifData } from '../types';
import { CheckCircleIcon, PaperclipIcon, RefreshIcon, ChevronDownIcon, SparklesIcon } from './icons';
import exifr from 'exifr';

interface ImageSelectionTrayProps {
  allImages: UploadedImage[];
  selectedIndexes: Set<number>;
  onSelectionChange: (newSelection: Set<number>) => void;
  onAddImages: (images: UploadedImage[]) => void;
  onReplaceImage: (imageIndex: number) => void;
  generatingImageIndex: number | null;
}

const ImageSelectionTray: React.FC<ImageSelectionTrayProps> = ({ 
    allImages, 
    selectedIndexes, 
    onSelectionChange, 
    onAddImages,
    onReplaceImage,
    generatingImageIndex
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleToggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndexes);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    onSelectionChange(newSelection);
  };
  
  const handleReplaceClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation(); // Prevent toggling selection
    if (generatingImageIndex !== null) return; // Prevent multiple requests
    onReplaceImage(index);
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    try {
        const filePromises = acceptedFiles.map(file => {
          return new Promise<UploadedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const base64 = (reader.result as string).split(',')[1];
                if (!base64) return reject(new Error('Не удалось прочитать файл.'));

                let exif: ExifData | undefined = undefined;
                try {
                  const exifData = await exifr.parse(file);
                  if (exifData) {
                      exif = {
                        latitude: exifData.latitude,
                        longitude: exifData.longitude,
                        DateTimeOriginal: exifData.DateTimeOriginal,
                        Make: exifData.Make,
                        Model: exifData.Model,
                      };
                  }
                } catch (exifError) {
                  console.warn(`Could not parse EXIF for ${file.name}:`, exifError);
                }
                resolve({ id: crypto.randomUUID(), file, base64, exif, source: 'user' });
              } catch (error) { reject(error); }
            };
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
          });
        });
        const newImages = await Promise.all(filePromises);
        onAddImages(newImages);
    } catch (error) {
        console.error("Error processing dropped files in tray:", error);
        alert("Произошла ошибка при обработке добавленных файлов. Проверьте консоль для деталей.");
    }
  }, [onAddImages]);

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.webp'] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div className={`w-full flex-shrink-0 bg-gray-800/50 backdrop-blur-md rounded-2xl p-4 border border-gray-700 transition-all duration-300 ${isCollapsed ? 'max-h-24' : 'max-h-96'}`}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Выбор изображений ({selectedIndexes.size} / {allImages.length})</h3>
          <p className="text-sm text-gray-400">Отметьте фотографии для включения в сценарий.</p>
        </div>
        <div className="flex items-center gap-2">
            <button
                onClick={open}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
            >
                <PaperclipIcon className="w-5 h-5" />
                Добавить фото
            </button>
             <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-2 text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                title={isCollapsed ? "Развернуть" : "Свернуть"}
            >
                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>
        </div>
      </div>
       <div {...getRootProps({ className: `relative p-2 rounded-lg border-2 border-dashed transition-colors ${isDragActive ? 'border-indigo-400' : 'border-transparent'} ${isCollapsed ? 'overflow-hidden h-0 p-0 mb-0' : ''}`})}>
        <input {...getInputProps()} />
        <div className="flex gap-3 overflow-x-auto pb-2">
            {allImages.map((image, index) => (
            <div
                key={image.id}
                onClick={() => handleToggleSelection(index)}
                className="relative flex-shrink-0 w-24 h-24 md:w-28 md:h-28 rounded-lg overflow-hidden cursor-pointer group"
            >
                <img
                src={`data:${image.file.type};base64,${image.base64}`}
                alt={`Image ${index + 1}`}
                className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110"
                />
                <div className={`absolute inset-0 transition-all duration-300 ${selectedIndexes.has(index) ? 'bg-black/20 ring-4 ring-indigo-500' : 'bg-black/60 group-hover:bg-black/40'}`}></div>
                
                {selectedIndexes.has(index) && (
                    <CheckCircleIcon className="absolute top-1.5 right-1.5 w-6 h-6 text-white bg-indigo-600 rounded-full" />
                )}

                {image.source === 'ai' && (
                    <>
                        <div title="Сгенерировано ИИ" className="absolute bottom-1 left-1 p-1 bg-black/50 rounded-full"><SparklesIcon className="w-4 h-4 text-indigo-300"/></div>
                        <button
                            onClick={(e) => handleReplaceClick(e, index)}
                            disabled={generatingImageIndex !== null}
                            title="Заменить изображение"
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshIcon className={`w-6 h-6 text-white ${generatingImageIndex === index ? 'animate-spin' : ''}`} />
                        </button>
                    </>
                )}
                 {generatingImageIndex === index && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <RefreshIcon className="w-8 h-8 text-white animate-spin" />
                    </div>
                 )}
            </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ImageSelectionTray;