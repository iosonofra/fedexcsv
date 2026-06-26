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

  const statesGrid = document.getElementById('states-grid');
  const saveStatesBtn = document.getElementById('save-states-btn');

  // Load current settings on page load
  loadCurrentSettings();

  // Event Listeners
  toggleVisibilityBtn.addEventListener('click', togglePasswordVisibility);
  testBtn.addEventListener('click', testConnection);
  settingsForm.addEventListener('submit', saveSettings);
  if (saveStatesBtn) {
    saveStatesBtn.addEventListener('click', saveEnabledStates);
  }

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

          // Load states dynamically
          loadStatesUI(data.enabledOrderStates || []);
        } else {
          configStatus.innerHTML = '<span class="config-status-dot red"></span> Non configurato';
          configUrl.textContent = '—';
          configApiKey.textContent = '—';
          showStatesNotConfigured();
        }
      }
    } catch (e) {
      console.error('Errore nel caricamento delle impostazioni:', e);
      showStatesError();
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

  // Load order states UI
  async function loadStatesUI(enabledStates) {
    if (!statesGrid) return;
    
    statesGrid.innerHTML = `
      <div class="states-info-msg">
        <span class="spinner" style="width:16px;height:16px;margin: 0 auto 8px;display:block;"></span>
        Recupero stati da PrestaShop...
      </div>
    `;
    saveStatesBtn.disabled = true;

    try {
      const response = await fetch('/api/orders/states');
      if (!response.ok) throw new Error('Errore nel recupero degli stati.');
      
      const states = await response.json();
      if (!Array.isArray(states) || states.length === 0) {
        statesGrid.innerHTML = `
          <div class="states-info-msg">
            <i data-lucide="alert-circle" style="color:var(--color-error)"></i>
            Nessuno stato dell'ordine trovato nel webservice.
          </div>
        `;
        lucide.createIcons();
        return;
      }

      statesGrid.innerHTML = '';
      const checkAll = enabledStates.length === 0;

      states.forEach(s => {
        const isChecked = checkAll || enabledStates.includes(s.id);
        
        const label = document.createElement('label');
        label.className = `state-checkbox-item ${isChecked ? 'checked' : ''}`;
        label.innerHTML = `
          <input type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''}>
          <span class="state-color-dot" style="background-color: ${s.color || '#3b82f6'}"></span>
          <span>${s.name} (ID ${s.id})</span>
        `;
        
        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            label.classList.add('checked');
          } else {
            label.classList.remove('checked');
          }
        });
        
        statesGrid.appendChild(label);
      });
      
      saveStatesBtn.disabled = false;
      lucide.createIcons();
    } catch (e) {
      console.error('Errore caricamento stati:', e);
      showStatesError();
    }
  }

  function showStatesNotConfigured() {
    if (statesGrid) {
      statesGrid.innerHTML = `
        <div class="states-info-msg">
          <i data-lucide="plug-zap"></i>
          Configura e testa la connessione a PrestaShop per caricare gli stati dell'ordine.
        </div>
      `;
      lucide.createIcons();
    }
    if (saveStatesBtn) saveStatesBtn.disabled = true;
  }

  function showStatesError() {
    if (statesGrid) {
      statesGrid.innerHTML = `
        <div class="states-info-msg">
          <i data-lucide="alert-circle" style="color:var(--color-error)"></i>
          Impossibile caricare gli stati dal webservice di PrestaShop.
        </div>
      `;
      lucide.createIcons();
    }
    if (saveStatesBtn) saveStatesBtn.disabled = true;
  }

  // Save enabled states
  async function saveEnabledStates() {
    if (!statesGrid) return;
    
    const checkboxes = statesGrid.querySelectorAll('input[type="checkbox"]');
    const enabledOrderStates = [];
    
    checkboxes.forEach(cb => {
      if (cb.checked) {
        enabledOrderStates.push(parseInt(cb.value, 10));
      }
    });

    saveStatesBtn.disabled = true;
    const originalContent = saveStatesBtn.innerHTML;
    saveStatesBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Salvataggio...';

    try {
      const response = await fetch('/api/settings/prestashop/states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledOrderStates })
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Successo', 'Stati dell\'ordine salvati correttamente!', 'success');
      } else {
        showToast('Errore', data.error || 'Impossibile salvare gli stati.', 'error');
      }
    } catch (e) {
      showToast('Errore', 'Errore di rete: impossibile raggiungere il server.', 'error');
    } finally {
      saveStatesBtn.disabled = false;
      saveStatesBtn.innerHTML = originalContent;
      lucide.createIcons();
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
        showConnectionResult('success', 'Impostazioni salvate correttamente! Caricamento degli stati...');
        showToast('Successo', 'Impostazioni salvate correttamente!', 'success');
        // Reload the displayed current config
        await loadCurrentSettings();
      } else {
        showConnectionResult('error', data.error || 'Errore nel salvataggio.');
        showToast('Errore', data.error || 'Errore nel salvataggio.', 'error');
      }
    } catch (e) {
      showConnectionResult('error', 'Errore di rete: impossibile raggiungere il server.');
      showToast('Errore', 'Errore di rete: impossibile raggiungere il server.', 'error');
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

  // Toast Notification System
  function showToast(title, message, type = 'info') {
    const container = document.getElementById('notification-area');
    if (!container) return;

    let typeClass = 'toast-info';
    let iconName = 'info';
    if (type === 'error') {
      typeClass = 'toast-error';
      iconName = 'alert-octagon';
    } else if (type === 'warning') {
      typeClass = 'toast-warning';
      iconName = 'alert-triangle';
    } else if (type === 'success') {
      typeClass = 'toast-success';
      iconName = 'check-circle';
    }

    const toast = document.createElement('div');
    toast.className = `toast ${typeClass}`;
    
    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <div class="toast-content">
        <div class="toast-title">${escapeHTML(title)}</div>
        <div class="toast-message">${escapeHTML(message)}</div>
      </div>
      <button class="toast-close"><i data-lucide="x"></i></button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.style.animation = 'none';
      toast.offsetHeight;
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});
