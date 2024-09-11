import { addImageToGallery, showGallery } from './gallery';
import { State } from './state';
import { sleep, updateProgressBar } from './utils';

export const processImages = async (state: State): Promise<void> => {
    if (state.isProcessing) {
        return;
    }
    state.isProcessing = true;
    state.isCancelled = false;
    const images = Array.from(document.querySelectorAll('img'));
    const links = Array.from(document.querySelectorAll('a'));
    const elements = [...images, ...links];
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
        if (state.isCancelled) {
            console.log("Processing cancelled");
            break;
        }
        if (iterationCount >= MAX_ITERATIONS) break;
        if (element instanceof HTMLImageElement) {
            await loadImage(state, element, element.src, onFirstImageLoaded);
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
    return new Promise<string | null>((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetchImage', url: url }, async (response: { success: boolean; url?: string; reason?: string }) => {
            if (response.success && response.url) {
                resolve(response.url);
            } else if (url.includes('/media/')) {
                const fetchResponse = await fetchWithRateLimit(state, url);
                if (fetchResponse && fetchResponse.ok) {
                    resolve(url);
                } else {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    }).catch(error => {
        console.error('Error processing link:', error);
        return null;
    });
};

export const loadImage = async (
    state: State,
    img: HTMLImageElement,
    src: string,
    onFirstImageLoaded: () => void
): Promise<{ success: boolean; image?: HTMLImageElement }> => {
    return new Promise<{ success: boolean; image?: HTMLImageElement }>((resolve) => {
        const tempImg = new Image();
        tempImg.onload = () => {
            state.loaded++;
            state.loading--;
            state.finishedLinks++;
            updateProgressBar(state);
            if (Math.min(tempImg.naturalWidth, tempImg.naturalHeight) >= state.minImageSize) {
                if (isImageRelevant(tempImg, state)) {
                    addImageToGallery(state, { src: tempImg.src, width: tempImg.naturalWidth, height: tempImg.naturalHeight });
                    if (state.loaded === 1) {
                        onFirstImageLoaded();
                    }
                    resolve({ success: true, image: tempImg });
                } else {
                    resolve({ success: false });
                }
            } else {
                resolve({ success: false });
            }
        };
        tempImg.onerror = (error) => {
            state.loading--;
            state.finishedLinks++;
            updateProgressBar(state);
            console.error('Error loading image:', error);
            resolve({ success: false });
        };
        tempImg.src = src;
    }).catch(error => {
        console.error('Error in loadImage:', error);
        state.finishedLinks++;
        updateProgressBar(state);
        return { success: false };
    });
};

const isImageRelevant = (img: HTMLImageElement, state: State): boolean => {
    // Check aspect ratio
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    if (aspectRatio < 0.5 || aspectRatio > 2) {
        return false;
    }

    // Check for common irrelevant image patterns
    const irrelevantPatterns = ['icon', 'logo', 'banner', 'avatar', 'button'];
    if (irrelevantPatterns.some(pattern => img.src.toLowerCase().includes(pattern))) {
        return false;
    }

    // Check file extension
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!validExtensions.some(ext => img.src.toLowerCase().endsWith(ext))) {
        return false;
    }

    // Additional checks can be added here based on state settings

    return true;
};

export const processMainContent = async (state: State, url: string, remainingDepth: number, currentDepth: number): Promise<void> => {
    if (remainingDepth < 0 || state.isCancelled || currentDepth > state.maxDepth) {
        return;
    }

    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), 30000);
    });

    try {
        await Promise.race([
            processMainContentLogic(state, url, remainingDepth, currentDepth),
            timeout
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
    if (shouldSkipProcessing(state, url) || currentDepth > state.maxDepth) {
        return;
    }
    state.processedUrls.add(url);

    try {
        updateProgressBar(state);
        const response = await fetchWithRateLimit(state, url);
        if (!response) {
            return;
        }
        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "text/html");

        const mainContent = findMainContent(doc, url);
        if (!mainContent) {
            console.warn('No main content found for URL:', url);
            return;
        }

        const imageLinks = findImageLinks(mainContent, url);
        await processImageLinks(state, imageLinks);

        if (remainingDepth > 0 && currentDepth < state.maxDepth) {
            const pageLinks = findRelevantPageLinks(mainContent, url, state);
            const prioritizedLinks = prioritizeLinks(pageLinks, url, state.similarityScore);

            for (const pageLink of prioritizedLinks.slice(0, 5)) {
                if (state.isCancelled) break;
                await processMainContent(state, pageLink, remainingDepth - 1, currentDepth + 1);
            }
        }
    } catch (error) {
        console.error('Error in processMainContent:', error);
    }
};

const prioritizeLinks = (links: string[], currentUrl: string, similarityThreshold: number): string[] => {
    const currentUrlObj = new URL(currentUrl);
    return links
        .map(link => {
            const linkObj = new URL(link);
            const score = calculateSimilarityScore(currentUrlObj, linkObj);
            return { link, score };
        })
        .filter(item => item.score >= similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .map(item => item.link);
};

const calculateSimilarityScore = (currentUrl: URL, linkUrl: URL): number => {
    let score = 0;
    const maxScore = 100;

    // Same protocol
    if (currentUrl.protocol === linkUrl.protocol) score += 2;

    // Hostname similarity
    const hostnameParts = currentUrl.hostname.split('.');
    const linkHostnameParts = linkUrl.hostname.split('.');
    const hostnameSimilarity = hostnameParts.filter((part, index) => part === linkHostnameParts[index]).length / Math.max(hostnameParts.length, linkHostnameParts.length);
    score += hostnameSimilarity * 40;

    // Path similarity
    const pathParts = currentUrl.pathname.split('/').filter(Boolean);
    const linkPathParts = linkUrl.pathname.split('/').filter(Boolean);
    const pathSimilarity = pathParts.length > 0 && linkPathParts.length > 0 ?
        pathParts.filter((part, index) => part === linkPathParts[index]).length / Math.max(pathParts.length, linkPathParts.length) :
        0;
    score += pathSimilarity * 50;

    // Query parameters similarity
    const currentParams = new URLSearchParams(currentUrl.search);
    const linkParams = new URLSearchParams(linkUrl.search);
    const sharedParams = Array.from(currentParams.keys()).filter(key => linkParams.has(key));
    const paramSimilarity = Math.max(currentParams.size, linkParams.size) > 0 ?
        sharedParams.length / Math.max(currentParams.size, linkParams.size) :
        0;
    score += paramSimilarity * 5;

    // Relevant keywords
    const relevantKeywords = ['gallery', 'album', 'photos', 'images'];
    const keywordBonus = relevantKeywords.some(keyword => linkUrl.pathname.toLowerCase().includes(keyword)) ? 3 : 0;
    score += keywordBonus;

    // Normalize score to 0-100 range
    return Math.min(Math.round(score), maxScore);
};

export const findMainContent = (doc: Document, url: string): HTMLElement => {
    const mainSelectors = [
        'main', '#main', '.main', 'article', '.post', '.content', '#content', '.entry-content', '.post-content',
        '.gallery', '#gallery', '.album', '#album', '.photos', '#photos', '.images', '#images'
    ];
    for (const selector of mainSelectors) {
        const element = doc.querySelector(selector);
        if (element) {
            return element as HTMLElement;
        }
    }
    return doc.body;
};

export const findImageLinks = (element: Element, baseUrl: string): string[] => {
    const imageLinks: string[] = [];
    const imgElements = element.querySelectorAll('img[src]:not([src^="data:"]):not([src^="blob:"])');
    const backgroundElements = element.querySelectorAll('[style*="background-image"]');

    imgElements.forEach((img) => {
        const src = img.getAttribute('src');
        if (src) {
            const absoluteUrl = new URL(src, baseUrl).toString();
            imageLinks.push(absoluteUrl);
        }
    });

    backgroundElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const backgroundImage = style.getPropertyValue('background-image');
        const match = backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1]) {
            const absoluteUrl = new URL(match[1], baseUrl).toString();
            imageLinks.push(absoluteUrl);
        }
    });

    return imageLinks.filter(link => {
        const extension = link.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '');
    });
};

const findRelevantPageLinks = (element: Element, baseUrl: string, state: State): string[] => {
    const pageLinks: string[] = [];
    const linkElements = element.querySelectorAll('a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])');
    const currentUrlObj = new URL(baseUrl);
    const seenPaths = new Set<string>();

    linkElements.forEach((link) => {
        const href = link.getAttribute('href');
        if (href) {
            const absoluteUrl = new URL(href, baseUrl).toString();
            const linkUrlObj = new URL(absoluteUrl);

            if (linkUrlObj.hostname === currentUrlObj.hostname &&
                !state.processedUrls.has(absoluteUrl) &&
                !state.excludePatterns.some((pattern: string) => absoluteUrl.includes(pattern)) &&
                !seenPaths.has(linkUrlObj.pathname)) {

                const similarityScore = calculateSimilarityScore(currentUrlObj, linkUrlObj);
                console.log(`Similarity score for ${absoluteUrl}: ${similarityScore}`);
                if (similarityScore >= state.similarityScore) {
                    pageLinks.push(absoluteUrl);
                    seenPaths.add(linkUrlObj.pathname);
                }
            }
        }
    });

    return pageLinks;
};

const fetchQueue: (() => Promise<Response | null>)[] = [];
let isFetching = false;
let lastFetchTime = 0;

export const fetchWithRateLimit = async (state: State, url: string): Promise<Response | null> => {
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
    return state.processedUrls.has(url) ||
        state.fetchCount >= state.maxConcurrentFetches ||
        state.excludePatterns.some((pattern: string) => url.includes(pattern));
};

const processImageLinks = async (state: State, imageLinks: string[]): Promise<void> => {
    const onFirstImageLoaded = () => {
        if (!state.isGalleryVisible) {
            showGallery(state);
        }
    };
    for (const link of imageLinks) {
        if (state.isCancelled) break;
        const img = new Image();
        await loadImage(state, img, link, onFirstImageLoaded);
        state.finishedLinks++;
        updateProgressBar(state);
    }
};

export const cancelProcessingImages = (state: State): void => {
    state.isCancelled = true;
    state.isProcessing = false;
    console.log("Image processing cancellation requested");
};