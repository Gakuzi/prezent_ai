
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadedImage, ChatMessage, Slide, AnalysisProgress, ExportFormat, VoiceSettings, ApiKey, GithubUser, ApiCallLog, AppSettings, SyncStatus } from './types';
import * as gemini from './services/geminiService';
import * as location from './services/locationService';
import * as github from './services/githubService';
import * as imageSearchService from './services/imageSearchService';
import { parseSlidesFromJson } from './utils/planParser';
import { exportToPdf, exportToPptx, exportToHtml } from './services/exportService';

import Header from './components/Header';
import ConceptInput from './components/ConceptInput';
import PlanGenerationLoader from './components/PlanGenerationLoader';
import ImageUploader from './components/ImageUploader';
import AnalysisLoader from './components/AnalysisLoader';
import ChatWindow from './components/ChatWindow';
import PresentationViewer from './components/PresentationViewer';
import ApiKeyModal from './components/ApiKeyModal';
import SettingsPanel from './components/SettingsPanel';
import ImageSearchModal from './components/ImageSearchModal';
import VideoExportModal from './components/VideoExportModal';
import VideoGenerationOverlay from './components/VideoGenerationOverlay';
import GitHubAuthModal from './components/GitHubAuthModal';
import SplashScreen from './components/SplashScreen';
import ErrorState from './components/ErrorState';
import Loader from './components/Loader';
import ImagePickerModal from './components/ImagePickerModal';
import QuotaErrorModal from './components/QuotaErrorModal';

type AppState = 'concept' | 'generating_plan' | 'upload' | 'analyzing' | 'chat' | 'presentation' | 'error';
type VideoGenState = 'idle' | 'generating' | 'success' | 'error';
type AuthState = 'unauthenticated' | 'authenticated' | null;
type InitState = 'initializing' | 'ready';

interface AnalysisCursor {
    imagesToAnalyze: UploadedImage[];
    currentIndex: number;
    status: 'idle' | 'running' | 'paused' | 'done';
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = { 
    voices: [{ voiceURI: null, rate: 1, pitch: 1 }], 
    isPodcastMode: false,
    aiEnhancedNarration: true 
};

const DEFAULT_SETTINGS: AppSettings = {
    apiKeys: [],
    voiceSettings: DEFAULT_VOICE_SETTINGS,
    pexelsApiKey: null
};

const App: React.FC = () => {
    const [initState, setInitState] = useState<InitState>('initializing');
    const [showSplash, setShowSplash] = useState(true);
    const [appState, setAppState] = useState<AppState>('concept');
    const [error, setError] = useState<string | null>(null);
    const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
    const [isQuotaErrorModalOpen, setIsQuotaErrorModalOpen] = useState(false);
    const [failedKeys, setFailedKeys] = useState<ApiKey[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [retryAction, setRetryAction] = useState<(() => Promise<void> | void) | null>(null);
    
    const [presentationConcept, setPresentationConcept] = useState<string>('');
    const [initialStoryPlan, setInitialStoryPlan] = useState<string>('');

    const [allUploadedImages, setAllUploadedImages] = useState<UploadedImage[]>([]);
    const allUploadedImagesRef = useRef<UploadedImage[]>([]);
    useEffect(() => {
        allUploadedImagesRef.current = allUploadedImages;
    }, [allUploadedImages]);
    
    const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>({ currentIndex: 0, total: 0, currentAction: '', matrixText: '', isSynthesizing: false });
    const [analysisCursor, setAnalysisCursor] = useState<AnalysisCursor>({ imagesToAnalyze: [], currentIndex: 0, status: 'idle' });
    const [evolvingStorySummary, setEvolvingStorySummary] = useState<string>('');

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [slides, setSlides] = useState<Slide[]>([]);
    const [apiCallLogs, setApiCallLogs] = useState<ApiCallLog[]>([]);

    const [isExporting, setIsExporting] = useState(false);
    
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isImagePickerModalOpen, setIsImagePickerModalOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeSlideForImageAction, setActiveSlideForImageAction] = useState<number | null>(null);
    
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [videoGenState, setVideoGenState] = useState<VideoGenState>('idle');
    const [videoProgress, setVideoProgress] = useState({ message: '', url: null as string | null, error: null as string | null });
    const [musicSuggestions, setMusicSuggestions] = useState<string[]>([]);

    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const [authState, setAuthState] = useState<AuthState>(null);
    const [githubPat, setGithubPat] = useState<string | null>(null);
    const [githubUser, setGithubUser] = useState<GithubUser | null>(null);
    const [gistId, setGistId] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
    const isInitialMount = useRef(true);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    const loadLocalSettings = useCallback((): AppSettings => {
        const localSettings: AppSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        try {
            const storedKeys = localStorage.getItem('apiKeys');
            if (storedKeys) localSettings.apiKeys = JSON.parse(storedKeys);
            
            const storedVoice = localStorage.getItem('voiceSettings');
            if (storedVoice) {
                const parsedVoice = JSON.parse(storedVoice);
                 if (parsedVoice.hasOwnProperty('voiceURI')) { 
                    localSettings.voiceSettings = { ...DEFAULT_VOICE_SETTINGS, voices: [parsedVoice] };
                } else { 
                    localSettings.voiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...parsedVoice };
                }
            }

            const storedPexels = localStorage.getItem('pexelsApiKey');
            if (storedPexels) localSettings.pexelsApiKey = storedPexels;
        } catch (e) {
            console.error("Failed to parse local settings:", e);
        }
        return localSettings;
    }, []);

    const handleSettingsChange = useCallback((newSettings: AppSettings) => {
        setSettings(newSettings);
    }, []);
    
    useEffect(() => {
        try {
            localStorage.setItem('apiKeys', JSON.stringify(settings.apiKeys));
            localStorage.setItem('voiceSettings', JSON.stringify(settings.voiceSettings));
            localStorage.setItem('pexelsApiKey', settings.pexelsApiKey || '');
        } catch (e) {
            console.error("Failed to save settings to localStorage:", e);
        }
    }, [settings]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('githubPat');
        setGithubPat(null);
        setGithubUser(null);
        setGistId(null);
        setAuthState('unauthenticated');
        setShowSplash(true); 
        setSettings(loadLocalSettings());
    }, [loadLocalSettings]);
    
    useEffect(() => {
        const startup = async () => {
            const pat = localStorage.getItem('githubPat');
            if (pat) {
                try {
                    setSyncStatus('syncing');
                    const user = await github.getUser(pat);
                    setGithubPat(pat);
                    setGithubUser(user);

                    const result = await github.getSettingsFromGist(pat);
                    if (result) {
                        setSettings(result.settings);
                        setGistId(result.gistId);
                        setSyncStatus('success');
                    } else {
                        setSettings(loadLocalSettings());
                        setSyncStatus('idle');
                    }
                    setAuthState('authenticated');
                    setShowSplash(false); 
                } catch (e) {
                    console.error("GitHub auth/fetch error. Using local settings.", e);
                    if (e instanceof github.GitHubAuthError) {
                        handleLogout();
                    } else {
                        setAuthState('authenticated');
                        setShowSplash(false);
                        setSettings(loadLocalSettings());
                        setSyncStatus('error');
                    }
                }
            } else {
                setSettings(loadLocalSettings());
                setAuthState('unauthenticated');
            }
            setInitState('ready');
        };
        startup();
    }, [loadLocalSettings, handleLogout]);
    
    useEffect(() => {
        if (isInitialMount.current || authState !== 'authenticated' || !githubPat) {
            isInitialMount.current = false;
            return;
        }

        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        setSyncStatus('syncing');
        syncTimeoutRef.current = setTimeout(async () => {
            try {
                const newGistId = await github.saveSettings(githubPat, settingsRef.current, gistId);
                if (newGistId !== gistId) setGistId(newGistId);
                setSyncStatus('success');
            } catch (e) {
                console.error("Auto-sync failed:", e);
                setSyncStatus('error');
            }
        }, 2000);

        return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
    }, [settings, githubPat, gistId, authState]);

    useEffect(() => {
        gemini.initializeApiKeys(settings.apiKeys);
        imageSearchService.initializePexels(settings.pexelsApiKey);
        
        const hasGeminiKeys = settings.apiKeys.length > 0;
        if (!hasGeminiKeys && authState === 'authenticated' && appState !== 'concept' && appState !== 'error') {
             setIsApiKeyMissing(true);
        } else {
             setIsApiKeyMissing(false);
        }

        const setupVoice = () => {
            const setBestDefaultVoice = () => {
                const availableVoices = window.speechSynthesis.getVoices();
                if (availableVoices.length === 0) return false;
                if (localStorage.getItem('voiceSettings') && settings.voiceSettings.voices[0]?.voiceURI) return true;

                const russianVoices = availableVoices.filter(v => v.lang.startsWith('ru'));
                if (russianVoices.length > 0) {
                    const bestVoice = russianVoices.find(v => v.name.includes('Google') || v.name.includes('Milena')) || russianVoices[0];
                    const defaultSettings = { ...settings.voiceSettings, voices: [{ voiceURI: bestVoice.voiceURI, rate: 1, pitch: 1 }] };
                    handleSettingsChange({...settings, voiceSettings: defaultSettings});
                }
                return true;
            };
            if (!setBestDefaultVoice()) {
                speechSynthesis.onvoiceschanged = setBestDefaultVoice;
            }
        };
        setupVoice();
    }, [settings.apiKeys, settings.pexelsApiKey, settings.voiceSettings, handleSettingsChange, authState, appState]);


    const onApiLog = useCallback((log: Omit<ApiCallLog, 'timestamp'>) => {
        setApiCallLogs(prev => [...prev.slice(-20), { ...log, timestamp: Date.now() }]);
    }, []);

    const handleError = (e: any, onRetry: (() => Promise<void> | void) | null = null) => {
        console.error("handleError called with:", e);
        
        if (e instanceof gemini.AllKeysFailedError) {
            const updatedKeysFromError = e.failedKeys;
    
            handleSettingsChange({
                ...settingsRef.current,
                apiKeys: updatedKeysFromError
            });
            
            setFailedKeys(updatedKeysFromError);
            setIsQuotaErrorModalOpen(true);
            if (onRetry) setRetryAction(() => onRetry);
            return;
        }
        
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setAppState('error');
        if (onRetry) setRetryAction(() => onRetry);
    };

    const handleLogin = useCallback(async (pat: string): Promise<boolean> => {
        try {
            const user = await github.getUser(pat);
            localStorage.setItem('githubPat', pat);
            setGithubPat(pat);
            setGithubUser(user);

            setSyncStatus('syncing');
            const result = await github.getSettingsFromGist(pat);
            if (result) {
                setSettings(result.settings);
                setGistId(result.gistId);
                setSyncStatus('success');
            } else {
                const localSettings = loadLocalSettings();
                setSettings(localSettings);
                setSyncStatus('idle'); 
            }

            setAuthState('authenticated');
            setShowSplash(false);
            return true;
        } catch (e) {
            console.error("Login attempt failed:", e);
            localStorage.removeItem('githubPat');
            return false;
        }
    }, [loadLocalSettings]);
    
    const resetState = useCallback(() => {
        setAppState('concept');
        setError(null);
        setPresentationConcept('');
        setInitialStoryPlan('');
        setAllUploadedImages([]);
        setAnalysisProgress({ currentIndex: 0, total: 0, currentAction: '', matrixText: '', isSynthesizing: false });
        setAnalysisCursor({ imagesToAnalyze: [], currentIndex: 0, status: 'idle' });
        setEvolvingStorySummary('');
        setChatMessages([]);
        setSlides([]);
        setApiCallLogs([]);
        setRetryAction(null);
        setIsQuotaErrorModalOpen(false);
    }, []);

    const handleConceptSubmit = async (concept: string) => {
        setPresentationConcept(concept);
        setAppState('generating_plan');
        try {
            const response = await gemini.createInitialPlan(concept, onApiLog);
            setInitialStoryPlan(response.text);
            setAppState('upload');
        } catch (e) {
            handleError(e, () => handleConceptSubmit(concept));
        }
    };
    
    const handleUpload = async (images: UploadedImage[]) => {
        const imagesWithLocation = await Promise.all(images.map(async img => {
            if (img.exif?.latitude && img.exif?.longitude) {
                const locationDescription = await location.findLocationDetails(img.exif.latitude, img.exif.longitude);
                return { ...img, locationDescription };
            }
            return img;
        }));
        setAllUploadedImages(prev => [...prev, ...imagesWithLocation]);
        startAnalysis(imagesWithLocation);
        setAppState('analyzing');
    };

    const startAnalysis = (imagesToAnalyze: UploadedImage[]) => {
        setAnalysisCursor({ imagesToAnalyze, currentIndex: 0, status: 'running' });
        setAnalysisProgress({ total: imagesToAnalyze.length + 1, currentIndex: 0, currentAction: 'Начинаю анализ...', matrixText: '', isSynthesizing: false });
        setEvolvingStorySummary('');
    };

    const resumeAnalysis = useCallback(() => {
        setAnalysisCursor(prev => ({ ...prev, status: 'running' }));
    }, []);

    useEffect(() => {
        if (analysisCursor.status !== 'running' || appState !== 'analyzing') return;

        const processNextImage = async () => {
            const currentImage = analysisCursor.imagesToAnalyze[analysisCursor.currentIndex];
            const previousImages = allUploadedImagesRef.current.filter(img => img.description);
            try {
                setAnalysisProgress(prev => ({ ...prev, currentAction: `Анализирую изображение ${prev.currentIndex + 1}...`, currentIndex: prev.currentIndex + 1 }));
                const { imageDescription, updatedStory } = await gemini.analyzeNextFrame(currentImage, previousImages, evolvingStorySummary, onApiLog);
                setAllUploadedImages(prev => prev.map(img => img.id === currentImage.id ? { ...img, description: imageDescription } : img));
                setEvolvingStorySummary(updatedStory);
                setAnalysisCursor(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
            } catch (e) {
                setAnalysisCursor(prev => ({ ...prev, status: 'paused' }));
                handleError(e, resumeAnalysis);
            }
        };

        const synthesizeFinalStory = async () => {
            const retrySynth = () => setAnalysisCursor(prev => ({...prev, status: 'running' }));
            try {
                setAnalysisProgress(prev => ({ ...prev, isSynthesizing: true, currentAction: 'Синтезирую финальный сценарий...', currentIndex: prev.total }));
                const analyzedImages = allUploadedImagesRef.current.filter(img => img.description);
                const response = await gemini.generateStoryboard(evolvingStorySummary, analyzedImages, onApiLog);
                const parsedSlides = parseSlidesFromJson(response.text);
                setSlides(parsedSlides);
                setAppState('chat');
                setAnalysisCursor({ imagesToAnalyze: [], currentIndex: 0, status: 'done' });
            } catch (e) {
                setAnalysisCursor(prev => ({ ...prev, status: 'paused' }));
                handleError(e, retrySynth);
            }
        };

        if (analysisCursor.currentIndex >= analysisCursor.imagesToAnalyze.length) {
            synthesizeFinalStory();
        } else {
            processNextImage();
        }
    }, [analysisCursor, appState, evolvingStorySummary, onApiLog, resumeAnalysis]);

    const handleSendMessage = async (message: string) => {
        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatMessages(prev => [...prev, userMessage]);
        setIsTyping(true);
        try {
            const response = await gemini.continueChat([...chatMessages, userMessage], allUploadedImages, slides, onApiLog);
            const modelMessage: ChatMessage = { role: 'model', parts: [{ text: response.text }] };
            const updatedSlides = parseSlidesFromJson(response.text);
            setSlides(updatedSlides);
            setChatMessages(prev => [...prev, modelMessage]);
        } catch (e) {
            handleError(e, () => handleSendMessage(message));
            setChatMessages(prev => prev.slice(0, -1));
        } finally {
            setIsTyping(false);
        }
    };

    const handleFinalize = async () => {
        setAppState('presentation');
        try {
            const response = await gemini.suggestMusic(presentationConcept, slides, onApiLog);
            const suggestions = JSON.parse(response.text);
            if (Array.isArray(suggestions)) {
                setMusicSuggestions(suggestions);
            }
        } catch (e) {
            console.error("Failed to get music suggestions:", e);
        }
    };

    const handleOpenSearch = (query: string, slideIndex: number) => {
        setSearchQuery(query);
        setActiveSlideForImageAction(slideIndex);
        setIsSearchModalOpen(true);
    };

    const handleGenerateImage = async (prompt: string, slideIndex: number) => {
        setActiveSlideForImageAction(slideIndex);
        try {
            const base64Image = await gemini.generateImage(prompt, onApiLog);
            const newImage: UploadedImage = {
                id: crypto.randomUUID(),
                file: new File([], `${prompt.slice(0, 20)}.png`, { type: 'image/png' }),
                base64: base64Image,
                source: 'ai',
                query: prompt,
            };
            setAllUploadedImages(prev => [...prev, newImage]);
            setSlides(prevSlides => prevSlides.map((slide, index) => 
                index === slideIndex ? { ...slide, imageId: newImage.id, needsImage: false } : slide
            ));
        } catch (e) {
            handleError(e, () => handleGenerateImage(prompt, slideIndex));
        } finally {
            setActiveSlideForImageAction(null);
        }
    };
    
    const handleAddImagesFromSearch = async (imagesToAdd: {url: string, query: string}[]) => {
        if (activeSlideForImageAction === null) return;
        setIsSearchModalOpen(false);
        try {
            const imagePromises = imagesToAdd.map(async (img) => {
                const response = await fetch(img.url);
                const blob = await response.blob();
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                return { id: crypto.randomUUID(), file: new File([blob], `${img.query.slice(0,20)}.jpg`, { type: blob.type }), base64, source: 'ai', query: img.query } as UploadedImage;
            });
            const newImages = await Promise.all(imagePromises);
            setAllUploadedImages(prev => [...prev, ...newImages]);
            setSlides(prevSlides => prevSlides.map((slide, index) => 
                index === activeSlideForImageAction ? { ...slide, imageId: newImages[0].id, needsImage: false } : slide
            ));
        } catch (e) {
            handleError(e);
        } finally {
            setActiveSlideForImageAction(null);
        }
    };

    const handleChangeImage = (slideIndex: number) => {
        setActiveSlideForImageAction(slideIndex);
        setIsImagePickerModalOpen(true);
    };

    const handleSelectImageFromPicker = (imageId: string) => {
        if (activeSlideForImageAction !== null) {
            setSlides(prevSlides => prevSlides.map((slide, index) => 
                index === activeSlideForImageAction ? { ...slide, imageId, needsImage: false } : slide
            ));
        }
        setIsImagePickerModalOpen(false);
        setActiveSlideForImageAction(null);
    };

    const handleExport = async (format: ExportFormat) => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            if (format === 'pdf') await exportToPdf(slides, allUploadedImages);
            else if (format === 'pptx') await exportToPptx(slides, allUploadedImages, settings.voiceSettings.isPodcastMode);
            else if (format === 'html') await exportToHtml(slides, allUploadedImages, settings.voiceSettings);
            else if (format === 'video') setIsVideoModalOpen(true);
        } catch (e) {
            handleError(e);
        } finally {
            if (format !== 'video') setIsExporting(false);
        }
    };

    const handleGenerateVideo = async (style: string) => {
        setIsVideoModalOpen(false);
        setVideoGenState('generating');
        setVideoProgress({ message: 'Отправка запроса на генерацию...', url: null, error: null });
        try {
            const operation = await gemini.generateVideo(slides, allUploadedImages, style, onApiLog);
            let videoOp = operation;
            for (let i = 0; i < 30; i++) { // Timeout after ~5 mins
                if (videoOp.done) break;
                setVideoProgress(prev => ({ ...prev, message: `Обработка видео... (попытка ${i + 1}/30)` }));
                await new Promise(resolve => setTimeout(resolve, 10000));
                videoOp = await gemini.checkVideoStatus(videoOp, onApiLog);
            }
            if (videoOp.done && videoOp.response?.generatedVideos?.[0]?.video?.uri) {
                const keyToUse = gemini.getCurrentApiKey();
                if (!keyToUse) throw new Error("Нет ключа для скачивания видео.");
                const fullUrl = `${videoOp.response.generatedVideos[0].video.uri}&key=${keyToUse}`;
                setVideoProgress({ message: 'Готово!', url: fullUrl, error: null });
                setVideoGenState('success');
            } else {
                throw new Error(videoOp.error?.message || 'Не удалось сгенерировать видео за отведенное время.');
            }
        } catch(e) {
            const message = e instanceof Error ? e.message : String(e);
            setVideoProgress({ message: '', url: null, error: message });
            setVideoGenState('error');
        }
    };
    
    const closeVideoOverlay = () => {
        setVideoGenState('idle');
        setIsExporting(false);
    };

    if (initState === 'initializing' || authState === null) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
                <Loader message="Инициализация..." />
            </div>
        );
    }
    
    if (authState === 'unauthenticated') {
        if (showSplash) {
            return <SplashScreen onStart={() => setShowSplash(false)} />;
        }
        return <GitHubAuthModal onLogin={handleLogin} />;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen p-4 flex flex-col">
            <Header onRestart={resetState} onOpenSettings={() => setIsSettingsOpen(true)} />
            
            <main className="flex-grow flex flex-col items-center justify-center">
                {appState === 'concept' && <ConceptInput onConceptSubmit={handleConceptSubmit} />}
                {appState === 'generating_plan' && <PlanGenerationLoader />}
                {appState === 'upload' && <ImageUploader initialPlan={initialStoryPlan} onUpload={handleUpload} />}
                {appState === 'analyzing' && <AnalysisLoader images={analysisCursor.imagesToAnalyze} allImages={allUploadedImages} progress={analysisProgress} lastApiLog={apiCallLogs.length > 0 ? apiCallLogs[apiCallLogs.length - 1] : undefined} evolvingStorySummary={evolvingStorySummary} />}
                {appState === 'chat' && <ChatWindow slides={slides} allImages={allUploadedImages} onSendMessage={handleSendMessage} onFinalize={handleFinalize} isTyping={isTyping} onSearch={handleOpenSearch} onGenerate={handleGenerateImage} onChangeImage={handleChangeImage} />}
                {appState === 'presentation' && <PresentationViewer slides={slides} images={allUploadedImages} onExport={handleExport} isExporting={isExporting} onRestart={resetState} onEditScript={() => setAppState('chat')} voiceSettings={settings.voiceSettings} onVoiceSettingsChange={v => handleSettingsChange({...settings, voiceSettings: v})} musicSuggestions={musicSuggestions} onApiLog={onApiLog} />}
                {appState === 'error' && <ErrorState error={error} onRetry={retryAction!} onOpenSettings={() => setIsSettingsOpen(true)} onRestart={resetState} />}
            </main>

            <ApiKeyModal isOpen={isApiKeyMissing} onClose={() => { setIsApiKeyMissing(false); setIsSettingsOpen(true); }} message={null} />

            <QuotaErrorModal
              isOpen={isQuotaErrorModalOpen}
              failedKeys={failedKeys}
              onRetry={() => {
                  if (retryAction) {
                      setIsQuotaErrorModalOpen(false);
                      const action = retryAction;
                      setRetryAction(null);
                      action();
                  }
              }}
              onOpenSettings={() => {
                  setIsQuotaErrorModalOpen(false);
                  setIsSettingsOpen(true);
              }}
              onClose={() => {
                  setIsQuotaErrorModalOpen(false);
                  setRetryAction(null);
              }}
            />
            
            <SettingsPanel 
                isOpen={isSettingsOpen}
                onClose={() => {
                    setIsSettingsOpen(false);
                    if (retryAction && !isQuotaErrorModalOpen) {
                        setIsQuotaErrorModalOpen(true);
                    }
                }}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                githubUser={githubUser}
                onLogout={handleLogout}
                syncStatus={syncStatus}
            />
            
            <ImageSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} query={searchQuery} onAddImages={handleAddImagesFromSearch} />
            <ImagePickerModal isOpen={isImagePickerModalOpen} onClose={() => setIsImagePickerModalOpen(false)} images={allUploadedImages} onSelect={handleSelectImageFromPicker} />
            <VideoExportModal isOpen={isVideoModalOpen} onClose={() => { setIsVideoModalOpen(false); setIsExporting(false); }} onGenerate={handleGenerateVideo} />
            {videoGenState !== 'idle' && <VideoGenerationOverlay state={videoGenState} progress={videoProgress} onClose={closeVideoOverlay} />}
        </div>
    );
};

export default App;
