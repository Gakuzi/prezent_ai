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
        const isInvalid = k.status === 'invalid';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isInvalid && !isOnCooldown;
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
    const allKeysInOrder = getOrderedKeys();

    const keysAvailableAtStart = allKeysInOrder.filter(k => {
        const isInvalid = k.status === 'invalid';
        const isOnCooldown = k.resetTime && k.resetTime > now;
        return !isInvalid && !isOnCooldown;
    });
    
    if (keysAvailableAtStart.length === 0 && allKeysInOrder.length > 0) {
        const message = 'Нет доступных для использования API ключей. Все ключи временно заблокированы или недействительны.';
        onLog({ key: 'system', status: 'failed', message });
        throw new AllKeysFailedError(message, keysWithUpdatedStatus);
    }
    
    for (const keyState of allKeysInOrder) {
        // Skip keys that are permanently invalid for this session
        if (keyState.status === 'invalid') {
            continue;
        }
        // Skip keys that are currently on cooldown
        if (keyState.resetTime && keyState.resetTime > now) {
            continue;
        }

        const currentKey = keyState.value;
        const maskedKey = `...${currentKey.slice(-4)}`;
        // Find the key in our mutable copy to update its status during this operation
        const keyToUpdate = keysWithUpdatedStatus.find(k => k.value === currentKey)!;
        
        try {
            console.log(`Запрос к Gemini с ключом: ${maskedKey}`);
            onLog({ key: currentKey, status: 'attempting', message: `Вызов API (${maskedKey})...` });

            const url = `https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${currentKey}`;
            const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
            if (method === 'POST') options.body = JSON.stringify(payload);

            const response = await fetch(url, options);
            const data = await response.json();

            if (data.error || !response.ok) {
                const { message = 'Unknown error', status } = data.error || {};
                const lowerMessage = (message as string).toLowerCase();
                
                const isQuota = response.status === 429 || status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota');
                const isPermission = response.status === 403 || status === 'PERMISSION_DENIED';
                const isInvalid = lowerMessage.includes('api key not valid') || lowerMessage.includes('invalid_api_key');
                
                const errorMessage = `Ошибка API: ${message} (Статус: ${status || response.status})`;
                onLog({ key: currentKey, status: 'failed', message: errorMessage });

                keyToUpdate.lastError = message;

                if (isInvalid) {
                    keyToUpdate.status = 'invalid';
                    keyToUpdate.resetTime = undefined; // Permanently invalid for this session
                } else if (isQuota) {
                    keyToUpdate.status = 'exhausted';
                    keyToUpdate.resetTime = Date.now() + KEY_COOLDOWN_PERIOD;
                } else if (isPermission) {
                    keyToUpdate.status = 'permission_denied';
                    keyToUpdate.resetTime = Date.now() + KEY_COOLDOWN_PERIOD;
                } else {
                    keyToUpdate.status = 'unknown'; // A non-blocking, possibly transient error occurred
                }
                continue; // Try the next key
            }
            
            // --- Success case ---
            onLog({ key: currentKey, status: 'success', message: `Вызов API успешен.` });
            
            keyToUpdate.status = 'active';
            keyToUpdate.lastError = undefined;
            keyToUpdate.resetTime = undefined;
            
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
            keyToUpdate.status = 'unknown';
            keyToUpdate.lastError = errorMessage;
            continue; // Try the next key on network error
        }
    }

    // This point is reached only if the loop finishes, meaning all available keys failed.
    const finalMessage = "Все предоставленные ключи исчерпаны, недействительны или временно заблокированы.";
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
    const responseData = await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog);
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

    const response = createTextResponse(await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog));
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
    const responseData = await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const continueChat = async (messages: ChatMessage[], images: UploadedImage[], slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const history = messages.map(msg => `${msg.role === 'user' ? 'Пользователь' : 'ИИ-Режиссер'}: ${msg.parts[0].text}`).join('\n\n');
    const currentStoryboard = JSON.stringify(slides, null, 2);
    const prompt = `Ты — ИИ-режиссер, и ты помогаешь пользователю редактировать сценарий презентации.
    
ТЕКУЩИЙ СЦЕНАРИЙ (в формате JSON):
${currentStoryboard}

ИСТОРИЯ ПЕРЕПИСКИ:
${history}

ЗАДАЧА:
Проанализируй последнее сообщение пользователя и ВНЕСИ ИЗМЕНЕНИЯ в JSON-сценарий.
Твой ответ должен быть ТОЛЬКО обновленным JSON-массивом слайдов. Без комментариев.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, режиссер, который всегда отвечает на русском языке и возвращает данные в формате JSON.",
            responseMimeType: "application/json"
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog);
    return createTextResponse(responseData);
};

export const suggestMusic = async (concept: string, slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const storySummary = slides.map(s => s.script).join(' ');
    const prompt = `Проанализируй концепцию ("${concept}") и краткое содержание ("${storySummary}") презентации.
Предложи 3-5 настроений для фоновой музыки в виде JSON-массива строк. Например: ["upbeat", "cinematic", "reflective"].
Ответ должен быть только JSON-массивом.`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({ responseMimeType: "application/json" })
    };
    const responseData = await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog);
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
 * Checks the status of a single API key by making a lightweight, real request.
 * @param key The API key to check.
 * @returns A promise that resolves to the key's status.
 */
export const checkApiKey = async (key: string): Promise<ApiKey['status']> => {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
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
            
            const isQuota = status === 'RESOURCE_EXHAUSTED' || lowerMessage.includes('quota');
            const isPermission = status === 'PERMISSION_DENIED' || lowerMessage.includes('permission denied');
            const isInvalid = lowerMessage.includes('api key not valid') || lowerMessage.includes('invalid_api_key') || response.status === 400;

            if (isQuota) return 'exhausted';
            if (isPermission) return 'permission_denied';
            if (isInvalid) return 'invalid';
            
            return 'invalid'; // Default to invalid for any other error
        }

        if (response.ok && data.candidates) return 'active';
        
        return 'unknown';

    } catch (error) {
        console.error(`API key check failed for key ...${key.slice(-4)}:`, error);
        return 'unknown';
    }
};

export const generateSsmlScript = async (script: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<AppGenerateContentResponse> => {
    const prompt = `Преобразуй следующий текст в формат SSML (Speech Synthesis Markup Language) для более естественного звучания. Используй теги <break time="...s"/> для пауз и <emphasis level="..."> для интонаций. Не оборачивай ответ в \`\`\`xml. Верни только чистый SSML код.
Исходный текст: "${script}"`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        ...mapAppConfigToRestPayload({
            systemInstruction: "Ты — полезный ассистент, который преобразует текст в SSML.",
            thinkingConfig: { thinkingBudget: 0 }
        })
    };
    const responseData = await makeGoogleApiCall('models/gemini-1.5-flash:generateContent', payload, onLog);
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
