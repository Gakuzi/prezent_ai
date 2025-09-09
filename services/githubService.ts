import { AppSettings, GithubUser } from '../types';

const GIST_API_URL = 'https://api.github.com/gists';
const GIST_FILENAME = 'presentation-master-settings.json';
const GIST_DESCRIPTION = 'Настройки для приложения "Мастер Презентаций ИИ"';

const commonHeaders = (token: string) => ({
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
});

export class GitHubAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitHubAuthError';
    }
}

export const getUser = async (token: string): Promise<GithubUser> => {
    const response = await fetch('https://api.github.com/user', {
        headers: commonHeaders(token),
    });
    if (!response.ok) {
        if (response.status === 401) {
            throw new GitHubAuthError('Неверный или просроченный токен GitHub.');
        }
        throw new Error('Не удалось получить данные пользователя с GitHub.');
    }
    return response.json();
};

export const findExistingGist = async (token: string): Promise<string | null> => {
    const response = await fetch(GIST_API_URL, {
        headers: commonHeaders(token)
    });
    if (!response.ok) {
        throw new Error("Не удалось получить список Gists с GitHub.");
    }
    const gists = await response.json();
    const settingsGist = gists.find((g: any) => g.description === GIST_DESCRIPTION && g.files[GIST_FILENAME]);
    return settingsGist ? settingsGist.id : null;
};

export const saveSettings = async (token: string, settings: AppSettings, gistId: string | null): Promise<string> => {
    const content = JSON.stringify(settings, null, 2);
    const body = {
        description: GIST_DESCRIPTION,
        files: {
            [GIST_FILENAME]: {
                content: content,
            },
        },
    };
    
    let url = GIST_API_URL;
    let method = 'POST';

    if (gistId) {
        url = `${GIST_API_URL}/${gistId}`;
        method = 'PATCH';
    } else {
        (body as any).public = false;
    }

    const response = await fetch(url, {
        method: method,
        headers: {
            ...commonHeaders(token),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        const action = gistId ? `обновить Gist (${gistId})` : 'создать новый Gist';
        throw new Error(`Не удалось ${action}. Ошибка GitHub API: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id;
};


export const getSettingsFromGist = async (token: string, gistId?: string | null): Promise<{ settings: AppSettings, gistId: string } | null> => {
    const idToFetch = gistId || await findExistingGist(token);

    if (!idToFetch) {
        return null; // No Gist exists yet
    }

    const response = await fetch(`${GIST_API_URL}/${idToFetch}`, {
        method: 'GET',
        headers: commonHeaders(token),
    });

    if (!response.ok) {
        if (response.status === 404) {
            return null; // Gist was deleted remotely, treat as non-existent
        }
        if (response.status === 401) {
             throw new GitHubAuthError('Неверный или просроченный токен GitHub.');
        }
        const errorData = await response.json();
        throw new Error(`Ошибка GitHub API: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const file = data.files[GIST_FILENAME];
    if (!file) {
        throw new Error(`Файл '${GIST_FILENAME}' не найден в Gist.`);
    }

    try {
        const settings = JSON.parse(file.content);
        return { settings, gistId: idToFetch };
    } catch (e) {
        throw new Error(`Не удалось разобрать настройки из Gist: ${e instanceof Error ? e.message : String(e)}`);
    }
};