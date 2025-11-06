// Popup script for Monty extension settings

document.addEventListener('DOMContentLoaded', () => {
  const apiEndpointInput = document.getElementById('api-endpoint');
  const enabledToggle = document.getElementById('enabled');
  const saveBtn = document.getElementById('save-btn');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.local.get(['monty_api_endpoint', 'monty_enabled'], (result) => {
    if (result.monty_api_endpoint) {
      apiEndpointInput.value = result.monty_api_endpoint;
    }
    if (result.monty_enabled !== undefined) {
      enabledToggle.checked = result.monty_enabled;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const apiEndpoint = apiEndpointInput.value.trim() || 'http://localhost:3000';
    const enabled = enabledToggle.checked;

    chrome.storage.local.set(
      {
        monty_api_endpoint: apiEndpoint,
        monty_enabled: enabled,
      },
      () => {
        // Show success message
        status.textContent = '✓ Settings saved!';
        status.classList.add('show');

        setTimeout(() => {
          status.classList.remove('show');
        }, 2000);

        // Reload content scripts
        chrome.tabs.query({ url: '*://*.robinhood.com/*' }, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              chrome.tabs.reload(tab.id);
            }
          });
        });
      }
    );
  });

  // Allow Enter key to save
  apiEndpointInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
