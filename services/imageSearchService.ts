import { PexelsResponse } from '../types';

let pexelsApiKey: string | null = null;

/**
 * Initializes the Pexels service with a user-provided API key.
 * @param {string | null} key The Pexels API key.
 */
export const initializePexels = (key: string | null) => {
    pexelsApiKey = key;
};

/**
 * Checks if the Pexels API key is configured.
 * @returns {boolean} True if the key is present, false otherwise.
 */
export const isPexelsConfigured = (): boolean => !!pexelsApiKey;

export const searchPexelsImages = async (query: string): Promise<PexelsResponse> => {
    if (!pexelsApiKey) {
        throw new Error("Ключ Pexels API не настроен. Пожалуйста, добавьте его в настройках.");
    }

    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&locale=ru-RU`, {
        headers: {
            Authorization: pexelsApiKey,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
             throw new Error("Неверный API ключ для Pexels. Пожалуйста, проверьте его в настройках.");
        }
        throw new Error(`Ошибка при поиске изображений: ${response.statusText}`);
    }

    return response.json();
};