// Popup script for Monty extension settings

document.addEventListener('DOMContentLoaded', () => {
  const enabledToggle = document.getElementById('enabled');
  const saveBtn = document.getElementById('save-btn');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.local.get(['monty_enabled'], (result) => {
    if (result.monty_enabled !== undefined) {
      enabledToggle.checked = result.monty_enabled;
    }
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const enabled = enabledToggle.checked;

    chrome.storage.local.set(
      {
        monty_enabled: enabled,
      },
      () => {
        // Show success message
        status.textContent = '✓ Settings saved!';
        status.classList.add('show');

        setTimeout(() => {
          status.classList.remove('show');
        }, 2000);

        // Reload content scripts if needed
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
});
