import React, { useState, useEffect, useRef } from 'react';
import { SparklesIcon, MicrophoneIcon } from './icons';

// FIX: Add a minimal interface for SpeechRecognition to satisfy TypeScript, as Web Speech API types may not be available.
interface SpeechRecognition {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: (event: any) => void;
  onresult: (event: any) => void;
  start: () => void;
  stop: () => void;
}

interface ConceptInputProps {
  onConceptSubmit: (concept: string) => void;
}

const ConceptInput: React.FC<ConceptInputProps> = ({ onConceptSubmit }) => {
  const [concept, setConcept] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // FIX: Access SpeechRecognition via `(window as any)` to handle vendor prefixes and avoid TypeScript errors.
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      setIsVoiceSupported(true);
      const recognition: SpeechRecognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.lang = 'ru-RU';
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setConcept(prev => prev ? `${prev} ${transcript}` : transcript);
      };
      recognitionRef.current = recognition;
    } else {
        setIsVoiceSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleVoiceInput = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    } else if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };
  
  const handleSubmit = () => {
    if (concept.trim()) {
        onConceptSubmit(concept.trim());
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center">
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">С чего начнем?</h1>
      <p className="text-lg text-gray-400 mb-8">Опишите идею вашей презентации. Что вы хотите рассказать? Какое настроение создать?</p>

      <div className="w-full bg-gray-800/50 backdrop-blur-md rounded-2xl p-4 border border-gray-700 shadow-2xl">
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder="Например: 'Хочу сделать захватывающую презентацию о моем недавнем путешествии по Италии, показать красоту Рима и Флоренции и рассказать о местной кухне.'"
          className="w-full h-40 p-4 bg-gray-900/50 rounded-lg text-lg text-gray-200 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-500"
        />
        <div className="flex items-center justify-between mt-3">
            <button 
                onClick={handleVoiceInput}
                disabled={!isVoiceSupported}
                title={!isVoiceSupported ? "Голосовой ввод не поддерживается вашим браузером или не предоставлено разрешение." : "Начать/остановить голосовой ввод"}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
            >
                <MicrophoneIcon className="w-5 h-5" />
                <span>{isListening ? 'Идет запись...' : 'Голосовой ввод'}</span>
            </button>
            <button 
                onClick={handleSubmit}
                disabled={!concept.trim()}
                className="flex items-center gap-2 px-8 py-3 text-lg font-bold text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
                <SparklesIcon className="w-6 h-6" />
                Создать план с ИИ
            </button>
        </div>
      </div>
    </div>
  );
};

export default ConceptInput;