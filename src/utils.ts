import { State } from './state';

export const generateHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString();
};

export const debugLog = (category: string, message: string, ...args: any[]): void => {
    const DEBUG = true;
    if (DEBUG) {
        console.log(`[${category}]`, message, ...args);
    }
};

export const createProgressBar = (): HTMLDivElement => {
    const progressBar = document.createElement('div');
    progressBar.id = 'progress-bar';
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 30px;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    const progressBarInner = document.createElement('div');
    progressBarInner.style.cssText = `
        width: 0;
        height: 100%;
        background: linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
        position: absolute;
        left: 0;
    `;
    const progressText = document.createElement('div');
    progressText.id = 'progress-text';
    progressText.style.cssText = `
        color: white;
        font-size: 14px;
        z-index: 10001;
    `;
    progressBar.appendChild(progressBarInner);
    progressBar.appendChild(progressText);
    return progressBar;
};

export const updateProgressBar = (state: State): void => {
    if (!state.progressBar) {
        state.progressBar = createProgressBar();
        document.body.appendChild(state.progressBar);
    }
    if (state.progressBar) {
        const percentage = state.totalLinks > 0 ? (state.finishedLinks / state.totalLinks) * 100 : 0;

        const progressBarInner = state.progressBar.querySelector('div');
        if (progressBarInner) {
            progressBarInner.style.width = `${percentage}%`;
        }
        const progressText = state.progressBar.querySelector('#progress-text');
        if (progressText) {
            progressText.innerHTML = `
                ${state.finishedLinks} / ${state.totalLinks} (${percentage.toFixed(2)}%)
            `;
        }
        state.progressBar.style.display = 'flex';
    }
};

export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};