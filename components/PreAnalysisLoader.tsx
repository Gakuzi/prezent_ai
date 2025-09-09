import React, { useState, useEffect } from 'react';
import { BrainIcon } from './icons';

const messages = [
  "Инициализация нейросети...",
  "Загрузка когнитивных моделей...",
  "Построение визуального графа...",
  "Анализ пространственных данных...",
  "Калибровка семантических ядер...",
];

const PreAnalysisLoader: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setMessageIndex(prevIndex => (prevIndex + 1) % messages.length);
    }, 800); // Change message every 800ms

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full animate-fade-in-slow">
      <div className="relative flex items-center justify-center">
        {/* Animated background rings */}
        <div className="absolute w-64 h-64 border-2 border-indigo-500/30 rounded-full animate-ping-slow"></div>
        <div className="absolute w-48 h-48 border-2 border-indigo-500/40 rounded-full animate-ping-medium"></div>
        
        <BrainIcon className="w-24 h-24 text-indigo-400 animate-pulse" />
      </div>
      <p className="mt-8 text-xl text-gray-300 font-mono transition-opacity duration-500 text-center">
        {messages[messageIndex]}
      </p>

      <style>{`
        .animate-fade-in-slow { animation: fade-in 1s ease-in-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        
        .animate-ping-slow { animation: ping 3s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .animate-ping-medium { animation: ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite; animation-delay: 0.5s; }
        @keyframes ping {
          75%, 100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default PreAnalysisLoader;
