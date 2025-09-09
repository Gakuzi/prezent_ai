import { GoogleGenAI, GenerateContentResponse, Content, Part, Type } from "@google/genai";
import { ApiKey, UploadedImage, ChatMessage, Slide, ApiCallLog, ExifData } from '../types';

let ai: GoogleGenAI;
let apiKeys: ApiKey[] = [];
let onApiKeysUpdate: (updatedKeys: ApiKey[]) => void = () => {};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1500; // ms
const RATE_LIMIT_COOLDOWN = 60 * 1000; // 60 seconds

export class AllKeysFailedError extends Error {
  public failedKeys: ApiKey[];
  constructor(message: string, failedKeys: ApiKey[]) {
    super(message);
    this.name = 'AllKeysFailedError';
    this.failedKeys = failedKeys;
  }
}

const initializeGemini = (key: string) => {
    ai = new GoogleGenAI({ apiKey: key });
};

export const initializeApiKeys = (initialKeys: ApiKey[], onUpdate: (keys: ApiKey[]) => void) => {
    apiKeys = initialKeys;
    onApiKeysUpdate = onUpdate;
    if (apiKeys.length > 0) {
        const activeKey = getNextActiveKey();
        if (activeKey) {
            initializeGemini(activeKey.value);
        }
    }
};

export const updateApiKeyState = (updatedKeys: ApiKey[]) => {
    apiKeys = updatedKeys;
    if (apiKeys.length > 0) {
        const activeKey = getNextActiveKey();
        if (activeKey && (!ai || (ai as any)._apiKey !== activeKey.value)) {
            initializeGemini(activeKey.value);
        }
    }
};

const getNextActiveKey = (): ApiKey | null => {
    const now = Date.now();

    // 1. Check for a pinned key first.
    const pinnedKey = apiKeys.find(k => k.isPinned);
    if (pinnedKey) {
        const isUnavailable = (pinnedKey.status === 'exhausted' || pinnedKey.status === 'rate_limited') && pinnedKey.resetTime && now < pinnedKey.resetTime;
        if (pinnedKey.status !== 'invalid' && pinnedKey.status !== 'permission_denied' && !isUnavailable) {
            return pinnedKey;
        }
        return null; // Pinned key is unusable, so we can't proceed.
    }

    // 2. Iterate through unpinned keys in order.
    for (const key of apiKeys.filter(k => !k.isPinned)) {
        const isUnavailable = (key.status === 'exhausted' || key.status === 'rate_limited') && key.resetTime && now < key.resetTime;
        if (key.status !== 'invalid' && key.status !== 'permission_denied' && !isUnavailable) {
            return key;
        }
    }
    
    return null;
};


const handleApiError = (error: any, key: ApiKey) => {
    const now = Date.now();
    const errorMessage = (error?.message || '').toLowerCase();
    const status = (error as any).status;
    
    let statusChanged = false;
    key.lastError = error.message;

    if (status === 403 || errorMessage.includes('permission denied')) {
        if (key.status !== 'permission_denied') {
            key.status = 'permission_denied';
            statusChanged = true;
        }
    } else if (status === 429 || errorMessage.includes('rate limit')) {
        if (key.status !== 'rate_limited') {
            key.status = 'rate_limited';
            key.resetTime = now + RATE_LIMIT_COOLDOWN;
            statusChanged = true;
        }
    } else if (errorMessage.includes('quota')) {
        if (key.status !== 'exhausted') {
            key.status = 'exhausted';
            key.resetTime = now + 24 * 60 * 60 * 1000;
            statusChanged = true;
        }
    } else if (status === 400 && errorMessage.includes('api key not valid')) {
        if (key.status !== 'invalid') {
            key.status = 'invalid';
            statusChanged = true;
        }
    }
    
    if (statusChanged) {
        onApiKeysUpdate([...apiKeys]);
    }
};

const isRetryableError = (error: any): boolean => {
    const errorMessage = (error.message || '').toLowerCase();
    const status = error.status;

    if (status === 403 || status === 429 || status === 400) return false;
    if (errorMessage.includes('permission denied') || errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('api key not valid')) return false;

    if (status >= 500 && status <= 599) return true;
    if (errorMessage.includes('network request failed') || errorMessage.includes('fetch')) return true;

    return false;
};


const makeApiCall = async <T>(
    apiCall: (client: GoogleGenAI) => Promise<T>,
    onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void,
): Promise<T> => {
    const callWithRetry = async (client: GoogleGenAI, key: ApiKey, keyLabel: string): Promise<T> => {
        let lastError: any = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                onLog({ key: key.value, status: 'attempting', message: `Вызов API (${keyLabel})${attempt > 1 ? `, попытка ${attempt}/${MAX_RETRIES}` : ''}...`});
                const result = await apiCall(client);
                onLog({ key: key.value, status: 'success', message: `Вызов API успешен.`});
                return result;
            } catch (error: any) {
                lastError = error;
                if (!isRetryableError(error)) {
                    throw error;
                }
                if (attempt < MAX_RETRIES) {
                    onLog({ key: key.value, status: 'info', message: `Сетевая ошибка, повтор через ${RETRY_DELAY / 1000}с...` });
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                }
            }
        }
        throw lastError;
    };

    const failedKeys: ApiKey[] = [];
    const now = Date.now();
    
    const keysToTry = apiKeys.find(k => k.isPinned) ? [apiKeys.find(k => k.isPinned)!] : apiKeys;

    for (const key of keysToTry) {
        // Automatically recover key if its cooldown has passed
        if ((key.status === 'exhausted' || key.status === 'rate_limited') && key.resetTime && now > key.resetTime) {
            key.status = 'active';
            key.resetTime = undefined;
            key.lastError = undefined;
            onApiKeysUpdate([...apiKeys]);
        }
        
        const isUnavailable = (key.status === 'exhausted' || key.status === 'rate_limited') && key.resetTime && now < key.resetTime;
        if (key.status === 'invalid' || key.status === 'permission_denied' || isUnavailable) {
            failedKeys.push(key);
            continue;
        };
        
        try {
            const client = new GoogleGenAI({ apiKey: key.value });
            return await callWithRetry(client, key, `ключ ...${key.value.slice(-4)}`);
        } catch (error: any) {
            handleApiError(error, key);
            failedKeys.push(key);
        }
    }

    const finalMessage = "Все доступные API ключи не смогли выполнить запрос.";
    onLog({ key: 'system', status: 'failed', message: finalMessage });
    throw new AllKeysFailedError(finalMessage, failedKeys);
};

/**
 * Проверяет валидность ОДНОГО API ключа, отправляя прямой, легковесный запрос к REST API Google.
 * Этот метод полностью изолирован и не зависит от состояния SDK или других ключей в приложении.
 * @param key API ключ для проверки.
 * @returns Статус ключа ('active', 'invalid', 'exhausted' и т.д.).
 */
export const checkApiKey = async (key: string): Promise<ApiKey['status']> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const maskedKey = key.length >= 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : '****';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
            })
        });

        const data = await response.json();

        // Handle API errors first
        if (data.error) {
            const errorMessage = (data.error.message || '').toLowerCase();
            const errorStatus = (data.error.status || '');
            console.error(`[Key Check Failed for ${maskedKey}]: ${data.error.code} - ${errorMessage}`, data.error);

            if (errorStatus === 'PERMISSION_DENIED' || errorMessage.includes('api key not enabled') || errorMessage.includes('generative language api has not been used')) {
                return 'permission_denied';
            }
            if (response.status === 429 && errorMessage.includes('rate limit')) {
                return 'rate_limited';
            }
            if (response.status === 429 || errorStatus === 'RESOURCE_EXHAUSTED' || errorMessage.includes('quota')) {
                return 'exhausted';
            }
            if (response.status === 400 && (errorMessage.includes('api key not valid') || errorMessage.includes('api_key_not_valid'))) {
                return 'invalid';
            }
            return 'invalid';
        }
        
        // Handle successful responses
        if (response.ok) {
            const usage = data.usageMetadata || {};
            console.log(
                `[Key Check OK for ${maskedKey}]:`,
                {
                    promptTokens: usage.promptTokenCount || 0,
                    completionTokens: usage.candidatesTokenCount || 0,
                    totalTokens: usage.totalTokenCount || 0,
                }
            );
            return 'active';
        }
        
        console.warn(`[Key Check] Unexpected response for ${maskedKey} (HTTP ${response.status})`, data);
        return 'invalid';

    } catch (error: any) {
        console.error(`[Key Check] Network or other error for ${maskedKey}:`, error);
        return 'invalid';
    }
};

export const createInitialPlan = (topic: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<GenerateContentResponse> => {
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
6. Твой ответ должен быть исключительно на русском языке.
`;

    return makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                 systemInstruction: "Ты — креативный и полезный ассистент, режиссер, который всегда отвечает на русском языке и помогает создавать великолепные презентации."
            }
        }),
        onLog
    );
};

const imageToPart = (image: UploadedImage): Part => ({
    inlineData: {
        mimeType: image.file.type,
        data: image.base64
    }
});

const formatExifForPrompt = (exif: ExifData | undefined): string => {
    if (!exif) return '';
    
    const parts = [];
    if (exif.DateTimeOriginal) {
        parts.push(`Снято: ${exif.DateTimeOriginal.toLocaleString('ru-RU')}`);
    }
    if (exif.Make || exif.Model) {
        parts.push(`Камера: ${[exif.Make, exif.Model].filter(Boolean).join(' ')}`);
    }
    return `(Метаданные: ${parts.join(', ')})`;
};

export const analyzeNextFrame = async (
    currentImage: UploadedImage, 
    previousImages: UploadedImage[], 
    currentStorySummary: string, 
    onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void
): Promise<{ imageDescription: string; updatedStory: string; }> => {
    const previousContext = previousImages.length > 0 
        ? `Контекст предыдущих кадров:\n${previousImages.map((img, i) => `Кадр ${i + 1}: ${img.description}`).join('\n')}`
        : 'Это первый кадр для анализа.';

    const locationInfo = currentImage.locationDescription ? `Место съемки: ${currentImage.locationDescription}.` : '';
    const exifInfo = formatExifForPrompt(currentImage.exif);

    const currentStoryPrompt = `Вот первоначальный план истории, который мы создали:\n"${currentStorySummary}"`;

    const prompt = `
Ты - ИИ-режиссер, уточняющий сценарий презентации на основе реальных фотографий.
${currentStoryPrompt}
${previousContext}

Твоя задача - проанализировать НОВЫЙ кадр и УТОЧНИТЬ план истории, интегрировав в него этот кадр.

ДАННЫЕ НОВОГО КАДРА:
${locationInfo} ${exifInfo}

ИНСТРУКЦИИ:
1. Проанализируй новый кадр. Постарайся сопоставить его с одной из частей первоначального плана.
2. Сгенерируй ОЧЕНЬ краткое описание для этого кадра (одно предложение), которое подчеркивает его роль в истории.
3. Обнови общий план истории, делая его более конкретным и живым на основе предоставленного изображения. Если кадр не вписывается, адаптируй историю. План должен оставаться связным повествованием.
4. Верни результат в формате JSON. Ответ должен быть только на русском языке.
`;

    const response: GenerateContentResponse = await makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }, imageToPart(currentImage)] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        imageDescription: {
                            type: Type.STRING,
                            description: "Краткое описание нового кадра (1 предложение) в контексте истории."
                        },
                        updatedStory: {
                            type: Type.STRING,
                            description: "Обновленный и более детализированный общий план презентации."
                        }
                    },
                    required: ["imageDescription", "updatedStory"]
                }
            }
        }),
        onLog
    );

    try {
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        if (result.imageDescription && result.updatedStory) {
            return result;
        } else {
            throw new Error("JSON response from AI is missing required keys.");
        }
    } catch (e) {
        console.error("Failed to parse JSON response from AI:", response.text, e);
        throw new Error("Не удалось обработать ответ от ИИ. Ответ не является валидным JSON.");
    }
};

export const generateStoryboard = (finalStory: string, images: UploadedImage[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<GenerateContentResponse> => {
    const imageContext = images.map((img, i) => `- ID изображения: ${img.id}, Описание: ${img.description || 'общее фото'}`).join('\n');
    
    const prompt = `
Ты - ИИ-режиссер. Твоя задача - превратить финальный план истории в структурированную раскадровку (storyboard) для презентации.
ФИНАЛЬНЫЙ ПЛАН:
---
${finalStory}
---
ДОСТУПНЫЕ ИЗОБРАЖЕНИЯ:
---
${imageContext}
---
ИНСТРУКЦИИ:
1. Создай от 3 до 7 слайдов на основе плана.
2. Для КАЖДОГО слайда определи:
   - "title": Короткий, емкий заголовок (3-5 слов), который будет показан на слайде.
   - "script": Полный текст для диктора (2-4 предложения). Этот текст будет озвучен, но не полностью показан на экране.
   - "textOverlay": Очень короткий текст (макс. 10 слов), который будет наложен на изображение. Он должен дополнять, а не дублировать речь диктора. Например, ключевая мысль, дата или цитата.
   - "imageId": ID наиболее подходящего изображения из списка "ДОСТУПНЫЕ ИЗОБРАЖЕНИЯ". Выбери самое релевантное изображение для каждого слайда. НЕ ИСПОЛЬЗУЙ один и тот же imageId для разных слайдов, если это возможно.
   - "speaker": Индекс диктора (число, начиная с 0). Если тема предполагает диалог (например, интервью, обсуждение), чередуй дикторов (0 и 1). Для обычного повествования используй 0.
   - "podcastScript": Если тема подходит для диалога (интервью, несколько точек зрения), создай здесь УНИКАЛЬНУЮ, разговорную версию текста, имитирующую живой диалог между спикерами. Не копируй просто "script". Если тема не подходит, оставь это поле пустым.
   - "needsImage": true, если для этого слайда нет подходящего изображения в списке, иначе false.
   - "suggestions": Если "needsImage" равно true, предложи варианты для поиска или генерации изображения.
     - "search": Ключевые слова для поиска стокового фото (например, "древние руины рима").
     - "generate": Идея для генерации изображения (например, "старинная карта италии с компасом").
3. ВЕРНИ РЕЗУЛЬТАТ ИСКЛЮЧИТЕЛЬНО В ФОРМАТЕ JSON-МАССИВА. Никакого текста до или после JSON. Ответ должен быть только на русском языке.
`;

    return makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            script: { type: Type.STRING },
                            textOverlay: { type: Type.STRING },
                            imageId: { type: Type.STRING },
                            speaker: { type: Type.INTEGER },
                            podcastScript: { type: Type.STRING },
                            needsImage: { type: Type.BOOLEAN },
                            suggestions: {
                                type: Type.OBJECT,
                                properties: {
                                    search: { type: Type.STRING },
                                    generate: { type: Type.STRING }
                                }
                            }
                        },
                        required: ["title", "script", "textOverlay", "imageId", "needsImage", "speaker"]
                    }
                }
            }
        }),
        onLog
    );
};

export const continueChat = (messages: ChatMessage[], images: UploadedImage[], slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<GenerateContentResponse> => {
    const history = messages.map(msg => `${msg.role === 'user' ? 'Пользователь' : 'ИИ-Режиссер'}: ${msg.parts[0].text}`).join('\n\n');
    const currentStoryboard = JSON.stringify(slides, null, 2);

    const prompt = `
Ты - ИИ-режиссер. Мы работаем над раскадровкой презентации.
ТЕКУЩАЯ РАСКАДРОВКА (в JSON):
---
${currentStoryboard}
---
ИСТОРИЯ ДИАЛОГА:
---
${history}
---
ЗАДАЧА:
Проанализируй последнее сообщение от пользователя и обнови раскадровку в соответствии с его просьбой.
ИНСТРУКЦИИ:
1. Внеси запрошенные изменения в JSON-структуру раскадровки (измени текст, порядок, speaker, podcastScript, добавь или удали слайды).
2. Сохрани ту же структуру JSON, как в "ТЕКУЩЕЙ РАСКАДРОВКЕ".
3. ВЕРНИ ТОЛЬКО ОБНОВЛЕННЫЙ JSON-МАССИВ СЛАЙДОВ. Никакого дополнительного текста или объяснений. Ответ должен быть только на русском языке.
`;

    return makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "Ты — полезный ассистент, режиссер, который всегда отвечает на русском языке и возвращает данные в формате JSON.",
                responseMimeType: "application/json"
            }
        }),
        onLog
    );
};


export const suggestMusic = (concept: string, slides: Slide[], onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<GenerateContentResponse> => {
    const storySummary = slides.map(s => s.script).join(' ');
    const prompt = `
    Проанализируй тему ("${concept}") и краткое содержание ("${storySummary}") презентации.
    Предложи 3-5 подходящих настроений или жанров для фоновой музыки.
    Примеры: "cinematic", "dramatic", "inspirational", "corporate", "ambient", "electronic", "upbeat", "reflective", "piano".
    Верни результат в виде JSON-массива строк. Например: ["cinematic", "dramatic", "inspirational"].
    Ответ должен быть только на английском языке (для сопоставления с тегами).
    `;
    return makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }),
        onLog
    );
};

export const generateImage = async (query: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<string> => {
    const response: any = await makeApiCall(
        (client) => client.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `cinematic photo, ${query}`, // Add keywords for better quality
            config: {
                numberOfImages: 1,
                aspectRatio: "16:9"
            }
        }),
        onLog
    );
    return response.generatedImages[0].image.imageBytes;
};

export const generateVideo = (slides: Slide[], images: UploadedImage[], style: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<any> => {
    const combinedScript = slides.map(s => s.script).join('\n\n');
    const prompt = `Создай концептуальное видео в стиле "${style}" на основе следующего сценария: ${combinedScript}. Видео должно отражать общее настроение и ключевые моменты истории.`;
    
    // Use the middle image as a more representative seed
    const seedImage = images[Math.floor(images.length / 2)];

    return makeApiCall(
        (client) => client.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt,
            image: seedImage ? {
                imageBytes: seedImage.base64,
                mimeType: seedImage.file.type,
            } : undefined,
            config: {
                numberOfVideos: 1,
            }
        }),
        onLog
    );
};

export const checkVideoStatus = (operation: any, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<any> => {
    return makeApiCall(
        (client) => client.operations.getVideosOperation({ operation }),
        onLog
    );
};

export const generateSsmlScript = (script: string, onLog: (log: Omit<ApiCallLog, 'timestamp'>) => void): Promise<GenerateContentResponse> => {
    const prompt = `
    Ты — ИИ-коуч по актерскому мастерству для дикторов. Твоя задача — преобразовать простой текст в выразительный сценарий с использованием SSML (Speech Synthesis Markup Language) для улучшения эмоциональности и реализма речи.

    ИНСТРУКЦИИ:
    1.  Проанализируй следующий текст: "${script}"
    2.  Перепиши его, добавив SSML-теги для управления интонацией, паузами, скоростью и акцентами.
    3.  Используй теги, такие как <break time="...s"/> для пауз, <emphasis level="..."> для выделения слов, и <prosody rate="..." pitch="..."> для изменения скорости и высоты голоса.
    4.  Цель — сделать речь живой, естественной и соответствующей содержанию.
    5.  Верни только текст с SSML-тегами. Никаких объяснений или дополнительного форматирования.
    `;
    return makeApiCall(
        (client) => client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "Ты — полезный ассистент, который преобразует текст в SSML.",
                thinkingConfig: { thinkingBudget: 0 } // Low latency needed for this
            }
        }),
        onLog
    );
};


export const getCurrentApiKey = (): string | null => {
    const activeKey = getNextActiveKey();
    return activeKey ? activeKey.value : null;
};