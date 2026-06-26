document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // DOM Elements
  const settingsForm = document.getElementById('settings-form');
  const psUrlInput = document.getElementById('ps-url');
  const psApiKeyInput = document.getElementById('ps-api-key');
  const testBtn = document.getElementById('test-btn');
  const saveBtn = document.getElementById('save-btn');
  const toggleVisibilityBtn = document.getElementById('toggle-visibility');
  const connectionResult = document.getElementById('connection-result');
  const connectionResultText = document.getElementById('connection-result-text');

  const configStatus = document.getElementById('config-status');
  const configUrl = document.getElementById('config-url');
  const configApiKey = document.getElementById('config-api-key');
  const shipperStatus = document.getElementById('shipper-status');
  const shipperDetails = document.getElementById('shipper-details');

  // Load current settings on page load
  loadCurrentSettings();

  // Event Listeners
  toggleVisibilityBtn.addEventListener('click', togglePasswordVisibility);
  testBtn.addEventListener('click', testConnection);
  settingsForm.addEventListener('submit', saveSettings);

  // Load and display current PrestaShop configuration
  async function loadCurrentSettings() {
    try {
      const response = await fetch('/api/settings/prestashop');
      if (response.ok) {
        const data = await response.json();

        if (data.configured) {
          configStatus.innerHTML = '<span class="config-status-dot green"></span> Configurato';
          configUrl.textContent = data.baseUrl || '—';
          configApiKey.textContent = data.apiKey || '—';

          // Pre-fill URL field (but not the masked API key)
          if (data.baseUrl) psUrlInput.value = data.baseUrl;
        } else {
          configStatus.innerHTML = '<span class="config-status-dot red"></span> Non configurato';
          configUrl.textContent = '—';
          configApiKey.textContent = '—';
        }
      }
    } catch (e) {
      console.error('Errore nel caricamento delle impostazioni:', e);
    }

    // Load and display current Shipper configuration
    try {
      const response = await fetch('/api/settings/shipper');
      if (response.ok) {
        const shipperData = await response.json();
        if (shipperData && shipperData.name) {
          shipperStatus.innerHTML = '<span class="config-status-dot green"></span> Salvato su server';
          shipperDetails.textContent = `${shipperData.name} - ${shipperData.city} (${shipperData.country})`;
        } else {
          shipperStatus.innerHTML = '<span class="config-status-dot red"></span> Non salvato su server';
          shipperDetails.textContent = '—';
        }
      }
    } catch (e) {
      console.error('Errore nel caricamento dei dati mittente:', e);
    }
  }

  // Toggle API key visibility
  function togglePasswordVisibility() {
    const isPassword = psApiKeyInput.type === 'password';
    psApiKeyInput.type = isPassword ? 'text' : 'password';
    toggleVisibilityBtn.innerHTML = isPassword
      ? '<i data-lucide="eye-off"></i>'
      : '<i data-lucide="eye"></i>';
    lucide.createIcons();
  }

  // Test connection without saving
  async function testConnection() {
    const baseUrl = psUrlInput.value.trim();
    const apiKey = psApiKeyInput.value.trim();

    if (!baseUrl || !apiKey) {
      showConnectionResult('error', 'Inserisci sia l\'URL che la chiave API prima di testare.');
      return;
    }

    showConnectionResult('loading', 'Test di connessione in corso...');
    testBtn.disabled = true;
    const originalContent = testBtn.innerHTML;
    testBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Verifica...';

    try {
      const response = await fetch('/api/settings/prestashop/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey })
      });

      const data = await response.json();

      if (response.ok) {
        showConnectionResult('success', data.message || 'Connessione riuscita!');
      } else {
        showConnectionResult('error', data.error || 'Test di connessione fallito.');
      }
    } catch (e) {
      showConnectionResult('error', 'Errore di rete: impossibile raggiungere il server.');
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Save settings
  async function saveSettings(e) {
    e.preventDefault();

    const baseUrl = psUrlInput.value.trim();
    const apiKey = psApiKeyInput.value.trim();

    if (!baseUrl || !apiKey) {
      showConnectionResult('error', 'URL e chiave API sono obbligatori.');
      return;
    }

    saveBtn.disabled = true;
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Salvataggio...';

    try {
      const response = await fetch('/api/settings/prestashop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey })
      });

      const data = await response.json();

      if (response.ok) {
        showConnectionResult('success', 'Impostazioni salvate correttamente! Puoi tornare alla dashboard.');
        // Reload the displayed current config
        await loadCurrentSettings();
      } else {
        showConnectionResult('error', data.error || 'Errore nel salvataggio.');
      }
    } catch (e) {
      showConnectionResult('error', 'Errore di rete: impossibile raggiungere il server.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Show connection result message
  function showConnectionResult(type, message) {
    connectionResult.className = `connection-result ${type}`;
    connectionResultText.textContent = message;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    else if (type === 'error') iconName = 'alert-circle';
    else if (type === 'loading') iconName = 'loader';

    const iconEl = connectionResult.querySelector('i, svg');
    if (iconEl) {
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', iconName);
      iconEl.replaceWith(newIcon);
      lucide.createIcons();
    }
  }
});
