import { State } from './state';
import { config } from './config';

export class SettingsManager {
  private defaultSettings: State = {
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

  async init(): Promise<void> {
    const settings = await this.loadSettings();
    if (Object.keys(settings).length === 0) {
      await this.updateSettings(this.defaultSettings);
    }
  }

  async loadSettings(): Promise<State> {
    return new Promise((resolve) => {
      chrome.storage.sync.get('settings', (result) => {
        const settings = result.settings as Partial<State> || {};
        const loadedSettings: State = {
          ...this.defaultSettings,
          ...settings,
          processedUrls: new Set(settings.processedUrls || []),
          dupPics: new Set(settings.dupPics || []),
        };
        resolve(loadedSettings);
      });
    });
  }

  async updateSettings(newSettings: Partial<State>): Promise<void> {
    const currentSettings = await this.loadSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    updatedSettings.rateLimit = Math.max(100, Math.min(5000, updatedSettings.rateLimit));
    updatedSettings.maxDepth = Math.max(1, Math.min(10, updatedSettings.maxDepth));
    const storableSettings = {
      ...updatedSettings,
      processedUrls: Array.from(updatedSettings.processedUrls),
      dupPics: Array.from(updatedSettings.dupPics)
    };
    return new Promise((resolve) => {
      chrome.storage.sync.set({ settings: storableSettings }, () => {
        resolve();
      });
    });
  }

  async resetSetting(key: keyof State): Promise<void> {
    if (key in this.defaultSettings) {
      await this.updateSettings({ [key]: this.defaultSettings[key] });
    }
  }

  public getDefaultSettings(): State {
    return { ...this.defaultSettings };
  }
}

export const settingsManager = new SettingsManager();