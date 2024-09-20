import { addImageToGallery, showGallery, resetGallery } from './gallery';
import { State } from './state';
import { sleep, updateProgressBar } from './utils';

export const processImages = async (state: State): Promise<void> => {
    if (state.isProcessing) return;

    state.isProcessing = true;
    state.isCancelled = false;
    resetGallery(state);


    state.loaded = 0;
    state.loading = 0;
    state.finishedLinks = 0;
    state.processedUrls.clear();
    state.isCancelled = false;

    const elements = [
        ...Array.from(document.querySelectorAll('img')),
        ...Array.from(document.querySelectorAll('a'))
    ];

    await processElements(state, elements);
    state.isProcessing = false;

    if (state.isCancelled) {
        console.log("Image processing was cancelled");
    }
};

export const processElements = async (state: State, elements: Element[]): Promise<void> => {
    const MAX_ITERATIONS = 1000;
    let iterationCount = 0;

    const onFirstImageLoaded = () => {
        if (!state.isGalleryVisible) {
            showGallery(state);
        }
    };

    for (const element of elements) {
        if (state.isCancelled || iterationCount >= MAX_ITERATIONS) break;

        if (element instanceof HTMLImageElement) {
            if (element.src) {
                await loadImage(state, element, element.src, onFirstImageLoaded);
            }
        } else if (element instanceof HTMLAnchorElement) {
            const imageUrl = await processLink(state, element.href);
            if (imageUrl) {
                await loadImage(state, new Image(), imageUrl, onFirstImageLoaded);
            }
        }
        iterationCount++;
    }
};

export const processLink = async (state: State, url: string): Promise<string | null> => {
    if (!url) return null;

    try {
        const response = await new Promise<string | null>((resolve) => {
            chrome.runtime.sendMessage({ action: 'fetchImage', url: url }, async (response: { success: boolean; url?: string; reason?: string }) => {
                if (response.success && response.url) {
                    // Respect emphasis when resolving the image URL
                    if (state.emphasis && response.url.includes(state.emphasis)) {
                        const fetchResponse = await fetchWithRateLimit(state, response.url);
                        if (fetchResponse && fetchResponse.ok) {
                            resolve(response.url);
                        } else {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                } else if (url.includes('/media/') || (state.emphasis && url.includes(state.emphasis))) {
                    const fetchResponse = await fetchWithRateLimit(state, url);
                    resolve(fetchResponse && fetchResponse.ok ? url : null);
                } else {
                    resolve(null);
                }
            });
        });
        return response;
    } catch (error) {
        console.error('Error processing link:', error);
        return null;
    }
};

export const loadImage = async (
    state: State,
    img: HTMLImageElement,
    src: string,
    onFirstImageLoaded: () => void
): Promise<{ success: boolean; image?: HTMLImageElement }> => {
    if (!src) return { success: false };

    try {
        const tempImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const tempImg = new Image();
            tempImg.onload = () => resolve(tempImg);
            tempImg.onerror = reject;
            tempImg.src = src;
        });

        state.loaded++;
        state.loading--;
        state.finishedLinks++;
        updateProgressBar(state);

        if (isImageRelevant(tempImg, state)) {
            addImageToGallery(state, { src: tempImg.src, width: tempImg.naturalWidth, height: tempImg.naturalHeight });
            if (state.loaded === 1) onFirstImageLoaded();
            return { success: true, image: tempImg };
        } else {
            return { success: false };
        }
    } catch (error) {
        console.error('Error loading image:', error);
        state.loading--;
        state.finishedLinks++;
        updateProgressBar(state);
        return { success: false };
    }
};

const isImageRelevant = (img: HTMLImageElement, state: State): boolean => {
    if (!img.src || img.naturalWidth === 0 || img.naturalHeight === 0) return false;

    if (state.emphasis && img.src.includes(state.emphasis)) {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const irrelevantPatterns = ['icon', 'logo', 'banner', 'avatar', 'button'];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        return (
            aspectRatio >= 0.5 && aspectRatio <= 2 &&
            !irrelevantPatterns.some(pattern => img.src.toLowerCase().includes(pattern)) &&
            validExtensions.some(ext => img.src.toLowerCase().endsWith(ext)) &&
            (state.minImageSize === 0 || Math.min(img.naturalWidth, img.naturalHeight) >= state.minImageSize)
        );
    }

    return false;
};

export const processMainContent = async (state: State, url: string, remainingDepth: number, currentDepth: number): Promise<void> => {
    if (remainingDepth < 0 || state.isCancelled || currentDepth > state.maxDepth || !url) return;

    try {
        await Promise.race([
            processMainContentLogic(state, url, remainingDepth, currentDepth),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Processing timeout')), 30000))
        ]);
    } catch (error) {
        if (error instanceof Error && error.message === 'Processing timeout') {
            console.warn('Processing timed out for URL:', url);
        } else {
            console.error('Error in processMainContent:', error);
        }
    }
};

const processMainContentLogic = async (state: State, url: string, remainingDepth: number, currentDepth: number): Promise<void> => {
    if (shouldSkipProcessing(state, url) || currentDepth > state.maxDepth || !url) return;

    state.processedUrls.add(url);
    updateProgressBar(state);

    try {
        const response = await fetchWithRateLimit(state, url);
        if (!response) return;

        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const mainContent = findMainContent(doc, url);

        if (!mainContent) {
            console.warn('No main content found for URL:', url);
            return;
        }

        await processImageLinks(state, findImageLinks(mainContent, url));

        if (remainingDepth > 0 && currentDepth < state.maxDepth) {
            await processPageLinks(state, mainContent, url, remainingDepth, currentDepth);
        }
    } catch (error) {
        console.error('Error in processMainContent:', error);
    }
};

const processPageLinks = async (state: State, mainContent: HTMLElement, url: string, remainingDepth: number, currentDepth: number): Promise<void> => {
    const pageLinks = findRelevantPageLinks(mainContent, url, state);
    const prioritizedLinks = prioritizeLinks(pageLinks, url, state.similarityScore, state);

    for (const pageLink of prioritizedLinks.slice(0, 5)) {
        if (state.isCancelled) break;
        await processMainContent(state, pageLink, remainingDepth - 1, currentDepth + 1);
    }
};

const prioritizeLinks = (links: string[], currentUrl: string, similarityThreshold: number, state: State): string[] => {
    const currentUrlObj = new URL(currentUrl);
    return links
        .map(link => {
            const linkObj = new URL(link);
            const score = calculateSimilarityScore(currentUrlObj, linkObj, state);
            return { link, score };
        })
        .filter(item => item.score >= similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .map(item => item.link);
};

const calculateSimilarityScore = (currentUrl: URL, linkUrl: URL, state: State): number => {
    const maxScore = 100;
    if (state.emphasis && linkUrl.href.includes(state.emphasis)) return maxScore;

    if (state.similarityScore === 0 && state.minImageSize === 0 && !state.emphasis) return maxScore;

    const score = [
        calculateProtocolScore(currentUrl, linkUrl),
        calculateHostnameScore(currentUrl, linkUrl),
        calculatePathScore(currentUrl, linkUrl),
        calculateQueryParamScore(currentUrl, linkUrl),
        calculateKeywordBonus(linkUrl)
    ].reduce((acc, val) => acc + val, 0);

    return Math.min(Math.round(score), maxScore);
};

const calculateProtocolScore = (currentUrl: URL, linkUrl: URL): number => currentUrl.protocol === linkUrl.protocol ? 2 : 0;

const calculateHostnameScore = (currentUrl: URL, linkUrl: URL): number => {
    const hostnameParts = currentUrl.hostname.split('.');
    const linkHostnameParts = linkUrl.hostname.split('.');
    const similarity = hostnameParts.filter((part, index) => part === linkHostnameParts[index]).length / Math.max(hostnameParts.length, linkHostnameParts.length);
    return similarity * 40;
};

const calculatePathScore = (currentUrl: URL, linkUrl: URL): number => {
    const pathParts = currentUrl.pathname.split('/').filter(Boolean);
    const linkPathParts = linkUrl.pathname.split('/').filter(Boolean);
    const similarity = pathParts.length > 0 && linkPathParts.length > 0 ?
        pathParts.filter((part, index) => part === linkPathParts[index]).length / Math.max(pathParts.length, linkPathParts.length) :
        0;
    return similarity * 50;
};

const calculateQueryParamScore = (currentUrl: URL, linkUrl: URL): number => {
    const currentParams = new URLSearchParams(currentUrl.search);
    const linkParams = new URLSearchParams(linkUrl.search);
    const sharedParams = Array.from(currentParams.keys()).filter(key => linkParams.has(key));
    const similarity = Math.max(currentParams.size, linkParams.size) > 0 ?
        sharedParams.length / Math.max(currentParams.size, linkParams.size) :
        0;
    return similarity * 3;
};

const calculateKeywordBonus = (linkUrl: URL): number => {
    const relevantKeywords = ['gallery', 'album', 'photos', 'images'];
    return relevantKeywords.some(keyword => linkUrl.pathname.toLowerCase().includes(keyword)) ? 5 : 0;
};

export const findMainContent = (doc: Document, url: string): HTMLElement => {
    const mainSelectors = [
        'main', '#main', '.main', 'article', '.post', '.content', '#content', '.entry-content', '.post-content',
        '.gallery', '#gallery', '.album', '#album', '.photos', '#photos', '.images', '#images'
    ];
    return mainSelectors.map(selector => doc.querySelector(selector)).find(element => element) as HTMLElement || doc.body;
};

export const findImageLinks = (element: Element, baseUrl: string): string[] => {
    const imgElements = element.querySelectorAll('img[src]:not([src^="data:"]):not([src^="blob:"])');
    const backgroundElements = element.querySelectorAll('[style*="background-image"]');

    const imageLinks = [
        ...Array.from(imgElements).map(img => {
            const src = img.getAttribute('src');
            return src ? new URL(src, baseUrl).toString() : '';
        }),
        ...Array.from(backgroundElements).map(el => {
            const style = window.getComputedStyle(el);
            const match = style.getPropertyValue('background-image').match(/url\(['"]?(.*?)['"]?\)/);
            return match ? new URL(match[1], baseUrl).toString() : '';
        })
    ];

    return imageLinks.filter(link => link && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(link.split('.').pop()?.toLowerCase() || ''));
};

const findRelevantPageLinks = (element: Element, baseUrl: string, state: State): string[] => {
    const linkElements = element.querySelectorAll('a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])');
    const currentUrlObj = new URL(baseUrl);
    const seenPaths = new Set<string>();

    return Array.from(linkElements)
        .map(link => {
            const href = link.getAttribute('href');
            return href ? new URL(href, baseUrl).toString() : '';
        })
        .filter(absoluteUrl => {
            if (!absoluteUrl) return false;
            const linkUrlObj = new URL(absoluteUrl);
            return linkUrlObj.hostname === currentUrlObj.hostname &&
                !state.processedUrls.has(absoluteUrl) &&
                !state.excludePatterns.some(pattern => absoluteUrl.includes(pattern)) &&
                !seenPaths.has(linkUrlObj.pathname) &&
                calculateSimilarityScore(currentUrlObj, linkUrlObj, state) >= state.similarityScore;
        })
        .map(absoluteUrl => {
            seenPaths.add(new URL(absoluteUrl).pathname);
            return absoluteUrl;
        });
};

const fetchQueue: (() => Promise<Response | null>)[] = [];
let isFetching = false;
let lastFetchTime = 0;

export const fetchWithRateLimit = async (state: State, url: string): Promise<Response | null> => {
    if (!url) return null;

    return new Promise((resolve) => {
        const fetchTask = async (): Promise<Response | null> => {
            const now = Date.now();
            const timeSinceLastFetch = now - lastFetchTime;
            if (timeSinceLastFetch < state.rateLimit) {
                await sleep(state.rateLimit - timeSinceLastFetch);
            }
            try {
                const response = await fetch(url);
                lastFetchTime = Date.now();
                resolve(response);
                return response;
            } catch (error) {
                console.error('Error fetching URL:', error);
                resolve(null);
                return null;
            }
        };

        fetchQueue.push(fetchTask);
        processQueue();
    });
};

const processQueue = async () => {
    if (isFetching || fetchQueue.length === 0) return;

    isFetching = true;
    const task = fetchQueue.shift();
    if (task) {
        await task();
        isFetching = false;
        processQueue();
    }
};

const shouldSkipProcessing = (state: State, url: string): boolean => {
    return !url ||
        state.processedUrls.has(url) ||
        state.fetchCount >= state.maxConcurrentFetches ||
        state.excludePatterns.some(pattern => url.includes(pattern));
};

const processImageLinks = async (state: State, imageLinks: string[]): Promise<void> => {
    const onFirstImageLoaded = () => {
        if (!state.isGalleryVisible) {
            showGallery(state);
        }
    };

    for (const link of imageLinks) {
        if (state.isCancelled || !link) break;
        await loadImage(state, new Image(), link, onFirstImageLoaded);
        state.finishedLinks++;
        updateProgressBar(state);
    }
};

export const cancelProcessingImages = (state: State): void => {
    state.isCancelled = true;
    state.isProcessing = false;
    console.log("Image processing cancellation requested");
};