import React from 'react';
import ReactDOM from 'react-dom/client';
import { MontyOverlay } from '../shared/components/MontyOverlay';
import { robinhoodReader } from './robinhood-reader';
import { API_ENDPOINT } from '../shared/utils/config';
import '../shared/styles/globals.css';

/**
 * Content script that injects Monty overlay into Robinhood pages
 */

// Wait for DOM to be ready
function init() {
  console.log('[Monty Extension] Initializing on Robinhood...');

  // Create a container for our React app
  const container = document.createElement('div');
  container.id = 'monty-extension-root';

  // Append to body
  document.body.appendChild(container);

  // Get initial context
  const initialContext = robinhoodReader.getCurrentContext();
  console.log('[Monty Extension] Initial context:', initialContext);

  // Create React root and render
  const root = ReactDOM.createRoot(container);

  console.log('[Monty Extension] Using API endpoint:', API_ENDPOINT);

  root.render(
    <React.StrictMode>
      <MontyOverlay
        apiEndpoint={API_ENDPOINT}
        robinhoodContext={initialContext}
      />
    </React.StrictMode>
  );

  // Listen for context changes and update overlay
  let currentContext = initialContext;
  robinhoodReader.onContextChange((newContext) => {
    console.log('[Monty Extension] Context changed:', newContext);
    currentContext = newContext;

    // Re-render with new context
    root.render(
      <React.StrictMode>
        <MontyOverlay
          apiEndpoint={API_ENDPOINT}
          robinhoodContext={currentContext}
        />
      </React.StrictMode>
    );
  });

  console.log('[Monty Extension] Successfully injected!');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONTEXT') {
    const context = robinhoodReader.getCurrentContext();
    sendResponse({ context });
  }
  return true;
});
