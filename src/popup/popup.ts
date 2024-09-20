import { settingsManager } from '../settingsManager';
import * as bootstrap from 'bootstrap';

export function showToast(type: string, message: string) {
    const toastContainer = document.getElementById('toast-container') as HTMLDivElement;
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 3000
    });
    bsToast.show();

    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const cancelProcessImagesButton = document.getElementById('cancelProcessImages') as HTMLButtonElement;
    const executeAndProcessButton = document.getElementById('executeAndProcess') as HTMLButtonElement;
    const maxConcurrentFetchesInput = document.getElementById('maxConcurrentFetches') as HTMLInputElement;
    const maxDepthInput = document.getElementById('maxDepth') as HTMLInputElement;
    const minImageSizeInput = document.getElementById('minImageSize') as HTMLInputElement;
    const rateLimitSlider = document.getElementById('rateLimitSlider') as HTMLInputElement;
    const rateLimitValue = document.getElementById('rateLimitValue') as HTMLSpanElement;
    const similarityScoreInput = document.getElementById('similarityScore') as HTMLInputElement;
    const similarityScoreValue = document.getElementById('similarityScoreValue') as HTMLSpanElement;
    const settingsForm = document.getElementById('settingsForm') as HTMLFormElement;
    const emphasisInput = document.getElementById('emphasis') as HTMLInputElement;
    let saveTimeout: NodeJS.Timeout | null = null;

    function updateInputValue(input: HTMLInputElement, value: HTMLElement | null, newValue: number | string) {
        input.value = newValue.toString();
        if (value) {
            value.textContent = newValue.toString();
        }
    }

    function setupRealTimeUpdates() {
        const inputs = [rateLimitSlider, maxDepthInput, minImageSizeInput, maxConcurrentFetchesInput, similarityScoreInput, emphasisInput];
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                requestAnimationFrame(() => {
                    if (input === rateLimitSlider) {
                        rateLimitValue.textContent = input.value;
                    } else if (input === similarityScoreInput) {
                        similarityScoreValue.textContent = input.value;
                    }
                    deferredSaveSettings();
                });
            });
        });
    }

    function deferredSaveSettings() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            saveSettings();
        }, 500);
    }

    async function loadSettings() {
        try {
            const settings = await settingsManager.loadSettings();
            updateInputValue(maxConcurrentFetchesInput, null, settings.maxConcurrentFetches);
            updateInputValue(maxDepthInput, null, settings.maxDepth);
            updateInputValue(minImageSizeInput, null, settings.minImageSize);
            updateInputValue(rateLimitSlider, rateLimitValue, settings.rateLimit);
            updateInputValue(similarityScoreInput, similarityScoreValue, settings.similarityScore);
            updateInputValue(emphasisInput, null, settings.emphasis);
        } catch (error) {
            console.error("Error loading settings:", error);
            showToast("error", "Error loading settings");
        }
    }

    function saveSettings() {
        const newSettings = {
            emphasis: emphasisInput.value,
            maxConcurrentFetches: Number(maxConcurrentFetchesInput.value),
            maxDepth: Number(maxDepthInput.value),
            minImageSize: Number(minImageSizeInput.value),
            rateLimit: Number(rateLimitSlider.value),
            similarityScore: Number(similarityScoreInput.value),
        };
        settingsManager.updateSettings(newSettings).then(() => {
            console.log("Settings saved successfully!");
        }).catch(error => {
            console.error('Error saving settings:', error);
            showToast("error", "Error saving settings");
        });
    }

    function executeAndProcess() {
        console.log("executeAndProcess called");
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (activeTab?.id) {
                chrome.tabs.sendMessage(activeTab.id, { action: 'executeMainAndProcess' }, (response) => {
                    if (chrome.runtime.lastError) {
                        handleError(chrome.runtime.lastError.message || "Unknown error");
                    } else if (response) {
                        handleResponse(response);
                    } else {
                        handleError("No response received. The process may still be running in the background.");
                    }
                });
            } else {
                handleError("No active tab found. Please make sure you have an active tab open.");
            }
        });
    }

    function handleError(message: string) {
        console.error("Error:", message);
        showToast("error", `Error: ${message}`);
    }

    function handleResponse(response: any) {
        console.log("Main executed and processing response:", response);
        if (response.status === 'Success') {
            showToast("success", "Image processing completed successfully!");
        } else {
            showToast("error", `Error: ${response.message}`);
        }
    }

    function cancelProcessImages() {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (!activeTab?.id) {
                return handleError("No active tab found. Unable to cancel processing.");
            }
            chrome.tabs.sendMessage(activeTab.id, { action: 'cancelProcessingImages' }, (response) => {
                if (chrome.runtime.lastError) {
                    return handleError(chrome.runtime.lastError.message || "Unknown error");
                }
                if (response?.status === 'Success') {
                    console.log("Processing cancelled successfully");
                    showToast("success", "Image processing cancelled.");
                } else {
                    handleError("Unexpected error when cancelling processing.");
                }
            });
        });
    }

    function checkTabCompatibility() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url) {
                const url = new URL(currentTab.url);
                const isCompatible = url.protocol === 'http:' || url.protocol === 'https:';
                executeAndProcessButton.disabled = !isCompatible;
                if (!isCompatible) {
                    executeAndProcessButton.title = "This extension can only run on http or https pages";
                } else {
                    executeAndProcessButton.title = "";
                }
            }
        });
    }

    async function initializePopup() {
        try {
            await settingsManager.init();
            await loadSettings();
            setupRealTimeUpdates();
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveSettings();
            });
            executeAndProcessButton.addEventListener('click', executeAndProcess);
            cancelProcessImagesButton.addEventListener('click', cancelProcessImages);
            maxConcurrentFetchesInput.addEventListener('change', deferredSaveSettings);
            maxDepthInput.addEventListener('change', deferredSaveSettings);
            minImageSizeInput.addEventListener('change', deferredSaveSettings);
            rateLimitSlider.addEventListener('change', deferredSaveSettings);
            similarityScoreInput.addEventListener('change', deferredSaveSettings);
            emphasisInput.addEventListener('change', deferredSaveSettings);
            console.log("Popup initialized successfully");
        } catch (error) {
            console.error("Error initializing popup:", error);
            showToast("error", "Error initializing popup");
        }
    }

    initializePopup();
    checkTabCompatibility();
});