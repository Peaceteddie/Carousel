import { settingsManager } from './settingsManager';

async function initializeSettingsManager() {
  try {
    await settingsManager.init();
    console.log("Settings manager initialized successfully");
  } catch (error) {
    console.error("Error initializing settings:", error);
  }
}

async function handleOnInstalled(details: chrome.runtime.InstalledDetails) {
  console.log("Background script installed");
  await settingsManager.init();
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await settingsManager.updateSettings(settingsManager.getDefaultSettings());
  }
}

function handleOnStartup() {
  console.log("Background script started");
  settingsManager.init();
}

async function handleGetSettings(sendResponse: (response: any) => void) {
  const settings = await settingsManager.loadSettings();
  sendResponse({ settings });
}

async function handleUpdateSettings(request: any, sendResponse: (response: any) => void) {
  await settingsManager.updateSettings(request.settings);
  sendResponse({ status: 'Settings updated' });
}

function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  console.log("Message received:", message.action);
  switch (message.action) {
    case 'toggleGalleryVisibility':
      handleToggleGalleryVisibility(sender.tab?.id!, sendResponse);
      break;
    case 'getSettings':
      handleGetSettings(sendResponse);
      break;
    case 'updateSettings':
      handleUpdateSettings(message, sendResponse);
      break;
    case 'executeMainAndProcess':
      handleExecuteMainAndProcess(message, sender, sendResponse);
      break;
    case 'fetchImage':
      handleFetchImage(message, sendResponse);
      break;
    case 'cancelProcessingImages':
      handleCancelProcessingImages(sender.tab?.id, sendResponse);
      break;
    default:
      console.warn('Unknown message action:', message.action);
      sendResponse({ status: 'Error', message: 'Unknown action' });
  }
  return true;
}

async function handleExecuteMainAndProcess(
  message: { tabId: number },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  const tabId = message.tabId;
  if (tabId) {
    try {
      const settings = await settingsManager.loadSettings();
      const timeoutId = setTimeout(() => {
        console.warn('Execute main and process timed out after 5 minutes');
        sendResponse({ status: 'Error', message: 'Operation timed out after 5 minutes' });
      }, 5 * 60 * 1000);

      chrome.tabs.sendMessage(tabId, {
        action: 'executeMainAndProcess',
        settings: {
          rateLimit: settings.rateLimit,
          maxDepth: settings.maxDepth,
          minImageSize: settings.minImageSize,
          maxConcurrentFetches: settings.maxConcurrentFetches
        }
      }, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          console.error('Error executing main and process:', chrome.runtime.lastError);
          sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
        } else {
          sendResponse(response || { status: 'Processing', message: 'Main process started' });
        }
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      sendResponse({ status: 'Error', message: 'Failed to load settings' });
    }
  } else {
    sendResponse({ status: 'Error', message: 'No tab ID found' });
  }
}

function handleCancelProcessingImages(tabId: number | undefined, sendResponse: (response: any) => void) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'cancelProcessingImages' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error cancelling processing:', chrome.runtime.lastError);
        sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: 'Success', message: 'Processing cancelled' });
      }
    });
  } else {
    sendResponse({ status: 'Error', message: 'No tab ID found' });
  }
}

function handleFetchImage(message: { url: string }, sendResponse: (response: any) => void) {
  fetchImage(message.url)
    .then(imageUrl => sendResponse({ success: true, url: imageUrl }))
    .catch(error => sendResponse({ success: false, reason: error.message }));
}

async function fetchImage(url: string): Promise<string> {
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

function createContextMenus() {
  console.log("Creating context menus");
  chrome.contextMenus.create({
    id: "executeMainAndProcess",
    title: "Execute Main and Process",
    contexts: ["page"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error creating context menu:", chrome.runtime.lastError);
    } else {
      console.log("Context menu created successfully");
    }
  });
  chrome.contextMenus.create({
    id: "toggleGalleryVisibility",
    title: "Show/Hide Gallery",
    contexts: ["page"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error creating context menu:", chrome.runtime.lastError);
    } else {
      console.log("Toggle gallery visibility menu created successfully");
    }
  });
}

// Event listeners
chrome.runtime.onInstalled.addListener(handleOnInstalled);
chrome.runtime.onStartup.addListener(handleOnStartup);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script received message:", message.action);
  switch (message.action) {
    case 'executeMainAndProcess':
      handleExecuteMainAndProcess(message, sender, sendResponse);
      break;
    case 'fetchImage':
      handleFetchImage(message, sendResponse);
      break;
    // ... other cases ...
  }
  return true;  // Indicates that the response is sent asynchronously
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  switch (info.menuItemId) {
    case 'executeMainAndProcess':
      handleExecuteMainAndProcess({ tabId: tab.id }, { tab }, (response) => {
        console.log('Execute main and process response:', response);
      });
      break;
    case 'toggleGalleryVisibility':
      handleToggleGalleryVisibility(tab.id, (response) => {
        console.log('Toggle gallery visibility response:', response);
      });
      break;
  }
});

// Initialize
initializeSettingsManager();
createContextMenus();

function handleToggleGalleryVisibility(tabId: number, sendResponse: (response: any) => void) {
  chrome.tabs.sendMessage(tabId, { action: 'toggleGalleryVisibility' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error toggling gallery visibility:', chrome.runtime.lastError.message);
      sendResponse({ status: 'Error', message: chrome.runtime.lastError.message });
    } else {
      console.log('Toggle gallery visibility response:', response);
      sendResponse({ status: 'Success', message: 'Gallery visibility toggled' });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'mainProcessComplete') {
    console.log('Main process complete:', message);
  }
});