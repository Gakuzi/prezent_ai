
// FIX: Added 'ExifData' to the import list from '../types'.
import { UploadedImage, ChatMessage, Slide, ApiKey, AppSettings, ExifData } from '../types';
import logger from './logger';

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
const SHORT_COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes for transient errors

export const initializeApiKeys = (keysFromSettings: ApiKey[]) => {
    const liveKeyMap = new Map(keyPool.map(k => [k.value, k]));
    
    keyPool = keysFromSettings.map(keyFromSettings => {
        const liveKeyData = liveKeyMap.get(keyFromSettings.value);
        if (liveKeyData) {
            return {
                ...keyFromSettings,
                status: liveKeyData.status,
                lastChecked: liveKeyData.lastChecked,
                resetTime: liveKeyData.resetTime,
                lastError: liveKeyData.lastError,
            };
        }
        return keyFromSettings;
    });
    
    const now = Date.now();
    const potentialPoolSize = keyPool.filter(k => {
        const isInvalid = k.status === 'invalid' || k.status === 'config_error';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isInvalid && !isOnCooldown;
    }).length;
    logger.logInfo(`Key pool updated. Total keys: ${keyPool.length}. Available: ${potentialPoolSize}`);
};

// --- Custom Errors ---
export class AllKeysFailedError extends Error {
  failedKeys: ApiKey[];
  constructor(message: string, failedKeys: ApiKey[] = []) {
    super(message);
    this.name = 'AllKeysFailedError';
    this.failedKeys = failedKeys;
  }
}
export class ConfigError extends Error {
  constructor(message: string, public model: string, public endpoint: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// --- Core API Call Logic with Key Rotation ---
const makeGoogleApiCall = async (
    model: string,
    endpoint: string,
    payload: object,
    method: 'POST' | 'GET' = 'POST'
): Promise<any> => {
    
    const getOrderedKeys = (): ApiKey[] => {
        const pinnedKey = keyPool.find(k => k.isPinned);
        const otherKeys = keyPool.filter(k => !k.isPinned);
        return pinnedKey ? [pinnedKey, ...otherKeys] : otherKeys;
    };
    
    const now = Date.now();
    const allKeysInOrder = getOrderedKeys();

    const keysAvailableAtStart = allKeysInOrder.filter(k => {
        const isBadStatus = k.status === 'invalid' || k.status === 'config_error' || k.status === 'unknown';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isBadStatus && !isOnCooldown;
    });
    
    if (keysAvailableAtStart.length === 0 && allKeysInOrder.length > 0) {
        const message = 'No API keys available for use. All keys are either on cooldown, invalid, or have a persistent error status.';
        logger.logError(message, { apiResponse: { failedKeys: keyPool } });
        throw new AllKeysFailedError(message, JSON.parse(JSON.stringify(keyPool)));
    }
    
    for (const keyState of allKeysInOrder) {
        if (keyState.status === 'invalid' || keyState.status === 'config_error' || keyState.status === 'unknown') continue;
        if (keyState.resetTime && keyState.resetTime > now) continue;

        const currentKey = keyState.value;
        const maskedKey = `...${currentKey.slice(-4)}`;
        // FIX: Find the key to update directly in the module-level keyPool.
        const keyToUpdate = keyPool.find(k => k.value === currentKey)!;
        const startTime = Date.now();

        try {
            logger.logInfo(`Attempting API call with key ${maskedKey}`, { 
                maskedKey, model, endpoint, requestPayload: payload 
            });

            // FIX: Add 'models/' prefix for gemini models, but not for others like 'imagen' or 'veo'.
            const modelPath = model.startsWith('gemini') ? `models/${model}` : model;
            const url = `https://${endpoint}/${modelPath}:${payload.hasOwnProperty('prompt') ? 'generateImages' : 'generateContent'}?key=${currentKey}`;
            const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
            if (method === 'POST') options.body = JSON.stringify(payload);

            const response = await fetch(url, options);
            const data = await response.json();
            const durationMs = Date.now() - startTime;
            
            if (data.error || !response.ok) {
                const { message = 'Unknown error', status } = data.error || {};
                const lowerMessage = (message as string).toLowerCase();

                const isQuota = response.status === 429 || status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota');
                const isInvalid = lowerMessage.includes('api key not valid') || lowerMessage.includes('invalid_api_key') || response.status === 403 || status === 'PERMISSION_DENIED';
                const isConfigError = response.status === 404 || status === 'NOT_FOUND';
                const isServerError = response.status >= 500 && response.status < 600;

                const errorMessage = `API Error with ${maskedKey}: ${message}`;
                const logDetails = { maskedKey, model, endpoint, durationMs, httpStatus: response.status, apiError: { status, message }, apiResponse: data };
                logger.logError(errorMessage, logDetails);

                keyToUpdate.lastError = message;

                if (isConfigError) {
                    keyToUpdate.status = 'config_error';
                    keyToUpdate.resetTime = undefined;
                    // Critical error, stop everything.
                    throw new ConfigError(`Модель или конечная точка не найдены. Проверьте model и endpoint.`, model, endpoint);
                } else if (isInvalid) {
                    keyToUpdate.status = 'invalid';
                    keyToUpdate.resetTime = undefined;
                } else if (isQuota) {
                    keyToUpdate.status = 'exhausted';
                    keyToUpdate.resetTime = Date.now() + KEY_COOLDOWN_PERIOD;
                } else if (isServerError) {
                    keyToUpdate.status = 'rate_limited';
                    keyToUpdate.resetTime = Date.now() + SHORT_COOLDOWN_PERIOD;
                }
                else {
                    keyToUpdate.status = 'unknown';
                    keyToUpdate.resetTime = undefined;
                }
                continue; // Try the next key
            }
            
            logger.logSuccess(`API call with ${maskedKey} successful (${durationMs}ms)`, {
                maskedKey, model, endpoint, durationMs, apiResponse: data
            });
            
            keyToUpdate.status = 'active';
            keyToUpdate.lastError = undefined;
            keyToUpdate.resetTime = undefined;
            
            if (data.usageMetadata) {
                const { promptTokenCount = 0, candidatesTokenCount = 0, totalTokenCount = 0 } = data.usageMetadata;
                if (!tokenUsageStats[maskedKey]) tokenUsageStats[maskedKey] = { prompt: 0, candidates: 0, total: 0 };
                tokenUsageStats[maskedKey].prompt += promptTokenCount;
                tokenUsageStats[maskedKey].candidates += candidatesTokenCount;
                tokenUsageStats[maskedKey].total += totalTokenCount;
            }
            
            data._usedKey = maskedKey;
            return data;

        } catch (error: any) {
            if (error instanceof ConfigError) throw error;
            const durationMs = Date.now() - startTime;
            const errorMessage = error.message || 'Network request failed';
            // FIX: The 'LogDetails' type uses 'apiError' for error objects, not 'error'.
            logger.logError(`Network error with ${maskedKey}: ${errorMessage}`, {
                maskedKey, model, endpoint, durationMs, apiError: { message: errorMessage, status: error.name || 'NETWORK_ERROR' }
            });
            keyToUpdate.status = 'unknown';
            keyToUpdate.lastError = errorMessage;
            continue;
        }
    }

    const finalMessage = "All available API keys failed.";
    // FIX: Pass a fresh copy of the *updated* keyPool to the UI.
    const finalKeyState = JSON.parse(JSON.stringify(keyPool));
    logger.logError(finalMessage, { apiResponse: { failedKeys: finalKeyState } });
    throw new AllKeysFailedError(finalMessage, finalKeyState);
};

const performSelfCheck = async (model: string, endpoint: string): Promise<void> => {
    logger.logInfo("Performing self-check before operation...", { model, endpoint });
    // FIX: Define 'now' variable which was used but not declared in this scope.
    const now = Date.now();
    const firstAvailableKey = keyPool.find(k => k.status !== 'invalid' && k.status !== 'config_error' && (!k.resetTime || k.resetTime <= now));
    
    if (!firstAvailableKey) {
        if (keyPool.length > 0) throw new AllKeysFailedError("No keys available for self-check.", keyPool);
        return; // No keys to check
    }

    try {
        await checkApiKey(firstAvailableKey.value, model, endpoint);
    } catch (error) {
        if (error instanceof ConfigError) {
            logger.logError(`Self-check failed: ${error.message}. Halting operation.`, { model, endpoint });
            throw error;
        }
        // Other errors (like quota on the first key) are not critical for self-check,
        // as the main loop will rotate to the next key.
        logger.logWarning(`Self-check on key ...${firstAvailableKey.value.slice(-4)} encountered a non-config error. Proceeding with operation.`, { error });
    }
};

const mapAppConfigToRestPayload = (config: any = {}) => {
    const payload: any = {};
    const generationConfig: any = {};
    if (config.systemInstruction) payload.systemInstruction = { parts: [{ text: config.systemInstruction }] };
    if (config.responseMimeType) generationConfig.responseMimeType = config.responseMimeType;
    if (config.responseSchema) generationConfig.responseSchema = config.responseSchema;
    if (config.thinkingConfig) payload.thinkingConfig = config.thinkingConfig;
    if (Object.keys(generationConfig).length > 0) payload.generationConfig = generationConfig;
    return payload;
};

// --- Public API Functions ---

export const createInitialPlan = async (topic: string, settings: AppSettings): Promise<AppGenerateContentResponse> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
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
    const responseData = await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload);
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

export const analyzeNextFrame = async (currentImage: UploadedImage, previousImages: UploadedImage[], currentStorySummary: string, settings: AppSettings): Promise<{ imageDescription: string; updatedStory: string; }> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
    const previousContext = previousImages.length > 0 ? `Контекст предыдущих кадров:\n${previousImages.map((img, i) => `Кадр ${i + 1}: ${img.description}`).join('\n')}` : 'Это первый кадр для анализа.';
    const locationInfo = currentImage.locationDescription ? `Место съемки: ${currentImage.locationDescription}.` : '';
    const exifInfo = formatExifForPrompt(currentImage.exif);
    
    const prompt = `
Ты - ИИ-режиссер, твоя задача - проанализировать серию фотографий и создать из них связную историю.
Сейчас ты работаешь над одним кадром в контексте всей истории.
    
КРАТКОЕ ОПИСАНИЕ УЖЕ СЛОЖИВШЕЙСЯ ИСТОРИИ:
"${currentStorySummary || 'История еще не началась.'}"
    
${previousContext}
    
ДАННЫЕ НОВОГО КАДРА (КАДР №${previousImages.length + 1}):
${locationInfo} ${exifInfo}
Проанализируй приложенное изображение.
    
ТВОЯ ЗАДАЧА:
Верни JSON с двумя полями:
1.  "imageDescription": Кратко, в ОДНОМ предложении, опиши, что происходит на этом кадре и как он связан с предыдущими. Это описание будет показано пользователю.
2.  "updatedStory": Основываясь на всей имеющейся информации (старая история + новый кадр), напиши ОБНОВЛЕННУЮ и БОЛЕЕ ДЕТАЛИЗИРОВАННУЮ общую сюжетную линию для всей презентации. Этот текст должен быть связным рассказом на 3-5 предложений.
`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }, imageToPart(currentImage)] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    imageDescription: { type: 'STRING', description: "Краткое описание нового кадра (1 предложение) в контексте истории." },
                    updatedStory: { type: 'STRING', description: "Обновленный и более детализированный общий план презентации." }
                },
                required: ["imageDescription", "updatedStory"]
            }
        }
    };

    const response = createTextResponse(await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload));
    try {
        const result = JSON.parse(response.text.trim());
        if (result.imageDescription && result.updatedStory) return result;
        throw new Error("JSON response from AI is missing required keys.");
    } catch (e) {
        console.error("Failed to parse JSON from AI:", response.text, e);
        throw new Error("Не удалось обработать ответ от ИИ. Ответ не является валидным JSON.");
    }
};

export const generateStoryboard = async (finalStory: string, images: UploadedImage[], settings: AppSettings): Promise<AppGenerateContentResponse> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
    const imageContext = images.map((img, i) => `- ID изображения: ${img.id}, Описание: ${img.description || 'общее фото'}`).join('\n');
    const prompt = `Ты — ИИ-режиссер. Твоя задача — создать детальный сценарий для видео-презентации.
    
ФИНАЛЬНАЯ ВЕРСИЯ ИСТОРИИ, одобренная пользователем:
"${finalStory}"
    
ДОСТУПНЫЕ ИЗОБРАЖЕНИЯ (кадры):
${imageContext}
    
ИНСТРУКЦИИ:
1.  Создай массив JSON объектов, где каждый объект — это один слайд.
2.  Для каждого слайда подбери наиболее подходящее изображение из списка по его ID. **Не придумывай новые ID!**
3.  Если для какого-то логического шага истории нет подходящего изображения, создай слайд с \`"imageId": null\` и \`"needsImage": true\`.
4.  Включи в каждый объект слайда следующие поля:
    *   \`title\` (string): Короткий, емкий заголовок (2-4 слова).
    *   \`script\` (string): Текст для диктора (2-3 предложения).
    *   \`imageId\` (string | null): ID изображения из списка выше или null.
    *   \`speaker\` (number): Номер диктора (0 или 1, чередуй их для диалога).
    *   \`textOverlay\` (string): (Опционально) Короткая фраза для отображения поверх видео.
    *   \`podcastScript\` (string): (Опционально) Альтернативный, более разговорный текст для "режима подкаста".
    *   \`needsImage\` (boolean): \`true\`, если нужно найти или сгенерировать изображение.
    *   \`suggestions\` (object, опционально): Если \`needsImage\` is \`true\`, предложи варианты:
        *   \`search\` (string): Поисковый запрос для Pexels.
        *   \`generate\` (string): Промпт для генерации изображения.
    
5.  Твой ответ должен быть ТОЛЬКО валидным JSON-массивом. Без лишних слов и markdown.
`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
             responseMimeType: "application/json",
        }
    };
    const responseData = await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload);
    return createTextResponse(responseData);
};

export const continueChat = async (messages: ChatMessage[], images: UploadedImage[], slides: Slide[], settings: AppSettings): Promise<AppGenerateContentResponse> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
    const history = messages.map(msg => `${msg.role === 'user' ? 'Пользователь' : 'ИИ-Режиссер'}: ${msg.parts[0].text}`).join('\n\n');
    const currentStoryboard = JSON.stringify(slides, null, 2);
    const prompt = `Ты — ИИ-режиссер, и ты помогаешь пользователю редактировать сценарий презентации.
    
ТЕКУЩИЙ СЦЕНАРИЙ (в формате JSON):
${currentStoryboard}

ИСТОРИЯ ПЕРЕПИСКИ:
${history}

ЗАДАЧА:
Проанализируй последнее сообщение пользователя и ВНЕСИ ИЗМЕНЕНЕИЯ в JSON-сценарий.
Твой ответ должен быть ТОЛЬКО обновленным JSON-массивом слайдов. Без комментариев.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, режиссер, который всегда отвечает на русском языке и возвращает данные в формате JSON.",
            responseMimeType: "application/json"
        })
    };
    const responseData = await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload);
    return createTextResponse(responseData);
};

export const suggestMusic = async (concept: string, slides: Slide[], settings: AppSettings): Promise<AppGenerateContentResponse> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
    const storySummary = slides.map(s => s.script).join(' ');
    const prompt = `Проанализируй концепцию ("${concept}") и краткое содержание ("${storySummary}") презентации.
Предложи 3-5 настроений для фоновой музыки в виде JSON-массива строк. Например: ["upbeat", "cinematic", "reflective"].
Ответ должен быть только JSON-массивом.`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({ responseMimeType: "application/json" })
    };
    const responseData = await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload);
    return createTextResponse(responseData);
};

export const generateImage = async (query: string): Promise<string> => {
    const payload = {
        prompt: `cinematic photo, ${query}`,
        number_of_images: 1,
        aspect_ratio: "16:9"
    };
    // Assuming image generation uses a fixed model/endpoint for now
    const responseData = await makeGoogleApiCall('imagen-4.0-generate-001', 'generativelanguage.googleapis.com/v1beta', payload);
    return responseData.generated_images[0].image.image_bytes;
};

export const generateVideo = (slides: Slide[], images: UploadedImage[], style: string): Promise<any> => {
    // Assuming video generation uses a fixed model/endpoint
    // No self-check here as it's a long-running operation with a different pattern
    const combinedScript = slides.map(s => s.script).join('\n\n');
    const prompt = `Создай концептуальное видео в стиле "${style}" на основе следующего сценария: ${combinedScript}. Видео должно отражать общее настроение и ключевые моменты истории.`;
    const seedImage = images[Math.floor(images.length / 2)];
    
    const payload: any = { prompt, number_of_videos: 1 };
    if (seedImage) {
        payload.image = { image_bytes: seedImage.base64, mime_type: seedImage.file.type };
    }
    return makeGoogleApiCall('veo-2.0-generate-001', 'generativelanguage.googleapis.com/v1beta', { operation: payload }, 'POST');
};

export const checkVideoStatus = (operation: any): Promise<any> => {
    // This function needs to be adapted to the new `makeGoogleApiCall` structure if it uses the same endpoint logic
    return makeGoogleApiCall(operation.name, 'generativelanguage.googleapis.com/v1beta', {}, 'GET');
};

export const checkApiKey = async (key: string, model: string, endpoint: string): Promise<ApiKey['status']> => {
    const maskedKey = `...${key.slice(-4)}`;
    const payload = { contents: [{ parts: [{ text: "health check" }] }] };
    const startTime = Date.now();
    logger.logInfo(`Checking API key ${maskedKey}`, { maskedKey, model, endpoint, requestPayload: payload });
    try {
        // FIX: The URL was incorrectly prepending '/v1beta' when it was already part of the endpoint string.
        const modelPath = model.startsWith('gemini') ? `models/${model}` : model;
        const url = `https://${endpoint}/${modelPath}:generateContent?key=${key}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const durationMs = Date.now() - startTime;
        const data = await response.json();

        if (response.ok && data.candidates) {
             logger.logSuccess(`Key ${maskedKey} is active (${durationMs}ms)`, { maskedKey, model, endpoint, durationMs });
            return 'active';
        }

        if (data.error) {
            const { message = '', status } = data.error;
            const lowerMessage = (message as string).toLowerCase();

            const isQuota = response.status === 429 || status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota');
            const isInvalid = lowerMessage.includes('api key not valid') || lowerMessage.includes('invalid_api_key') || response.status === 403 || status === 'PERMISSION_DENIED';
            const isConfigError = response.status === 404 || status === 'NOT_FOUND';
            
            const logDetails = { maskedKey, model, endpoint, durationMs, httpStatus: response.status, apiError: { status, message }, apiResponse: data };
            if (isConfigError) {
                logger.logError(`Key check failed for ${maskedKey}: Model or endpoint not found.`, logDetails);
                throw new ConfigError("Model or endpoint not found.", model, endpoint);
            }
            if (isInvalid) {
                logger.logError(`Key ${maskedKey} is invalid: ${message}`, logDetails);
                return 'invalid';
            }
            if (isQuota) {
                logger.logWarning(`Key ${maskedKey} is exhausted: ${message}`, logDetails);
                return 'exhausted';
            }
        }
        
        logger.logError(`Key ${maskedKey} check failed with unknown error`, { maskedKey, durationMs, apiResponse: data });
        return 'unknown';

    } catch (error: any) {
        if (error instanceof ConfigError) throw error;
        const durationMs = Date.now() - startTime;
        const errorMessage = error.message || 'Network request failed';
        logger.logError(`Key ${maskedKey} check failed (network error): ${errorMessage}`, {
            maskedKey, durationMs, apiError: { message: errorMessage }
        });
        return 'unknown';
    }
};

export const generateSsmlScript = async (script: string, settings: AppSettings): Promise<AppGenerateContentResponse> => {
    await performSelfCheck(settings.geminiModel, settings.geminiEndpoint);
    const prompt = `Преобразуй следующий текст в формат SSML (Speech Synthesis Markup Language) для более естественного звучания. Используй теги <break time="...s"/> для пауз и <emphasis level="..."> для интонаций. Не оборачивай ответ в \`\`\`xml. Верни только чистый SSML код.
Исходный текст: "${script}"`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, который преобразует текст в SSML.",
            thinkingConfig: { thinkingBudget: 0 }
        })
    };
    const responseData = await makeGoogleApiCall(settings.geminiModel, settings.geminiEndpoint, payload);
    return createTextResponse(responseData);
};

export const getCurrentApiKey = (): string | null => {
    const now = Date.now();
    const pinnedKey = keyPool.find(k => k.isPinned);
    if (pinnedKey && (!pinnedKey.resetTime || pinnedKey.resetTime <= now) && pinnedKey.status !== 'invalid') {
        return pinnedKey.value;
    }
    const firstAvailable = keyPool.find(k => k.status !== 'invalid' && (!k.resetTime || k.resetTime <= now));
    return firstAvailable ? firstAvailable.value : null;
};

export const getKeyPoolState = (): ApiKey[] => {
    return keyPool;
};