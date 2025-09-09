import React, { useState, useEffect } from 'react';
import { LogoIcon } from './icons';

const features = [
  "Загрузите ваши фотографии, чтобы начать...",
  "Наш ИИ проанализирует каждое изображение, находя детали и эмоции.",
  "Создайте увлекательный сюжет вместе с ИИ-режиссером.",
  "Сгенерируйте готовую презентацию с озвучкой и музыкой.",
  "Экспортируйте результат в PDF, PowerPoint или видео.",
];

interface SplashScreenProps {
  onStart: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onStart }) => {
  const [featureIndex, setFeatureIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAnimationRunning, setIsAnimationRunning] = useState(true);

  useEffect(() => {
    if (!isAnimationRunning) return;

    const typingSpeed = 80;
    const deletingSpeed = 40;
    const delay = 2000;

    const handleTyping = () => {
      const currentFeature = features[featureIndex % features.length];
      
      if (isDeleting) {
        if (displayedText.length > 0) {
          setDisplayedText(current => current.substring(0, current.length - 1));
        } else {
          setIsDeleting(false);
          setFeatureIndex(prev => prev + 1);
        }
      } else { // Typing
        if (displayedText.length < currentFeature.length) {
          setDisplayedText(current => currentFeature.substring(0, current.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), delay);
        }
      }
    };

    const timeout = setTimeout(handleTyping, isDeleting ? deletingSpeed : typingSpeed);
    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, featureIndex, isAnimationRunning]);

  const handleStartClick = () => {
      setIsAnimationRunning(false);
      onStart();
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4">
       <div className="relative flex items-center justify-center mb-8">
            <div className="absolute w-72 h-72 border-2 border-indigo-500/20 rounded-full animate-ping-slow"></div>
            <div className="absolute w-56 h-56 border-2 border-indigo-500/30 rounded-full animate-ping-medium"></div>
            <LogoIcon className="w-24 h-24 text-indigo-400" />
      </div>
      
      <h1 className="text-4xl font-bold text-white mb-2">Мастер Презентаций ИИ</h1>
      <p className="text-lg text-gray-400 mb-8">Вдохните жизнь в ваши фотографии</p>
      
      <div className="w-full max-w-2xl text-center h-16 sm:h-12 flex items-center justify-center mb-8">
        <p className="text-xl text-gray-300 font-mono transition-opacity duration-500">
            {displayedText}
            <span className="animate-pulse">|</span>
        </p>
      </div>

      <button
          onClick={handleStartClick}
          className="px-8 py-4 text-xl font-bold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-transform hover:scale-105 animate-fade-in"
      >
          Начать работу
      </button>

      <div className="absolute bottom-8 text-xs text-gray-600">
        {isAnimationRunning ? 'Демонстрация возможностей...' : 'Готов к работе'}
      </div>

      <style>{`
        .animate-fade-in { animation: fade-in-btn 0.5s ease-in-out; }
        @keyframes fade-in-btn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-ping-slow { animation: ping 3.5s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .animate-ping-medium { animation: ping 3s cubic-bezier(0, 0, 0.2, 1) infinite; animation-delay: 0.5s; }
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;