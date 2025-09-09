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
    const [appState, setAppState] = useState<AppState>('concept');
    const [error, setError] = useState<string | null>(null);
    const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
    const [isQuotaErrorModalOpen, setIsQuotaErrorModalOpen] = useState(false);
    const [failedKeys, setFailedKeys] = useState<ApiKey[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(null);
    
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

    // --- Centralized Settings State ---
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const settingsRef = useRef(settings);
    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    // --- GitHub Sync State ---
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

    const handleLogout = useCallback(() => {
        localStorage.removeItem('githubPat');
        setGithubPat(null);
        setGithubUser(null);
        setGistId(null);
        setAuthState('unauthenticated');
        setSettings(loadLocalSettings());
    }, [loadLocalSettings]);
    
    const handleSettingsChange = useCallback((newSettings: AppSettings) => {
        setSettings(newSettings);
        
        // Also update local storage as a fallback
        localStorage.setItem('apiKeys', JSON.stringify(newSettings.apiKeys));
        localStorage.setItem('voiceSettings', JSON.stringify(newSettings.voiceSettings));
        localStorage.setItem('pexelsApiKey', newSettings.pexelsApiKey || '');

    }, []);

    // Startup logic for authentication and settings loading
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
                        setSyncStatus('idle'); // No gist found, idle until first save
                    }
                    setAuthState('authenticated');
                } catch (e) {
                    console.error("GitHub auth/fetch error. Using local settings.", e);
                    if (e instanceof github.GitHubAuthError) {
                        handleLogout();
                    } else {
                        setAuthState('authenticated'); // Stay authenticated, but show sync error
                        setSettings(loadLocalSettings());
                        setSyncStatus('error');
                    }
                }
            } else {
                setSettings(loadLocalSettings());
                setAuthState('unauthenticated');
            }
        };
        startup();
    }, [loadLocalSettings, handleLogout]);
    
    // Auto-sync settings to GitHub on change
    useEffect(() => {
        if (isInitialMount.current || authState !== 'authenticated' || !githubPat) {
            isInitialMount.current = false;
            return;
        }

        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }

        setSyncStatus('syncing');
        syncTimeoutRef.current = setTimeout(async () => {
            try {
                // Use settingsRef to ensure the latest state is saved
                const newGistId = await github.saveSettings(githubPat, settingsRef.current, gistId);
                if (newGistId !== gistId) setGistId(newGistId);
                setSyncStatus('success');
            } catch (e) {
                console.error("Auto-sync failed:", e);
                setSyncStatus('error');
            }
        }, 2000); // 2-second debounce

        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [settings, githubPat, gistId, authState]);

    // Effect to update services when settings change
    useEffect(() => {
        gemini.initializeApiKeys(settings.apiKeys, (updatedKeys) => {
            handleSettingsChange({ ...settings, apiKeys: [...updatedKeys] });
        });
        imageSearchService.initializePexels(settings.pexelsApiKey);

        if (settings.apiKeys.length === 0 && authState === 'authenticated' && appState !== 'concept' && appState !== 'error') {
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
    }, [settings, handleSettingsChange, authState, appState]);


    const onApiLog = useCallback((log: Omit<ApiCallLog, 'timestamp'>) => {
        setApiCallLogs(prev => [...prev.slice(-20), { ...log, timestamp: Date.now() }]);
    }, []);

    const handleError = (e: any, onRetry: (() => Promise<void>) | null = null) => {
        console.error("handleError called with:", e);
        
        if (e instanceof gemini.AllKeysFailedError) {
            setFailedKeys(e.failedKeys);
            setIsQuotaErrorModalOpen(true);
            setRetryAction(() => onRetry);
            return;
        }

        let errorMessage = e.message || 'Произошла неизвестная ошибка.';
        if (typeof errorMessage === 'string') {
            const lowerCaseError = errorMessage.toLowerCase();
            if (lowerCaseError.includes('network request failed') || lowerCaseError.includes('fetch') || lowerCaseError.includes('сеть')) {
                errorMessage += '\n\n💡 Совет: Не удалось подключиться к серверам ИИ. Проверьте ваше интернет-соединение.';
            }
        }
        
        setRetryAction(() => onRetry);
        setError(errorMessage);
        setAppState('error');
    };
    
    useEffect(() => {
        if (appState !== 'analyzing' || analysisCursor.status !== 'running') {
            return;
        }

        const processAnalysisStep = async () => {
            const { imagesToAnalyze, currentIndex } = analysisCursor;

            if (currentIndex < imagesToAnalyze.length) {
                const image = imagesToAnalyze[currentIndex];
                setAnalysisProgress({
                    currentIndex: currentIndex + 1,
                    total: imagesToAnalyze.length,
                    currentAction: `Анализ кадра ${currentIndex + 1} из ${imagesToAnalyze.length}`,
                    matrixText: '',
                });

                try {
                    const previousImages = allUploadedImagesRef.current
                        .filter(img => imagesToAnalyze.slice(0, currentIndex).some(prevImg => prevImg.id === img.id));
                    
                    const response = await gemini.analyzeNextFrame(image, previousImages, evolvingStorySummary, onApiLog);
                    
                    setAllUploadedImages(prev =>
                        prev.map(img => img.id === image.id ? { ...img, description: response.imageDescription } : img)
                    );
                    setEvolvingStorySummary(response.updatedStory);

                    setAnalysisCursor(c => ({ ...c, currentIndex: c.currentIndex + 1 }));
                } catch (e) {
                    setAnalysisCursor(c => ({ ...c, status: 'paused' }));
                    const retryCurrentStep = () => {
                        setError(null);
                        setIsQuotaErrorModalOpen(false);
                        setAppState('analyzing');
                        setAnalysisCursor(c => ({ ...c, status: 'running' }));
                        return Promise.resolve();
                    };
                    handleError(e, retryCurrentStep);
                }
                return;
            }

            if (currentIndex === imagesToAnalyze.length) {
                setAnalysisCursor(c => ({ ...c, status: 'done' }));
                setAnalysisProgress(p => ({ ...p, isSynthesizing: true }));
                
                try {
                    const finalStory = evolvingStorySummary;
                    const response = await gemini.generateStoryboard(finalStory, imagesToAnalyze, onApiLog);
                    const parsedSlides = parseSlidesFromJson(response.text);
                    setSlides(parsedSlides);
                    
                    const systemMessage = "Вот первоначальный план вашей презентации. Вы можете попросить меня внести любые изменения: поменять порядок, переписать текст, добавить или удалить слайды. Когда все будет готово, нажмите 'Создать презентацию'.";
                    setChatMessages([{ role: 'system', parts: [{ text: systemMessage }] }]);

                    setAppState('chat');
                    setAnalysisCursor({ imagesToAnalyze: [], currentIndex: 0, status: 'idle' });
                } catch (e) {
                    const retryStoryboardGeneration = async () => {
                         setError(null);
                         setIsQuotaErrorModalOpen(false);
                         setAppState('analyzing');
                         setAnalysisProgress(p => ({ ...p, isSynthesizing: true }));
                         setAnalysisCursor({
                            imagesToAnalyze: imagesToAnalyze,
                            currentIndex: imagesToAnalyze.length,
                            status: 'running'
                         });
                    };
                    handleError(e, retryStoryboardGeneration);
                }
            }
        };

        processAnalysisStep();

    }, [appState, analysisCursor, onApiLog, evolvingStorySummary]);


    const startAnalysis = async (imagesToAnalyze: UploadedImage[]) => {
        setAppState('analyzing');
        setError(null);
        setIsQuotaErrorModalOpen(false);
        setApiCallLogs([]);
        setChatMessages([]);
        setEvolvingStorySummary(initialStoryPlan);
        setSlides([]);
        
        const imageIdsToAnalyze = new Set(imagesToAnalyze.map(i => i.id));
        setAllUploadedImages(prev => prev.map(img => 
            imageIdsToAnalyze.has(img.id) ? { ...img, description: undefined } : img
        ));

        setAnalysisCursor({
            imagesToAnalyze: imagesToAnalyze,
            currentIndex: 0,
            status: 'running',
        });
    };
    
    const handleRestart = () => {
        setAppState('concept');
        setError(null);
        setIsQuotaErrorModalOpen(false);
        setAllUploadedImages([]);
        setChatMessages([]);
        setSlides([]);
        setIsTyping(false);
        setApiCallLogs([]);
        setRetryAction(null);
        setAnalysisCursor({ imagesToAnalyze: [], currentIndex: 0, status: 'idle' });
        setEvolvingStorySummary('');
        setPresentationConcept('');
        setInitialStoryPlan('');
    };

    const enrichImagesWithLocationInBackground = async (images: UploadedImage[]) => {
        for (const image of images) {
            if (image.exif?.latitude && image.exif?.longitude) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1100));
                    const locationDescription = await location.findLocationDetails(image.exif.latitude, image.exif.longitude);
                    if (locationDescription) {
                        setAllUploadedImages(prevImages =>
                            prevImages.map(img =>
                                img.id === image.id ? { ...img, locationDescription } : img
                            )
                        );
                    }
                } catch (err) {
                    console.error(`Failed to get location details for image ${image.id}:`, err);
                }
            }
        }
    };
    
    const handleConceptSubmit = async (concept: string) => {
        setPresentationConcept(concept);
        setAppState('generating_plan');
        setError(null);
        setIsQuotaErrorModalOpen(false);
        setApiCallLogs([]);

        const submitAction = async () => {
            try {
                const response = await gemini.createInitialPlan(concept, onApiLog);
                setInitialStoryPlan(response.text);
                setAppState('upload');
            } catch (e) {
                setAppState('concept');
                handleError(e, submitAction);
            }
        };

        await submitAction();
    };

    const handleImagesUpload = async (images: UploadedImage[]) => {
        if (images.length === 0) return;
        
        setAllUploadedImages(images);
        setAppState('analyzing');
    
        enrichImagesWithLocationInBackground(images);
        
        startAnalysis(images);
    };

    const handleSendMessage = async (text: string) => {
        const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', parts: [{ text }] }];
        setChatMessages(newMessages);
        setIsTyping(true);
        setApiCallLogs([]);
        
        const sendMessageAction = async () => {
            try {
                const response = await gemini.continueChat(newMessages, allUploadedImages, slides, onApiLog);
                
                const responseText = response.text;
                
                const updatedSlides = parseSlidesFromJson(responseText);
                setSlides(updatedSlides);
                
                const systemMessage = "Я обновил структуру презентации согласно вашим пожеланиям. Что-нибудь еще?";
                setChatMessages(prev => [...prev, { role: 'model', parts: [{ text: systemMessage }] }]);

                setAppState('chat'); 
            } catch(e) {
                handleError(e, sendMessageAction);
            } finally {
                setIsTyping(false);
            }
        };

        await sendMessageAction();
    };
    
    const handleFinalizeScript = async () => {
        setIsTyping(true);
        try {
            const response = await gemini.suggestMusic(presentationConcept, slides, onApiLog);
            const suggestions = JSON.parse(response.text);
            setMusicSuggestions(suggestions);
        } catch(e) {
            console.error("Failed to get music suggestions:", e);
            setMusicSuggestions([]);
        } finally {
            setIsTyping(false);
            setAppState('presentation');
        }
    };
    
    const handleExport = async (format: ExportFormat) => {
        if (isExporting) return;
        
        if (format === 'video') {
            setIsVideoModalOpen(true);
            return;
        }
        setIsExporting(true);
        try {
            if (format === 'pdf') {
                await exportToPdf(slides, allUploadedImages);
            } else if (format === 'pptx') {
                await exportToPptx(slides, allUploadedImages, settings.voiceSettings.isPodcastMode);
            } else if (format === 'html') {
                await exportToHtml(slides, allUploadedImages, settings.voiceSettings);
            } else if (format === 'gsheets') {
                alert("Экспорт в Google Slides — сложная функция, запланированная для будущих обновлений.");
            } else if (format === 'link') {
                alert("Создание публичных ссылок требует серверной инфраструктуры и будет рассмотрено в будущих версиях.");
            }
        } catch (e) {
            console.error("Export failed:", e);
            alert("Не удалось экспортировать презентацию.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleLogin = async (pat: string): Promise<boolean> => {
        try {
            const user = await github.getUser(pat);
            localStorage.setItem('githubPat', pat);
            setGithubPat(pat);
            setGithubUser(user);
            
            const result = await github.getSettingsFromGist(pat);
            if (result) {
                handleSettingsChange(result.settings);
                setGistId(result.gistId);
            } else {
                // If no gist is found, we sync the current local settings immediately
                const localSettings = loadLocalSettings();
                handleSettingsChange(localSettings);
                const newGistId = await github.saveSettings(pat, localSettings, null);
                setGistId(newGistId);
            }

            setAuthState('authenticated');
            return true;
        } catch (err: any) {
            console.error("GitHub auth error:", err);
            alert(`Не удалось войти: ${err.message}`);
            return false;
        }
    };
    
    const urlToUploadedImage = async (url: string, query: string, source: 'ai' | 'user'): Promise<UploadedImage> => {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], `${query.replace(/\s/g, '_')}_${Date.now()}.jpg`, { type: blob.type });
    
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                if (!base64) {
                    return reject(new Error('Failed to read file as base64.'));
                }
                const newImage: UploadedImage = {
                    id: crypto.randomUUID(),
                    file,
                    base64,
                    source,
                    query,
                };
                resolve(newImage);
            };
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };
    
    const handleAddImageToSlide = (newImage: UploadedImage, slideIndex: number) => {
        setAllUploadedImages(prev => [...prev, newImage]);
        
        setSlides(prevSlides => prevSlides.map((slide, index) => {
            if (index === slideIndex) {
                return { ...slide, imageId: newImage.id, needsImage: false };
            }
            return slide;
        }));
    };

    const handleAddImagesFromSearch = async (images: {url: string, query: string}[]) => {
        setIsSearchModalOpen(false);
        if (activeSlideForImageAction === null) return;

        try {
            if (images.length > 0) {
                const newUploadedImage = await urlToUploadedImage(images[0].url, images[0].query, 'user');
                handleAddImageToSlide(newUploadedImage, activeSlideForImageAction);
            }
        } catch (error) {
            console.error("Failed to process images from search:", error);
            alert("Не удалось добавить изображения из поиска.");
        } finally {
            setActiveSlideForImageAction(null);
        }
    };
    
    const handleGenerateImageForSlide = async (prompt: string, slideIndex: number) => {
        const generateAction = async () => {
            setIsTyping(true);
            setApiCallLogs([]);
            try {
                const base64Data = await gemini.generateImage(prompt, onApiLog);
                const imageUrl = `data:image/png;base64,${base64Data}`;
                const newUploadedImage = await urlToUploadedImage(imageUrl, prompt, 'ai');
                handleAddImageToSlide(newUploadedImage, slideIndex);
            } catch (e) {
                handleError(e, generateAction);
            } finally {
                setIsTyping(false);
            }
        };
        await generateAction();
    };

    const handleAssignImageToSlide = (imageId: string, slideIndex: number) => {
        setSlides(prevSlides => prevSlides.map((slide, index) => {
            if (index === slideIndex) {
                return { ...slide, imageId: imageId, needsImage: false };
            }
            return slide;
        }));
        setIsImagePickerModalOpen(false);
        setActiveSlideForImageAction(null);
    };

    const handleGenerateVideo = async (style: string) => {
        const generateAction = async () => {
            setIsVideoModalOpen(false);
            setVideoGenState('generating');
            setVideoProgress({ message: 'Отправка запроса на генерацию...', url: null, error: null });
            setApiCallLogs([]);

            try {
                const imagesForVideo = slides.map(s => allUploadedImages.find(i => i.id === s.imageId)).filter(Boolean) as UploadedImage[];
                let operation = await gemini.generateVideo(slides, imagesForVideo, style, onApiLog);
                const pollMessages = [
                    'Компоновка сцен...', 'Рендеринг ключевых кадров...', 'Применение выбранного стиля...',
                    'Синхронизация аудиодорожки...', 'Финальная обработка видео...'
                ];
                let messageIndex = 0;
                
                while (!operation.done) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    setVideoProgress(p => ({ ...p, message: pollMessages[messageIndex % pollMessages.length] }));
                    messageIndex++;
                    operation = await gemini.checkVideoStatus(operation, onApiLog);
                }

                const downloadUri = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (!downloadUri) throw new Error('API не вернуло ссылку на сгенерированное видео.');

                setVideoProgress(p => ({ ...p, message: 'Загрузка превью...' }));
                const apiKey = gemini.getCurrentApiKey();
                if (!apiKey) throw new Error("Нет активного API ключа для загрузки видео.");

                const response = await fetch(`${downloadUri}&key=${apiKey}`);
                if (!response.ok) throw new Error(`Не удалось загрузить видеофайл (статус: ${response.status}).`);

                const blob = await response.blob();
                const videoUrl = URL.createObjectURL(blob);
                setVideoProgress({ message: 'Готово!', url: videoUrl, error: null });
                setVideoGenState('success');
            } catch (e: any) {
                console.error("Video generation failed:", e);
                setVideoProgress({ message: '', url: null, error: e.message || 'Произошла неизвестная ошибка во время генерации.' });
                setVideoGenState('error');
            }
        };
        await generateAction();
    };

    const handleCloseVideoOverlay = () => {
        const url = videoProgress.url;
        if (url) {
            URL.revokeObjectURL(url);
        }
        setVideoGenState('idle');
        setVideoProgress({ message: '', url: null, error: null });
    };

    const renderContent = () => {
        switch (appState) {
            case 'concept':
                return <ConceptInput onConceptSubmit={handleConceptSubmit} />;
            case 'generating_plan':
                return <PlanGenerationLoader />;
            case 'upload':
                return <ImageUploader onUpload={handleImagesUpload} initialPlan={initialStoryPlan} />;
            case 'analyzing':
                return <AnalysisLoader 
                    images={analysisCursor.imagesToAnalyze} 
                    allImages={allUploadedImages}
                    progress={analysisProgress} 
                    lastApiLog={apiCallLogs[apiCallLogs.length - 1]} 
                    evolvingStorySummary={evolvingStorySummary}
                />;
            case 'chat':
                return <ChatWindow 
                    slides={slides}
                    allImages={allUploadedImages}
                    onSendMessage={handleSendMessage} 
                    onFinalize={handleFinalizeScript} 
                    isTyping={isTyping}
                    onSearch={(query, slideIndex) => { 
                        setSearchQuery(query); 
                        setActiveSlideForImageAction(slideIndex);
                        setIsSearchModalOpen(true); 
                    }}
                    onGenerate={handleGenerateImageForSlide}
                    onChangeImage={(slideIndex) => {
                        setActiveSlideForImageAction(slideIndex);
                        setIsImagePickerModalOpen(true);
                    }}
                 />;
            case 'presentation':
                return <PresentationViewer 
                    slides={slides}
                    images={allUploadedImages}
                    onExport={handleExport}
                    isExporting={isExporting}
                    onRestart={handleRestart}
                    onEditScript={() => setAppState('chat')}
                    voiceSettings={settings.voiceSettings}
                    onVoiceSettingsChange={(newVoiceSettings) => handleSettingsChange({...settings, voiceSettings: newVoiceSettings })}
                    musicSuggestions={musicSuggestions}
                    onApiLog={onApiLog}
                />;
            case 'error':
                 return (
                    <ErrorState 
                        error={error}
                        onRetry={async () => {
                            if (retryAction) {
                                await retryAction();
                            }
                        }}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                        onRestart={handleRestart}
                    />
                );
        }
    };
    
    if (initState === 'initializing') {
        return <SplashScreen onStart={() => setInitState('ready')} />;
    }

    if (authState === null) {
        return (
             <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
                <Loader message="Проверка авторизации..." />
            </div>
        )
    }

    if (authState === 'unauthenticated') {
        return <GitHubAuthModal onLogin={handleLogin} />;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col p-4">
            <Header onRestart={handleRestart} onOpenSettings={() => setIsSettingsOpen(true)} />
            <main className="flex-grow flex flex-col items-center justify-center">
                {renderContent()}
            </main>

            <SettingsPanel 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                githubUser={githubUser}
                onLogout={handleLogout}
                syncStatus={syncStatus}
            />
            
            <ApiKeyModal 
                isOpen={isApiKeyMissing && !isSettingsOpen}
                onClose={() => { setIsApiKeyMissing(false); setError(null); setIsSettingsOpen(true); }}
                message={error}
            />

            <QuotaErrorModal 
                isOpen={isQuotaErrorModalOpen}
                failedKeys={failedKeys}
                onRetry={async () => {
                    setIsQuotaErrorModalOpen(false);
                    if (retryAction) {
                        await retryAction();
                    }
                }}
                onOpenSettings={() => {
                    setIsQuotaErrorModalOpen(false);
                    setIsSettingsOpen(true);
                }}
            />

            <ImageSearchModal 
                isOpen={isSearchModalOpen}
                onClose={() => {
                    setIsSearchModalOpen(false);
                    setActiveSlideForImageAction(null);
                }}
                query={searchQuery}
                onAddImages={handleAddImagesFromSearch}
            />

            <ImagePickerModal
                isOpen={isImagePickerModalOpen}
                onClose={() => {
                    setIsImagePickerModalOpen(false);
                    setActiveSlideForImageAction(null);
                }}
                images={allUploadedImages}
                onSelect={(imageId) => {
                    if(activeSlideForImageAction !== null) {
                       handleAssignImageToSlide(imageId, activeSlideForImageAction)
                    }
                }}
            />

            <VideoExportModal 
                isOpen={isVideoModalOpen}
                onClose={() => setIsVideoModalOpen(false)}
                onGenerate={handleGenerateVideo}
            />

            {videoGenState !== 'idle' && (
                <VideoGenerationOverlay 
                    state={videoGenState}
                    progress={videoProgress}
                    onClose={handleCloseVideoOverlay}
                />
            )}
        </div>
    );
};

export default App;