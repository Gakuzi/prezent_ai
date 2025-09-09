import React, { useRef, useEffect, useState } from 'react';
import { CloseIcon, DownloadIcon, CastIcon } from './icons';

interface VideoGenerationOverlayProps {
  state: 'generating' | 'success' | 'error';
  progress: { message: string; url: string | null; error: string | null };
  onClose: () => void;
}

const VideoGenerationOverlay: React.FC<VideoGenerationOverlayProps> = ({ state, progress, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canCast, setCanCast] = useState(false);

  useEffect(() => {
    // Check for Remote Playback API support
    // @ts-ignore
    if (videoRef.current && 'remote' in videoRef.current) {
        setCanCast(true);
    }
  }, [state]);

  const handleCast = () => {
    if (!videoRef.current || !canCast) return;
    try {
        // @ts-ignore
        videoRef.current.remote.prompt();
    } catch (error) {
        console.error("Could not start remote playback:", error);
        alert("Не удалось запустить трансляцию.");
    }
  };


  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-50 flex items-center justify-center p-8 text-white">
      <div className="text-center bg-gray-800/50 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-lg w-full">
        {state === 'generating' && (
          <>
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-400 mx-auto"></div>
            <h2 className="mt-6 text-2xl font-bold">Генерация видео...</h2>
            <p className="mt-2 text-gray-300">{progress.message}</p>
            <p className="mt-4 text-sm text-gray-500">Это может занять несколько минут. Пожалуйста, не закрывайте вкладку.</p>
          </>
        )}
        {state === 'success' && (
          <>
            <h2 className="text-3xl font-bold text-green-400 mb-4">Видео успешно создано!</h2>
             <div className="w-full aspect-video bg-black rounded-lg mb-4 border border-gray-600">
                <video ref={videoRef} src={progress.url!} controls autoPlay loop className="w-full h-full rounded-lg">
                    Ваш браузер не поддерживает тег video.
                </video>
            </div>
            <p className="text-sm text-gray-400 mb-6">Вы можете просмотреть результат выше. Ссылка для скачивания действительна в течение ограниченного времени.</p>
            <div className="flex items-center justify-center gap-4">
                 <a
                  href={progress.url!}
                  download="presentation.mp4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 text-lg font-bold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-transform hover:scale-105"
                >
                  <DownloadIcon className="w-6 h-6" />
                  Скачать
                </a>
                {canCast && (
                     <button
                        onClick={handleCast}
                        title="Транслировать на другое устройство"
                        className="inline-flex items-center gap-2 px-6 py-3 text-lg font-bold text-white bg-gray-600 rounded-full hover:bg-gray-700 transition-transform hover:scale-105"
                    >
                        <CastIcon className="w-6 h-6" />
                        Cast
                    </button>
                )}
            </div>
            <button onClick={onClose} className="mt-8 text-gray-400 hover:text-white block mx-auto">Закрыть</button>
          </>
        )}
        {state === 'error' && (
          <>
            <h2 className="text-3xl font-bold text-red-400 mb-4">Ошибка генерации</h2>
            <p className="text-gray-300 mb-6">{progress.error || 'Произошла неизвестная ошибка.'}</p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 px-6 py-2 text-md font-semibold text-white bg-gray-600 rounded-full hover:bg-gray-700"
            >
              <CloseIcon className="w-5 h-5" />
              Закрыть
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoGenerationOverlay;
