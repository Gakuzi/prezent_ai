export interface UploadedImage {
  id: string;
  file: File;
  base64: string;
  exif?: ExifData;
  source: 'user' | 'ai';
  query?: string; // For AI-generated images
  locationDescription?: string;
  description?: string; // Result of individual image analysis
}

export interface ExifData {
  latitude?: number;
  longitude?: number;
  DateTimeOriginal?: Date;
  Make?: string;
  Model?: string;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  parts: { text: string }[];
  suggestions?: string[];
  generatedImage?: {
    base64: string;
    mimeType: string;
  };
}

export interface Slide {
  title: string;
  script: string;
  imageId: string | null; // Use image ID for a stable link
  speaker: number;
  textOverlay?: string; // Short text to display on the slide
  podcastScript?: string;
  needsImage?: boolean; // Does this slide need a user to find/generate an image?
  suggestions?: { // AI suggestions for finding/generating an image
      search?: string;
      generate?: string;
  }
}

export interface AnalysisProgress {
  currentIndex: number;
  total: number;
  currentAction: string;
  matrixText: string;
  isSynthesizing?: boolean;
}

export type ExportFormat = 'pdf' | 'pptx' | 'video' | 'gsheets' | 'link' | 'html';

// A profile for a single speaker's voice
export interface VoiceProfile {
  voiceURI: string | null;
  rate: number;
  pitch: number;
}

// Replaces the old VoiceSettings
export interface VoiceSettings {
  voices: VoiceProfile[];
  isPodcastMode: boolean;
  aiEnhancedNarration: boolean;
}

export interface ApiKey {
  value: string;
  status: 'active' | 'exhausted' | 'invalid' | 'unknown' | 'rate_limited' | 'permission_denied';
  lastChecked?: number;
  resetTime?: number;
  isPinned?: boolean;
  projectId?: string;
  lastError?: string;
}

export type ModelHealthStatus = 'active' | 'exhausted' | 'invalid' | 'unknown';

export interface GithubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

export interface ApiCallLog {
  timestamp: number;
  key: string;
  status: 'attempting' | 'success' | 'failed' | 'info';
  message: string;
}

export interface MusicTrack {
    name: string;
    url: string;
    moods: string[];
}

// For Pexels API
export interface PexelsImage {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographer_url: string;
    photographer_id: number;
    avg_color: string;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        small: string;
        portrait: string;
        landscape: string;
        tiny: string;
    };
    liked: boolean;
    alt: string;
}

export interface PexelsResponse {
    page: number;
    per_page: number;
    photos: PexelsImage[];
    total_results: number;
    next_page?: string;
}

export interface AppSettings {
    apiKeys: ApiKey[];
    voiceSettings: VoiceSettings;
    pexelsApiKey: string | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
