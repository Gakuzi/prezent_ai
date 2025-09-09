

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadedImage, ChatMessage, Slide, AnalysisProgress, ExportFormat, VoiceSettings, ApiKey, GithubUser, AppSettings, SyncStatus, LogEntry } from './types';
import * as gemini from './services/geminiService';
import * as location from './services/locationService';
import * as github from './services/githubService';
import * as imageSearchService from './services/imageSearchService';
import { parseSlidesFromJson } from './utils/planParser';
import { exportToPdf, exportToPptx, exportToHtml } from './services/exportService';
import { LoggerProvider, useLogger } from './context/LoggerContext'; 
import logger from './services/logger';

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
import ConfigErrorModal from './components/ConfigErrorModal';
import StatusBar from './components/StatusBar';
import LogViewerModal from './components/LogViewerModal';
import ErrorDetailModal from './components/ErrorDetailModal';


type AppState = 'concept' | 'generating_plan' | 'upload' | 'analyzing' | 'chat' | 'presentation' | 'error';
type VideoGenState = 'idle' | 'generating' | 'success' | 'error';
type AuthState = 'unauthenticated' | 'authenticated' | null;
type InitState = 'initializing' | 'ready';
type SettingsTab = 'api' | 'voice' | 'integrations' | 'account';

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
    pexelsApiKey: null,
    geminiModel: 'gemini-2.5-flash',
    geminiEndpoint: 'generativelanguage.googleapis.com/v1beta',
};

const AppContent: React.FC = () => {
    const { 
        logs, 
        clearLogs, 
        detailedLog, 
        setDetailedLog, 
        detailedError, 
        setDetailedError 
    } = useLogger();

    const [initState, setInitState] = useState<InitState>('initializing');
    const [showSplash, setShowSplash] = useState(true);
    const [appState, setAppState] = useState<AppState>('concept');
    const [error, setError] = useState<string | null>(null);
    const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
    const [isQuotaErrorModalOpen, setIsQuotaErrorModalOpen] = useState(false);
    const [isConfigErrorModalOpen, setIsConfigErrorModalOpen] = useState(false);
    const [configErrorDetails, setConfigErrorDetails] = useState({ model: '', endpoint: '' });
    const [failedKeys, setFailedKeys] = useState<ApiKey[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('api');
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
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

    const openSettingsPanel = (tab: SettingsTab = 'api') => {
        setSettingsInitialTab(tab);
        setIsSettingsOpen(true);
    };

    const loadLocalSettings = useCallback((): AppSettings => {
        const localSettings = { ...DEFAULT_SETTINGS };
        try {
            const stored = localStorage.getItem('appSettings');
            if(stored) {
                const parsed = JSON.parse(stored);
                // Merge parsed settings with defaults to ensure all keys are present
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
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
            localStorage.setItem('appSettings', JSON.stringify(settings));
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
            logger.logInfo('Application initializing...');
            const pat = localStorage.getItem('githubPat');
            if (pat) {
                try {
                    setSyncStatus('syncing');
                    logger.logInfo('Found GitHub token, attempting to authenticate...');
                    const user = await github.getUser(pat);
                    setGithubPat(pat);
                    setGithubUser(user);

                    logger.logInfo(`Authenticated as ${user.login}. Fetching settings from Gist...`);
                    const result = await github.getSettingsFromGist(pat);
                    if (result) {
                        setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
                        setGistId(result.gistId);
                        setSyncStatus('success');
                         logger.logSuccess('Settings loaded from GitHub Gist.');
                    } else {
                        setSettings(loadLocalSettings());
                        setSyncStatus('idle');
                        logger.logInfo('No settings Gist found, using local settings.');
                    }
                    setAuthState('authenticated');
                    setShowSplash(false); 
                } catch (e) {
                    console.error("GitHub auth/fetch error. Using local settings.", e);
                    if (e instanceof github.GitHubAuthError) {
                        logger.logError('GitHub authentication failed. Logging out.');
                        handleLogout();
                    } else {
                        setAuthState('authenticated');
                        setShowSplash(false);
                        setSettings(loadLocalSettings());
                        setSyncStatus('error');
                        logger.logError('Failed to fetch settings from Gist, using local settings.');
                    }
                }
            } else {
                setSettings(loadLocalSettings());
                setAuthState('unauthenticated');
                 logger.logInfo('No GitHub token found. Awaiting user login.');
            }
            setInitState('ready');
            // Perform a health check on all keys after initial settings are loaded.
            // This runs in the background and doesn't block the UI.
            gemini.healthCheckAllKeys();
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
                logger.logInfo('Auto-syncing settings to GitHub Gist...');
                const newGistId = await github.saveSettings(githubPat, settingsRef.current, gistId);
                if (newGistId !== gistId) setGistId(newGistId);
                setSyncStatus('success');
                logger.logSuccess('Settings synchronized successfully.');
            } catch (e) {
                console.error("Auto-sync failed:", e);
                setSyncStatus('error');
                logger.logError(`Auto-sync failed: ${e instanceof Error ? e.message : String(e)}`);
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
                if (localStorage.getItem('appSettings') && settings.voiceSettings.voices[0]?.voiceURI) return true;

                const russianVoices = availableVoices.filter(v => v.lang.startsWith('ru'));
                if (russianVoices.length > 0) {
                    const bestVoice = russianVoices.find(v => v.name.includes('Google') || v.name.includes('Milena')) || russianVoices[0];
                    const defaultVoiceSettings = { ...settings.voiceSettings, voices: [{ voiceURI: bestVoice.voiceURI, rate: 1, pitch: 1 }] };
                    handleSettingsChange({...settings, voiceSettings: defaultVoiceSettings});
                }
                return true;
            };
            if (!setBestDefaultVoice()) {
                speechSynthesis.onvoiceschanged = setBestDefaultVoice;
            }
        };
        setupVoice();
    }, [settings.apiKeys, settings.pexelsApiKey, settings.voiceSettings, handleSettingsChange, authState, appState]);

    const handleError = (e: any, onRetry: (() => Promise<void> | void) | null = null) => {
        const message = e instanceof Error ? e.message : String(e);
        
        if (e instanceof gemini.ConfigError) {
            setConfigErrorDetails({ model: e.model, endpoint: e.endpoint });
            setIsConfigErrorModalOpen(true);
            if (onRetry) setRetryAction(() => onRetry);
            return;
        }
        
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
        
        setError(message);
        setAppState('error');
        if (onRetry) setRetryAction(() => onRetry);
    };

    const handleLogin = useCallback(async (pat: string): Promise<boolean> => {
        try {
            logger.logInfo('Attempting GitHub login...');
            const user = await github.getUser(pat);
            localStorage.setItem('githubPat', pat);
            setGithubPat(pat);
            setGithubUser(user);

            setSyncStatus('syncing');
            const result = await github.getSettingsFromGist(pat);
            if (result) {
                setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
                setGistId(result.gistId);
                setSyncStatus('success');
                 logger.logSuccess(`Login successful. Settings loaded for ${user.login}.`);
            } else {
                const localSettings = loadLocalSettings();
                setSettings(localSettings);
                setSyncStatus('idle'); 
                 logger.logSuccess(`Login successful. Using local settings for ${user.login}.`);
            }

            setAuthState('authenticated');
            setShowSplash(false);
            return true;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            logger.logError(`Login failed: ${message}`);
            console.error("Login attempt failed:", e);
            localStorage.removeItem('githubPat');
            return false;
        }
    }, [loadLocalSettings]);
    
    const resetState = useCallback(() => {
        logger.logInfo('Resetting application state.');
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
        setRetryAction(null);
        setIsQuotaErrorModalOpen(false);
        setIsConfigErrorModalOpen(false);
    }, []);

    const handleConceptSubmit = async (concept: string) => {
        setPresentationConcept(concept);
        setAppState('generating_plan');
        try {
            const response = await gemini.createInitialPlan(concept, settingsRef.current);
            setInitialStoryPlan(response.text);
            setAppState('upload');
        } catch (e) {
            handleError(e, () => handleConceptSubmit(concept));
        }
    };
    
    const handleUpload = async (images: UploadedImage[]) => {
        logger.logInfo(`Uploading ${images.length} images. Fetching location data...`);
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
        logger.logInfo(`Starting analysis of ${imagesToAnalyze.length} images.`);
        setAnalysisCursor({ imagesToAnalyze, currentIndex: 0, status: 'running' });
        setAnalysisProgress({ total: imagesToAnalyze.length + 1, currentIndex: 0, currentAction: 'Начинаю анализ...', matrixText: '', isSynthesizing: false });
        setEvolvingStorySummary('');
    };

    const resumeAnalysis = useCallback(() => {
        logger.logInfo('Resuming image analysis...');
        setAnalysisCursor(prev => ({ ...prev, status: 'running' }));
    }, []);

    useEffect(() => {
        if (analysisCursor.status !== 'running' || appState !== 'analyzing') return;

        const processNextImage = async () => {
            const currentImage = analysisCursor.imagesToAnalyze[analysisCursor.currentIndex];
            const previousImages = allUploadedImagesRef.current.filter(img => img.description);
            try {
                setAnalysisProgress(prev => ({ ...prev, currentAction: `Анализирую изображение ${prev.currentIndex + 1}...`, currentIndex: prev.currentIndex + 1 }));
                const { imageDescription, updatedStory } = await gemini.analyzeNextFrame(currentImage, previousImages, evolvingStorySummary, settingsRef.current);
                setAllUploadedImages(prev => prev.map(img => img.id === currentImage.id ? { ...img, description: imageDescription } : img));
                setEvolvingStorySummary(updatedStory);
                setAnalysisCursor(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
            } catch (e) {
                setAnalysisCursor(prev => ({ ...prev, status: 'paused' }));
                handleError(e, resumeAnalysis);
            }
        };

        const synthesizeFinalStory = async () => {
            const retrySynth = () => {
                logger.logInfo('Retrying final story synthesis.');
                setAnalysisCursor(prev => ({...prev, status: 'running' }));
            }
            try {
                setAnalysisProgress(prev => ({ ...prev, isSynthesizing: true, currentAction: 'Синтезирую финальный сценарий...', currentIndex: prev.total }));
                const analyzedImages = allUploadedImagesRef.current.filter(img => img.description);
                const response = await gemini.generateStoryboard(evolvingStorySummary, analyzedImages, settingsRef.current);
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
    }, [analysisCursor, appState, evolvingStorySummary, resumeAnalysis]);

    const handleSendMessage = async (message: string) => {
        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
        setChatMessages(prev => [...prev, userMessage]);
        setIsTyping(true);
        try {
            const response = await gemini.continueChat([...chatMessages, userMessage], allUploadedImages, slides, settingsRef.current);
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
        logger.logInfo('Finalizing presentation, suggesting music...');
        try {
            const response = await gemini.suggestMusic(presentationConcept, slides, settingsRef.current);
            const suggestions = JSON.parse(response.text);
            if (Array.isArray(suggestions)) {
                setMusicSuggestions(suggestions);
            }
        } catch (e) {
            console.error("Failed to get music suggestions:", e);
            logger.logError(`Failed to get music suggestions: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleOpenSearch = (query: string, slideIndex: number) => {
        logger.logInfo(`Opening image search for query: "${query}"`);
        setSearchQuery(query);
        setActiveSlideForImageAction(slideIndex);
        setIsSearchModalOpen(true);
    };

    const handleGenerateImage = async (prompt: string, slideIndex: number) => {
        setActiveSlideForImageAction(slideIndex);
        try {
            const base64Image = await gemini.generateImage(prompt);
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
        logger.logInfo(`Adding ${imagesToAdd.length} image(s) from search.`);
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
            logger.logInfo(`Image for slide ${activeSlideForImageAction + 1} changed.`);
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
            const operation = await gemini.generateVideo(slides, allUploadedImages, style);
            let videoOp = operation;
            for (let i = 0; i < 30; i++) { // Timeout after ~5 mins
                if (videoOp.done) break;
                setVideoProgress(prev => ({ ...prev, message: `Обработка видео... (попытка ${i + 1}/30)` }));
                await new Promise(resolve => setTimeout(resolve, 10000));
                videoOp = await gemini.checkVideoStatus(videoOp);
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
            <Header onRestart={resetState} onOpenSettings={() => openSettingsPanel()} />
            
            <main className="flex-grow flex flex-col items-center justify-center mb-[60px]"> {/* Add margin-bottom for StatusBar */}
                {appState === 'concept' && <ConceptInput onConceptSubmit={handleConceptSubmit} />}
                {appState === 'generating_plan' && <PlanGenerationLoader />}
                {appState === 'upload' && <ImageUploader initialPlan={initialStoryPlan} onUpload={handleUpload} />}
                {appState === 'analyzing' && <AnalysisLoader images={analysisCursor.imagesToAnalyze} allImages={allUploadedImages} progress={analysisProgress} evolvingStorySummary={evolvingStorySummary} />}
                {appState === 'chat' && <ChatWindow slides={slides} allImages={allUploadedImages} onSendMessage={handleSendMessage} onFinalize={handleFinalize} isTyping={isTyping} onSearch={handleOpenSearch} onGenerate={handleGenerateImage} onChangeImage={handleChangeImage} />}
                {appState === 'presentation' && <PresentationViewer slides={slides} images={allUploadedImages} onExport={handleExport} isExporting={isExporting} onRestart={resetState} onEditScript={() => setAppState('chat')} voiceSettings={settings.voiceSettings} onVoiceSettingsChange={v => handleSettingsChange({...settings, voiceSettings: v})} musicSuggestions={musicSuggestions} settings={settings} />}
                {appState === 'error' && <ErrorState error={error} onRetry={retryAction!} onOpenSettings={() => openSettingsPanel('api')} onRestart={resetState} />}
            </main>

            <ApiKeyModal isOpen={isApiKeyMissing} onClose={() => { setIsApiKeyMissing(false); openSettingsPanel('api'); }} message={null} />

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
                  openSettingsPanel('api');
              }}
              onClose={() => {
                  setIsQuotaErrorModalOpen(false);
                  setRetryAction(null);
              }}
            />
            
            <ConfigErrorModal
                isOpen={isConfigErrorModalOpen}
                errorDetails={configErrorDetails}
                onOpenSettings={() => {
                    setIsConfigErrorModalOpen(false);
                    openSettingsPanel('api');
                }}
                onClose={() => {
                    setIsConfigErrorModalOpen(false);
                    setRetryAction(null);
                }}
            />

            <SettingsPanel 
                isOpen={isSettingsOpen}
                onClose={() => {
                    setIsSettingsOpen(false);
                    if (retryAction && !isQuotaErrorModalOpen && !isConfigErrorModalOpen) {
                         if (failedKeys.length > 0) setIsQuotaErrorModalOpen(true);
                         else if (configErrorDetails.model) setIsConfigErrorModalOpen(true);
                    }
                }}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                githubUser={githubUser}
                onLogout={handleLogout}
                syncStatus={syncStatus}
                initialTab={settingsInitialTab}
            />
            
            <ImageSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} query={searchQuery} onAddImages={handleAddImagesFromSearch} />
            <ImagePickerModal isOpen={isImagePickerModalOpen} onClose={() => setIsImagePickerModalOpen(false)} images={allUploadedImages} onSelect={handleSelectImageFromPicker} />
            <VideoExportModal isOpen={isVideoModalOpen} onClose={() => { setIsVideoModalOpen(false); setIsExporting(false); }} onGenerate={handleGenerateVideo} />
            {videoGenState !== 'idle' && <VideoGenerationOverlay state={videoGenState} progress={videoProgress} onClose={closeVideoOverlay} />}
            
            <LogViewerModal isOpen={isLogViewerOpen} onClose={() => setIsLogViewerOpen(false)} />
            <ErrorDetailModal log={detailedError} onClose={() => setDetailedError(null)} />
            <ErrorDetailModal log={detailedLog} onClose={() => setDetailedLog(null)} isGeneric={true} />

            <StatusBar onOpenLogViewer={() => setIsLogViewerOpen(true)} />
        </div>
    );
};


const App: React.FC = () => (
    <LoggerProvider>
        <AppContent />
    </LoggerProvider>
);

export default App;