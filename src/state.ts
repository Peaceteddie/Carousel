import Swiper from 'swiper';
import { config } from './config';

export interface FetchQueueItem {
    url: string;
    depth: number;
    resolve: (value: Response | null) => void;
    updateProgressBar: () => void;
}

export interface State {
    dupPics: Set<string>;
    emphasis: string;
    excludePatterns: string[];
    fetchCount: number;
    finishedLinks: number;
    galleryContainer: HTMLDivElement | null;
    isCancelled: boolean;
    isGalleryVisible: boolean;
    isProcessing: boolean;
    loaded: number;
    loading: number;
    maxConcurrentFetches: number;
    maxDepth: number;
    minImageSize: number;
    processedUrls: Set<string>;
    progressBar: HTMLDivElement | null;
    rateLimit: number;
    similarityScore: number;
    stretchImages: boolean;
    swiper: Swiper | null;
    totalLinks: number;
}

const state: State = {
    dupPics: new Set<string>(),
    emphasis: "",
    excludePatterns: config.DEFAULT_EXCLUDE_PATTERNS,
    fetchCount: 0,
    finishedLinks: 0,
    galleryContainer: null,
    isCancelled: false,
    isGalleryVisible: false,
    isProcessing: false,
    loaded: 0,
    loading: 0,
    maxConcurrentFetches: config.DEFAULT_MAX_CONCURRENT_FETCHES,
    maxDepth: config.DEFAULT_MAX_DEPTH,
    minImageSize: config.DEFAULT_MIN_IMAGE_SIZE,
    processedUrls: new Set<string>(),
    progressBar: null,
    rateLimit: config.DEFAULT_RATE_LIMIT,
    similarityScore: 0,
    stretchImages: false,
    swiper: null,
    totalLinks: 0
};

export async function saveState() {
    await chrome.storage.sync.set(state);
}

export async function loadState() {
    const loadedState = await chrome.storage.sync.get(null);
    Object.assign(state, loadedState);
}

export function resetSetting(key: keyof State) {
    if (key in config) {
        (state[key] as any) = (config as any)[key];
    }
}

export const getState = (): State => {
    return state;
};