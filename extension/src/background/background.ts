/**
 * Background service worker for Monty Chrome Extension
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Monty Extension] Installed!');

    // Set default API endpoint
    chrome.storage.local.set({
      monty_api_endpoint: 'http://localhost:3000',
      monty_enabled: true,
    });

    // Open welcome page (optional)
    // chrome.tabs.create({ url: 'https://your-app-url.com/extension-welcome' });
  } else if (details.reason === 'update') {
    console.log('[Monty Extension] Updated!');
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'pong' });
  }

  // Handle screenshot capture request
  if (message.type === 'CAPTURE_SCREENSHOT') {
    handleScreenshotCapture(sender, sendResponse);
    return true; // Keep channel open for async response
  }

  return true;
});

/**
 * Captures a screenshot of the active tab and returns it as base64
 */
async function handleScreenshotCapture(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean; screenshot?: string; error?: string }) => void
) {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID found' });
      return;
    }

    // Capture the visible tab as a data URL (PNG format)
    const screenshot = await chrome.tabs.captureVisibleTab(undefined, {
      format: 'png',
      quality: 90,
    });

    // Screenshot is already in base64 data URL format: "data:image/png;base64,..."
    sendResponse({ success: true, screenshot });
  } catch (error) {
    console.error('[Monty Extension] Screenshot capture failed:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open popup or toggle Monty visibility
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MONTY' });
  }
});

console.log('[Monty Extension] Background script loaded');
