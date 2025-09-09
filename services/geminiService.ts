import { UploadedImage, ChatMessage, Slide, ApiCallLog, ExifData, ApiKey } from '../types';

// --- Local type definitions for REST API responses ---
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}
interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}
interface GeminiApiResponse {
  candidates?: [{
    content: GeminiContent
  }];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  generated_images?: [{
      image: { image_bytes: string };
  }];
  name?: string; // For long running operations
  done?: boolean;
  response?: any;
  error?: any;
  _usedKey?: string; // Custom property to track the key
}
interface AppGenerateContentResponse {
    text: string;
    rawResponse: GeminiApiResponse;
}
const createTextResponse = (rawResponse: GeminiApiResponse): AppGenerateContentResponse => ({
    text: rawResponse.candidates?.[0]?.content?.parts?.find(p => p.text)?.text ?? '',
    rawResponse,
});

// --- Module State ---
let keyPool: ApiKey[] = []; // The source of truth for keys, updated from the UI.
const tokenUsageStats: Record<string, { prompt: number; candidates: number; total: number }> = {};
const KEY_COOLDOWN_PERIOD = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Updates the service's internal list of API keys.
 * This function is the bridge between the UI settings and the API service.
 * @param keys The array of ApiKey objects from the application's state.
 */
export const initializeApiKeys = (keys: ApiKey[]) => {
    keyPool = [...keys];
    const now = Date.now();
    const potentialPoolSize = keyPool.filter(k => {
        const isPermanentlyUnusable = k.status === 'invalid' || k.status === 'permission_denied';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isPermanentlyUnusable && !isOnCooldown;
    }).length;
    console.log(`[Gemini Service] API keys updated. Total keys: ${keys.length}. Available for next call: ${potentialPoolSize}`);
};


// --- Custom Error for Key Exhaustion ---
export class AllKeysFailedError extends Error {
  failedKeys: ApiKey[];
  constructor(message: string, failedKeys: ApiKey[] = []) {
    super(message);
    this.name = 'AllKeysFailedError';
    this.failedKeys = failedKeys;
  }
}


// --- Core API Call Logic with Key Rotation ---
const makeGoogleApiCall = async (
    endpoint: string,
    payload: object,
    onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void,
    method: 'POST' | 'GET' = 'POST'
): Promise<any> => {
    
    // Create a mutable copy of the key pool to track status updates within this call.
    const keysWithUpdatedStatus = JSON.parse(JSON.stringify(keyPool)) as ApiKey[];

    const getOrderedKeys = () => {
        const pinnedKey = keysWithUpdatedStatus.find(k => k.isPinned);
        const otherKeys = keysWithUpdatedStatus.filter(k => !k.isPinned);
        return pinnedKey ? [pinnedKey, ...otherKeys] : otherKeys;
    };
    
    const now = Date.now();
    const keysToTry = getOrderedKeys().filter(k => {
        const isPermanentlyUnusable = k.status === 'invalid' || k.status === 'permission_denied';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isPermanentlyUnusable && !isOnCooldown;
    });

    if (keysToTry.length === 0) {
        const message = 'Нет доступных для использования API ключей. Проверьте настройки или подождите окончания блокировки.';
        onLog({ key: 'system', status: 'failed', message });
        throw new AllKeysFailedError(
            "Все предоставленные ключи исчерпаны, недействительны или временно заблокированы.",
            keysWithUpdatedStatus // Return the current state of keys
        );
    }
    
    for (const key of keysToTry) {
        const currentKey = key.value;
        const maskedKey = `...${currentKey.slice(-4)}`;
        
        try {
            onLog({ key: currentKey, status: 'attempting', message: `Вызов API (${maskedKey})...` });

            const url = `https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${currentKey}`;
            const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
            if (method === 'POST') options.body = JSON.stringify(payload);

            const response = await fetch(url, options);
            const data = await response.json();

            const keyToUpdate = keysWithUpdatedStatus.find(k => k.value === currentKey);

            if (data.error) {
                const { message = 'Unknown error', status } = data.error;
                const lowerMessage = message.toLowerCase();
                
                let newStatus: ApiKey['status'] | null = null;
                let needsCooldown = false;

                const isQuota = status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota');
                const isRateLimit = response.status === 429;
                const isPermission = status === 'PERMISSION_DENIED' || lowerMessage.includes('permission denied') || response.status === 403;
                const isInvalid = lowerMessage.includes('api key not valid') || lowerMessage.includes('api_key_not_valid') || response.status === 400;

                if (isQuota) { newStatus = 'exhausted'; needsCooldown = true; }
                else if (isRateLimit) { newStatus = 'rate_limited'; needsCooldown = true; }
                else if (isPermission) { newStatus = 'permission_denied'; needsCooldown = true; } // Per user request
                else if (isInvalid) { newStatus = 'invalid'; needsCooldown = true; } // Per user request

                onLog({ key: currentKey, status: 'failed', message: `Ошибка API: ${message} (Статус: ${status || response.status})` });

                if (newStatus && keyToUpdate) {
                    keyToUpdate.status = newStatus;
                    keyToUpdate.lastError = message;
                    if (needsCooldown) {
                        keyToUpdate.resetTime = Date.now() + KEY_COOLDOWN_PERIOD;
                    }
                    continue; // Try the next key
                } else {
                    // For other, potentially transient errors, fail the whole operation.
                    throw new Error(`API Error (${status}): ${message}`);
                }
            }
            
            // --- Success case ---
            onLog({ key: currentKey, status: 'success', message: `Вызов API успешен.` });
            
            if (keyToUpdate) {
                keyToUpdate.status = 'active';
                keyToUpdate.lastError = undefined;
                keyToUpdate.resetTime = undefined;
            }
            
            if (data.usageMetadata) {
                const { promptTokenCount = 0, candidatesTokenCount = 0, totalTokenCount = 0 } = data.usageMetadata;
                if (!tokenUsageStats[maskedKey]) tokenUsageStats[maskedKey] = { prompt: 0, candidates: 0, total: 0 };
                tokenUsageStats[maskedKey].prompt += promptTokenCount;
                tokenUsageStats[maskedKey].candidates += candidatesTokenCount;
                tokenUsageStats[maskedKey].total += totalTokenCount;

                console.log(`[API Call OK for ${maskedKey}]:`, {
                    promptTokens: promptTokenCount, candidatesTokens: candidatesTokenCount, totalTokens: totalTokenCount,
                    sessionTotal: tokenUsageStats[maskedKey]
                });
            }
            
            data._usedKey = maskedKey;
            return data;

        } catch (error: any) {
            // Handle network errors (e.g., CORS, DNS, offline)
            const errorMessage = error.message || 'Network request failed';
            onLog({ key: currentKey, status: 'failed', message: `Сетевая ошибка: ${errorMessage}` });
            console.error(`[Gemini Service] Network error for key ${maskedKey}:`, error);
            throw new Error(`Сетевая ошибка: ${errorMessage}`);
        }
    }

    // This point is reached only if the loop finishes, meaning all keys failed.
    const finalMessage = "Все доступные API ключи не смогли выполнить запрос.";
    onLog({ key: 'system', status: 'failed', message: finalMessage });
    throw new AllKeysFailedError(finalMessage, keysWithUpdatedStatus);
};


// --- Helper function for API payload creation ---
const mapAppConfigToRestPayload = (config: any = {}) => {
    const payload: any = {};
    const generationConfig: any = {};

    if (config.systemInstruction) payload.systemInstruction = { parts: [{ text: config.systemInstruction }] };
    if (config.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
    if (config.responseSchema) generationConfig.responseSchema = config.responseSchema;
    if (config.thinkingConfig) payload.thinkingConfig = config.thinkingConfig;

    if (Object.keys(generationConfig).length > 0) {
        payload.generationConfig = generationConfig;
    }
    return payload;
};


// --- Public API Functions ---

export const createInitialPlan = async (topic: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const prompt = `
Ты - ИИ-режиссер, помогающий пользователю создать структуру для впечатляющей и красивой презентации.
Тема, заданная пользователем: "${topic}"
Твоя задача - проанализировать тему и создать первоначальный план (сценарий) презентации. План должен быть логичным, увлекательным и хорошо структурированным.
ИНСТРУКЦИИ:
1. Разбей презентацию на 3-5 логических частей (например: ## Вступление, ## Основная часть, ## Кульминация, ## Заключение). Используй заголовки Markdown (##).
2. Для каждой части предложи краткое, но емкое описание того, о чем в ней пойдет речь.
3. Для каждой части опиши, какой тип визуального ряда (фотографий) был бы наиболее уместен. Например: "- Широкоугольные пейзажи", "- Портреты с эмоциями", "- Детальные снимки архитектуры". Используй списки Markdown (-).
4. Ответ должен быть четко структурирован, вдохновляющим и легко читаемым.
5. Заверши свой ответ обобщающим абзацем, приглашающим пользователя загрузить фотографии, которые соответствуют этому плану.
6. Твой ответ должен быть исключительно на русском языке.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — креативный и полезный ассистент, режиссер, который всегда отвечает на русском языке и помогает создавать великолепные презентации."
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

const imageToPart = (image: UploadedImage): GeminiPart => ({
    inlineData: { mimeType: image.file.type, data: image.base64 }
});

const formatExifForPrompt = (exif: ExifData | undefined): string => {
    if (!exif) return '';
    const parts = [];
    if (exif.DateTimeOriginal) parts.push(`Снято: ${exif.DateTimeOriginal.toLocaleString('ru-RU')}`);
    if (exif.Make || exif.Model) parts.push(`Камера: ${[exif.Make, exif.Model].filter(Boolean).join(' ')}`);
    return `(Метаданные: ${parts.join(', ')})`;
};

export const analyzeNextFrame = async (currentImage: UploadedImage, previousImages: UploadedImage[], currentStorySummary: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<{ imageDescription: string; updatedStory: string; }> => {
    const previousContext = previousImages.length > 0 ? `Контекст предыдущих кадров:\n${previousImages.map((img, i) => `Кадр ${i + 1}: ${img.description}`).join('\n')}` : 'Это первый кадр для анализа.';
    const locationInfo = currentImage.locationDescription ? `Место съемки: ${currentImage.locationDescription}.` : '';
    const exifInfo = formatExifForPrompt(currentImage.exif);
    const prompt = `
Ты - ИИ-режиссер... (остальной промпт тот же)
ДАННЫЕ НОВОГО КАДРА:
${locationInfo} ${exifInfo}
...`;
    
    const payload = {
        contents: { parts: [{ text: prompt }, imageToPart(currentImage)] },
        ...mapAppConfigToRestPayload({
            responseMimeType: "application/json",
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    imageDescription: { type: 'STRING', description: "Краткое описание нового кадра (1 предложение) в контексте истории." },
                    updatedStory: { type: 'STRING', description: "Обновленный и более детализированный общий план презентации." }
                },
                required: ["imageDescription", "updatedStory"]
            }
        })
    };

    const response = createTextResponse(await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog));
    try {
        const result = JSON.parse(response.text.trim());
        if (result.imageDescription && result.updatedStory) return result;
        throw new Error("JSON response from AI is missing required keys.");
    } catch (e) {
        console.error("Failed to parse JSON from AI:", response.text, e);
        throw new Error("Не удалось обработать ответ от ИИ. Ответ не является валидным JSON.");
    }
};

export const generateStoryboard = async (finalStory: string, images: UploadedImage[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const imageContext = images.map((img, i) => `- ID изображения: ${img.id}, Описание: ${img.description || 'общее фото'}`).join('\n');
    const prompt = `... (промпт тот же) ...`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            responseMimeType: "application/json",
            responseSchema: { /* ... a large schema definition ... */ }
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const continueChat = async (messages: ChatMessage[], images: UploadedImage[], slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const history = messages.map(msg => `${msg.role === 'user' ? 'Пользователь' : 'ИИ-Режиссер'}: ${msg.parts[0].text}`).join('\n\n');
    const currentStoryboard = JSON.stringify(slides, null, 2);
    const prompt = `... (промпт тот же) ...`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, режиссер, который всегда отвечает на русском языке и возвращает данные в формате JSON.",
            responseMimeType: "application/json"
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const suggestMusic = async (concept: string, slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const storySummary = slides.map(s => s.script).join(' ');
    const prompt = `... (промпт тот же) ...`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({ responseMimeType: "application/json" })
    };
    const responseData = await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const generateImage = async (query: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<string> => {
    const payload = {
        prompt: `cinematic photo, ${query}`,
        number_of_images: 1,
        aspect_ratio: "16:9"
    };
    const responseData = await makeGoogleApiCall('models/imagen-4.0-generate-001:generateImages', payload, onLog);
    return responseData.generated_images[0].image.image_bytes;
};

export const generateVideo = (slides: Slide[], images: UploadedImage[], style: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<any> => {
    const combinedScript = slides.map(s => s.script).join('\n\n');
    const prompt = `Создай концептуальное видео в стиле "${style}" на основе следующего сценария: ${combinedScript}. Видео должно отражать общее настроение и ключевые моменты истории.`;
    const seedImage = images[Math.floor(images.length / 2)];
    
    const payload: any = { prompt, number_of_videos: 1 };
    if (seedImage) {
        payload.image = { image_bytes: seedImage.base64, mime_type: seedImage.file.type };
    }
    return makeGoogleApiCall('models/veo-2.0-generate-001:generateVideos', payload, onLog);
};

export const checkVideoStatus = (operation: any, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<any> => {
    return makeGoogleApiCall(operation.name, {}, onLog, 'GET');
};

/**
 * Checks the status of a single API key by making a lightweight request.
 * @param key The API key to check.
 * @returns A promise that resolves to the key's status.
 */
export const checkApiKey = async (key: string): Promise<ApiKey['status']> => {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens?key=${key}`;
        const payload = { contents: [{ parts: [{ text: "health check" }] }] };
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.status === 429) return 'rate_limited';

        const data = await response.json();

        if (data.error) {
            const { message = '', status } = data.error;
            const lowerMessage = message.toLowerCase();
            
            if (status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota')) return 'exhausted';
            if (status === 'PERMISSION_DENIED' || lowerMessage.includes('permission denied')) return 'permission_denied';
            if (lowerMessage.includes('api key not valid') || lowerMessage.includes('api_key_not_valid') || response.status === 400) return 'invalid';
            return 'invalid';
        }

        if (response.ok && typeof data.totalTokens === 'number') return 'active';
        
        return 'unknown';

    } catch (error) {
        console.error(`API key check failed for key ...${key.slice(-4)}:`, error);
        return 'unknown';
    }
};

export const generateSsmlScript = async (script: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const prompt = `... (промпт тот же) ...`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, который преобразует текст в SSML.",
            thinkingConfig: { thinkingBudget: 0 }
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-2.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const getCurrentApiKey = (): string | null => {
    const pinnedKey = keyPool.find(k => k.isPinned);
    if (pinnedKey && (pinnedKey.status === 'active' || pinnedKey.status === 'unknown')) {
        return pinnedKey.value;
    }
    const firstAvailable = keyPool.find(k => k.status === 'active' || k.status === 'unknown');
    return firstAvailable ? firstAvailable.value : null;
};