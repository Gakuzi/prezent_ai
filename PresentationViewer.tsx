import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Slide, UploadedImage, ExportFormat, MusicTrack, VoiceSettings, ApiCallLog } from '../types';
import * as gemini from '../services/geminiService';
import ExportMenu from './ExportMenu';
import MusicMenu from './MusicMenu';
import VoiceSettingsMenu from './VoiceSettingsMenu';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, PauseIcon, SpeakerIcon, FullscreenIcon, FullscreenExitIcon, EditIcon, RefreshIcon } from './icons';

const allAvailableMusic: MusicTrack[] = [
    { name: "Cinematic Ambient", url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp3", moods: ["cinematic", "ambient", "reflective"] },
    { name: "Upbeat Corporate", url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp3", moods: ["upbeat", "corporate", "inspirational"] },
    { name: "Reflective Piano", url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp3", moods: ["reflective", "piano", "dramatic"] },
    { name: "Energetic Electronic", url: "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", moods: ["electronic", "upbeat", "corporate"] },
];

interface PresentationViewerProps {
  slides: Slide[];
  images: UploadedImage[];
  onExport: (format: ExportFormat) => void;
  isExporting: boolean;
  onRestart: () => void;
  onEditScript: () => void;
  voiceSettings: VoiceSettings;
  onVoiceSettingsChange: (settings: VoiceSettings) => void;
  musicSuggestions: string[];
  onApiLog: (log: Omit<ApiCallLog, 'timestamp'>) => void;
}

const PresentationViewer: React.FC<PresentationViewerProps> = ({ slides, images, onExport, isExporting, onRestart, onEditScript, voiceSettings, onVoiceSettingsChange, musicSuggestions, onApiLog }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [previousSlideIndex, setPreviousSlideIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparingSpeech, setIsPreparingSpeech] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [isMusicMenuOpen, setIsMusicMenuOpen] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement>(null);
  const presentationContainerRef = useRef<HTMLDivElement>(null);

  const currentSlide = slides[currentSlideIndex];
  const currentImage = images.find(img => img.id === currentSlide?.imageId) || null;
  
  const previousSlide = previousSlideIndex !== null ? slides[previousSlideIndex] : null;
  const previousImage = previousSlide ? images.find(img => img.id === previousSlide.imageId) : null;

  const speak = useCallback(async (text: string, speakerIndex: number = 0) => {
    speechSynthesis.cancel();
    
    let textToSpeak = text.replace(/[*_#`]/g, '');

    if (voiceSettings.aiEnhancedNarration) {
        setIsPreparingSpeech(true);
        try {
            const response = await gemini.generateSsmlScript(textToSpeak, onApiLog);
            textToSpeak = response.text;
        } catch (error) {
            console.error("Failed to generate SSML script, falling back to plain text:", error);
        } finally {
            setIsPreparingSpeech(false);
        }
    }
    
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    const speakerProfile = voiceSettings.voices[speakerIndex] || voiceSettings.voices[0];
    if (!speakerProfile) {
        console.warn("No voice profiles configured.");
        return;
    }

    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.voiceURI === speakerProfile.voiceURI);
    
    utterance.voice = selectedVoice || null;
    utterance.rate = speakerProfile.rate;
    utterance.pitch = speakerProfile.pitch;
    utterance.lang = 'ru-RU';

    utterance.onend = () => {
        if (isPlaying) {
             const nextIndex = currentSlideIndex + 1;
             if (nextIndex < slides.length) {
                setPreviousSlideIndex(currentSlideIndex);
                setCurrentSlideIndex(nextIndex);
             } else {
                setIsPlaying(false);
             }
        }
    };
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [voiceSettings, isPlaying, onApiLog, slides.length, currentSlideIndex]);

  const handleSetCurrentSlide = (index: number) => {
      if (index === currentSlideIndex) return;
      speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPreparingSpeech(false);
      setPreviousSlideIndex(currentSlideIndex);
      setCurrentSlideIndex(index);
  }

  const handleNext = () => handleSetCurrentSlide((currentSlideIndex + 1) % slides.length);
  const handlePrev = () => handleSetCurrentSlide((currentSlideIndex - 1 + slides.length) % slides.length);
  
  const handleTogglePlay = () => {
    const wasPlaying = isPlaying;
    setIsPlaying(prev => !prev);
    if (!wasPlaying) {
        if (currentSlideIndex >= slides.length - 1) {
            setPreviousSlideIndex(null);
            setCurrentSlideIndex(0);
        }
    } else {
      speechSynthesis.cancel();
      setIsPreparingSpeech(false);
    }
  };

  useEffect(() => {
    if (isPlaying && currentSlide && !isPreparingSpeech) {
      const scriptToSpeak = voiceSettings.isPodcastMode && currentSlide.podcastScript ? currentSlide.podcastScript : currentSlide.script;
      speak(scriptToSpeak, currentSlide.speaker);
    } else if (!isPlaying) {
      speechSynthesis.cancel();
    }
  }, [currentSlide, isPlaying, isPreparingSpeech, voiceSettings.isPodcastMode, speak]);


  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const playAudio = () => {
        audioEl.play().catch(e => console.error("Audio play failed:", e));
    };

    if (selectedMusic) {
        if (audioEl.src !== selectedMusic.url) {
            audioEl.src = selectedMusic.url;
            audioEl.load();
            if (isPlaying) {
                playAudio();
            }
        } else if (isPlaying && audioEl.paused) {
            playAudio();
        } else if (!isPlaying && !audioEl.paused) {
            audioEl.pause();
        }
    } else {
         audioEl.pause();
         audioEl.src = '';
    }
  }, [selectedMusic, isPlaying]);
  
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    activeThumbnailRef.current?.scrollIntoView({
        behavior: 'smooth', inline: 'center', block: 'nearest'
    });
  }, [currentSlideIndex]);

  const handleFullscreenChange = () => {
    setIsFullscreen(!!document.fullscreenElement);
  };

  const handleToggleFullscreen = () => {
    if (!presentationContainerRef.current) return;
    if (isFullscreen) {
        document.exitFullscreen();
    } else {
        presentationContainerRef.current.requestFullscreen();
    }
  };
  
  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!currentSlide) {
    return <div>Загрузка слайдов...</div>;
  }
  
  const recommendedMusic = allAvailableMusic.filter(track => track.moods.some(mood => musicSuggestions.includes(mood)));
  const otherMusic = allAvailableMusic.filter(track => !recommendedMusic.includes(track));

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col flex-grow min-h-0">
      <audio ref={audioRef} loop />
      <div ref={presentationContainerRef} className="flex-grow relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-700 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
            {previousImage && <img key={previousImage.id} src={`data:${previousImage.file.type};base64,${previousImage.base64}`} alt="" className="slide-image-base slide-image-exit" />}
            {currentImage && <img key={currentImage.id} src={`data:${currentImage.file.type};base64,${currentImage.base64}`} alt={currentSlide.title} className="slide-image-base slide-image-enter" />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
        
        <div className="relative w-full h-full p-8 md:p-12 flex flex-col justify-between text-white text-shadow-glow">
          <div></div>
          <div className="flex justify-between items-end">
            <div className="max-w-[70%]">
                 <h2 key={`title-${currentSlideIndex}`} className="text-3xl md:text-5xl font-bold mb-4 animate-text-in">{currentSlide.title}</h2>
                 {currentSlide.textOverlay && (
                    <div key={`overlay-${currentSlideIndex}`} className="animate-overlay-in p-3 bg-black/40 backdrop-blur-sm rounded-lg">
                        <p className="text-lg md:text-xl">{currentSlide.textOverlay}</p>
                    </div>
                )}
            </div>
          </div>
        </div>
        {isPreparingSpeech && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
                <div className="flex items-center gap-3 text-lg">
                    <RefreshIcon className="w-6 h-6 animate-spin" />
                    <span>Улучшаю голос диктора...</span>
                </div>
            </div>
        )}
      </div>

      <div className="flex-shrink-0 mt-3 space-y-3">
        <div className="w-full bg-gray-800/30 backdrop-blur-sm rounded-xl p-2">
            <div className="flex items-center gap-3 overflow-x-auto pb-1 custom-scrollbar">
                {slides.map((thumbSlide, index) => {
                    const thumbImage = images.find(img => img.id === thumbSlide.imageId);
                    const isActive = index === currentSlideIndex;
                    return (
                        <button
                            key={index}
                            ref={isActive ? activeThumbnailRef : null}
                            onClick={() => handleSetCurrentSlide(index)}
                            className={`relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden transition-all duration-200 focus:outline-none focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 ${isActive ? 'ring-4 ring-indigo-500' : 'ring-1 ring-white/20 hover:ring-white/50'}`}
                            aria-label={`Перейти к слайду ${index + 1}`}
                        >
                            {thumbImage ? (
                                <img src={`data:${thumbImage.file.type};base64,${thumbImage.base64}`} alt={`Превью слайда ${index + 1}`} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gray-700 flex items-center justify-center"><span className="text-xs text-gray-400">Нет фото</span></div>
                            )}
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors"></div>
                            <span className="absolute bottom-1 right-1 text-xs font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">{index + 1}</span>
                        </button>
                    );
                })}
            </div>
        </div>

        <div className="p-3 bg-gray-800/50 backdrop-blur-md rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
                <ExportMenu onExport={onExport} isExporting={isExporting} />
                <button onClick={onEditScript} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"><EditIcon className="w-5 h-5" /> Сценарий</button>
                <div className="relative">
                    <button onClick={() => setIsMusicMenuOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"><SpeakerIcon className="w-5 h-5" /> Музыка</button>
                    <MusicMenu isOpen={isMusicMenuOpen} onClose={() => setIsMusicMenuOpen(false)} recommendedMusic={recommendedMusic} otherMusic={otherMusic} selectedMusic={selectedMusic} onMusicChange={setSelectedMusic} musicVolume={musicVolume} onVolumeChange={setMusicVolume}/>
                </div>
                 <div className="relative">
                    <button onClick={() => setIsVoiceMenuOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Голос</button>
                    <VoiceSettingsMenu isOpen={isVoiceMenuOpen} onClose={() => setIsVoiceMenuOpen(false)} voiceSettings={voiceSettings.voices[currentSlide.speaker] || voiceSettings.voices[0]} onVoiceSettingsChange={() => {}} />
                </div>
                <div className="flex items-center gap-2 pl-2 border-l border-gray-700">
                    <label htmlFor="podcast-toggle" className="text-sm font-semibold text-white cursor-pointer">Режим подкаста</label>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="podcast-toggle" className="sr-only peer" checked={voiceSettings.isPodcastMode} onChange={() => onVoiceSettingsChange({...voiceSettings, isPodcastMode: !voiceSettings.isPodcastMode})} />
                        <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <button onClick={handlePrev} className="p-3 bg-gray-700/50 rounded-full hover:bg-gray-700"><ChevronLeftIcon className="w-6 h-6" /></button>
                <button onClick={handleTogglePlay} disabled={isPreparingSpeech} className="p-3 bg-indigo-600 rounded-full hover:bg-indigo-700 disabled:bg-gray-500">{isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}</button>
                <button onClick={handleNext} className="p-3 bg-gray-700/50 rounded-full hover:bg-gray-700"><ChevronRightIcon className="w-6 h-6" /></button>
            </div>

            <div className="flex items-center gap-4">
                <span className="text-sm font-mono">{currentSlideIndex + 1} / {slides.length}</span>
                <button onClick={handleToggleFullscreen} className="p-2 text-white bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors" title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}>
                    {isFullscreen ? <FullscreenExitIcon className="w-6 h-6" /> : <FullscreenIcon className="w-6 h-6" />}
                </button>
                <button onClick={onRestart} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600/80 rounded-lg hover:bg-indigo-700 transition-colors">Начать заново</button>
            </div>
        </div>
      </div>
      <style>{`
        .slide-image-base { position: absolute; max-width: 100%; max-height: 100%; object-fit: contain; transition: opacity 0.8s ease-in-out; }
        .slide-image-enter { z-index: 10; opacity: 1; animation: kenburns 20s ease-out forwards; }
        .slide-image-exit { z-index: 5; opacity: 0; }
        .animate-text-in { animation: text-in 0.8s ease-out forwards; opacity: 0; animation-fill-mode: forwards; }
        .animate-overlay-in { animation: text-in 0.8s ease-out 0.3s forwards; opacity: 0; animation-fill-mode: forwards; }
        @keyframes text-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kenburns { 0% { transform: scale(1) translate(0, 0); } 100% { transform: scale(1.08) translate(-1%, 1%); } }
        .text-shadow-glow { text-shadow: 0 0 12px rgba(0, 0, 0, 0.8); }
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
       `}</style>
    </div>
  );
};

export default PresentationViewer;