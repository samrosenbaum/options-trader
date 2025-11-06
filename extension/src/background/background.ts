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

  return true;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Open popup or toggle Monty visibility
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MONTY' });
  }
});

console.log('[Monty Extension] Background script loaded');
