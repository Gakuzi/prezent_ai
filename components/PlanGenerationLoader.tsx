import React, { useState, useEffect } from 'react';
import { BrainIcon } from './icons';

const messages = [
  "Анализирую вашу идею...",
  "Подбираю структуру повествования...",
  "Создаю концепцию визуального ряда...",
  "Формулирую ключевые моменты...",
  "Продумываю драматургию...",
  "Готовлю режиссерский план..."
];

const PlanGenerationLoader: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setMessageIndex(prevIndex => (prevIndex + 1));
    }, 1500);

    return () => clearInterval(intervalId);
  }, []);
  
  const currentMessage = messages[messageIndex % messages.length];

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center p-4 text-center animate-fade-in-slow">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-64 h-64 border-2 border-indigo-500/30 rounded-full animate-ping-slow"></div>
        <div className="absolute w-48 h-48 border-2 border-indigo-500/40 rounded-full animate-ping-medium"></div>
        <BrainIcon className="w-24 h-24 text-indigo-400 animate-pulse" />
      </div>
      <h2 className="mt-8 text-2xl text-white font-bold">ИИ-Режиссер за работой</h2>
      <p key={currentMessage} className="mt-2 text-lg text-gray-300 font-mono transition-opacity duration-500 animate-text-in">
        {currentMessage}
      </p>

      <style>{`
        .animate-fade-in-slow { animation: fade-in 1s ease-in-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        
        .animate-text-in { animation: text-in 0.5s ease-out; }
        @keyframes text-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

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

export default PlanGenerationLoader;
