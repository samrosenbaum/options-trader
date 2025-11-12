/**
 * Background service worker for Monty Chrome Extension
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Monty Extension] Installed!');

    // Set default settings
    chrome.storage.local.set({
      monty_enabled: true,
    });

    // Open welcome page (optional)
    // chrome.tabs.create({ url: 'https://withmonty.com/extension-welcome' });
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

  if (message.type === 'MONTY_FETCH') {
    handleMontyFetch(message, sendResponse);
    return true;
  }

  if (message.type === 'MONTY_STREAM_REQUEST') {
    handleMontyStreamRequest(message, sender, sendResponse);
    return true;
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

function handleMontyFetch(
  message: {
    url: string;
    fetchOptions?: RequestInit;
    responseType?: 'json' | 'text';
  },
  sendResponse: (response: {
    success: boolean;
    status: number;
    data?: unknown;
    error?: string;
  }) => void,
) {
  (async () => {
    try {
      const response = await fetch(message.url, {
        method: 'GET',
        ...message.fetchOptions,
      });

      const status = response.status;
      let data: unknown;

      if (message.responseType === 'text') {
        data = await response.text();
      } else {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      sendResponse({
        success: response.ok,
        status,
        data,
        error: response.ok ? undefined : `Request failed with status ${status}`,
      });
    } catch (error) {
      console.error('[Monty Extension] Fetch proxy failed:', error);
      sendResponse({
        success: false,
        status: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })();
}

function handleMontyStreamRequest(
  message: {
    requestId: string;
    url: string;
    fetchOptions?: RequestInit;
  },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: {
    success: boolean;
    status?: number;
    error?: string;
  }) => void,
) {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ success: false, error: 'No tab available for streaming response' });
    return;
  }

  let ackSent = false;

  (async () => {
    try {
      const response = await fetch(message.url, {
        method: 'POST',
        ...message.fetchOptions,
      });

      const status = response.status;

      if (!response.ok) {
        sendResponse({ success: false, status, error: `Request failed with status ${status}` });
        return;
      }

      if (!response.body) {
        sendResponse({ success: false, status, error: 'No response body' });
        return;
      }

      sendResponse({ success: true, status });
      ackSent = true;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            chrome.tabs.sendMessage(tabId, {
              type: 'MONTY_STREAM_CHUNK',
              requestId: message.requestId,
              chunk,
            });
          }
        }
      }

      chrome.tabs.sendMessage(tabId, {
        type: 'MONTY_STREAM_COMPLETE',
        requestId: message.requestId,
      });
    } catch (error) {
      console.error('[Monty Extension] Stream request failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (!ackSent) {
        sendResponse({ success: false, status: 0, error: errorMessage });
      } else {
        chrome.tabs.sendMessage(tabId, {
          type: 'MONTY_STREAM_ERROR',
          requestId: message.requestId,
          error: errorMessage,
        });
      }
    }
  })();
}
