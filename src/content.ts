import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import * as config from './config';
import { createGalleryContainer, initializeSwiper, setGalleryVisibility } from './gallery';
import { cancelProcessingImages, processMainContent } from './imageProcessing';
import { settingsManager } from './settingsManager';
import { State } from './state';
import { updateProgressBar } from './utils';

const state: State = {
    dupPics: new Set<string>(),
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
    similarityScore: 5,
    stretchImages: false,
    swiper: null,
    totalLinks: 0
};

const resetState = (): void => {
    Object.assign(state, {
        processedUrls: new Set<string>(),
        dupPics: new Set<string>(),
        fetchCount: 0,
        finishedLinks: 0,
        isCancelled: false,
        isProcessing: false,
        loaded: 0,
        loading: 0,
        totalLinks: 0
    });
    if (state.galleryContainer) {
        state.galleryContainer.innerHTML = '';
    }
    if (state.swiper) {
        state.swiper.destroy();
        state.swiper = null;
    }
    if (state.progressBar) {
        state.progressBar.style.display = 'none';
    }
};

const setupMessageListeners = (): void => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Content script received message:", message.action);

        switch (message.action) {
            case 'executeMainAndProcess':
                handleExecuteMainAndProcess().then(() => {
                    sendResponse({ status: 'Success', message: 'Main process completed' });
                }).catch((error) => {
                    sendResponse({ status: 'Error', message: error.message });
                });
                return true;

            case 'toggleGalleryVisibility':
                handleToggleGalleryVisibility();
                sendResponse({ status: 'Success', message: 'Gallery visibility toggled' });
                return false;

            case 'cancelProcessingImages':
                cancelProcessingImages(state);
                sendResponse({ status: 'Success', message: 'Processing cancelled' });
                break;

            case 'isContentScriptReady':
                sendResponse({ ready: true });
                return false;

            default:
                console.warn('Unknown message action:', message.action);
                sendResponse({ status: 'Error', message: 'Unknown action' });
                return false;
        }
    });
};

async function handleExecuteMainAndProcess(): Promise<void> {
    if (state.isProcessing) {
        throw new Error('Already processing images');
    }

    try {
        resetState();
        await loadSettings();
        state.isProcessing = true;
        state.isCancelled = false;
        const url = window.location.href;

        console.log('Starting main process with settings:', {
            maxDepth: state.maxDepth,
            rateLimit: state.rateLimit,
            minImageSize: state.minImageSize,
            maxConcurrentFetches: state.maxConcurrentFetches,
            url: url
        });

        // Clear existing gallery
        if (state.galleryContainer) {
            state.galleryContainer.innerHTML = '';
        }
        state.dupPics.clear();
        if (state.swiper) {
            state.swiper.destroy();
            state.swiper = null;
        }

        state.totalLinks = 0;
        state.finishedLinks = 0;
        updateProgressBar(state);

        await processMainContent(state, url, state.maxDepth, 0);
        setGalleryVisibility(state, true);
    } catch (error) {
        console.error('[Main] Error in main process:', error);
        throw new Error('An error occurred during processing');
    } finally {
        state.isProcessing = false;
        if (state.progressBar) {
            state.progressBar.style.display = 'none';
        }
    }
}

const handleToggleGalleryVisibility = (): void => {
    if (!state.galleryContainer) {
        state.galleryContainer = createGalleryContainer();
    }
    if (!state.swiper) {
        state.swiper = initializeSwiper(state.galleryContainer as HTMLElement) || null;
    }
    setGalleryVisibility(state, !state.isGalleryVisible);
};

const loadSettings = async (): Promise<void> => {
    const settings = await settingsManager.loadSettings();
    Object.assign(state, settings);
    state.rateLimit = settings.rateLimit || config.DEFAULT_RATE_LIMIT;
    state.maxDepth = settings.maxDepth || config.DEFAULT_MAX_DEPTH;
};

setupMessageListeners();