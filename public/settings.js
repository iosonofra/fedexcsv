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

  // FedEx DOM Elements
  const fedexSettingsForm = document.getElementById('fedex-settings-form');
  const fedexClientIdInput = document.getElementById('fedex-client-id');
  const fedexClientSecretInput = document.getElementById('fedex-client-secret');
  const fedexAccountNumberInput = document.getElementById('fedex-account-number');
  const fedexUseSandboxInput = document.getElementById('fedex-use-sandbox');
  const fedexTestBtn = document.getElementById('fedex-test-btn');
  const fedexSaveBtn = document.getElementById('fedex-save-btn');
  const fedexConnectionResult = document.getElementById('fedex-connection-result');
  const fedexConnectionResultText = document.getElementById('fedex-connection-result-text');
  
  const fedexConfigStatus = document.getElementById('fedex-config-status');
  const fedexConfigEnv = document.getElementById('fedex-config-env');
  const fedexConfigAccount = document.getElementById('fedex-config-account');

  // Backup & Restore DOM Elements
  const backupDropZone = document.getElementById('backup-drop-zone');
  const backupFileInput = document.getElementById('backup-file-input');
  const btnRestoreBackup = document.getElementById('btn-restore-backup');
  const dropZoneText = document.getElementById('drop-zone-text');
  const dropZoneIcon = document.getElementById('drop-zone-icon');

  let selectedBackupData = null;

  // Load current settings on page load
  loadCurrentSettings();

  // Event Listeners
  toggleVisibilityBtn.addEventListener('click', togglePasswordVisibility);
  testBtn.addEventListener('click', testConnection);
  settingsForm.addEventListener('submit', saveSettings);
  if (saveStatesBtn) {
    saveStatesBtn.addEventListener('click', saveEnabledStates);
  }
  if (fedexTestBtn) fedexTestBtn.addEventListener('click', testFedexConnection);
  if (fedexSettingsForm) fedexSettingsForm.addEventListener('submit', saveFedexSettings);

  // Backup & Restore Event Listeners
  if (backupDropZone && backupFileInput && btnRestoreBackup) {
    backupDropZone.addEventListener('click', () => backupFileInput.click());
    
    backupFileInput.addEventListener('change', handleFileSelect);
    
    // Drag and Drop
    backupDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      backupDropZone.classList.add('dragover');
    });
    
    backupDropZone.addEventListener('dragleave', () => {
      backupDropZone.classList.remove('dragover');
    });
    
    backupDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      backupDropZone.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        backupFileInput.files = files;
        handleFileSelect();
      }
    });

    btnRestoreBackup.addEventListener('click', triggerRestore);
  }

  // Tab Switcher DOM Elements
  const tabButtons = document.querySelectorAll('.settings-nav-item');
  const tabPanels = document.querySelectorAll('.settings-panel');

  // Tab switcher logic
  function switchTab(tabId) {
    if (!tabId) return;
    
    // Deactivate all tabs and panels
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanels.forEach(panel => panel.classList.remove('active'));

    // Activate the selected tab and panel
    const targetBtn = document.querySelector(`.settings-nav-item[data-tab="${tabId}"]`);
    const targetPanel = document.getElementById(`panel-${tabId}`);

    if (targetBtn && targetPanel) {
      targetBtn.classList.add('active');
      targetPanel.classList.add('active');
      
      // Update URL hash without breaking history or triggering hashchange loop
      if (window.location.hash !== `#settings-${tabId}`) {
        history.replaceState(null, null, `#settings-${tabId}`);
      }
    }
  }

  // Bind clicks on tab buttons
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Handle URL hash on load
  function initTabFromHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#settings-')) {
      const tabId = hash.replace('#settings-', '');
      const validTabs = ['api', 'states', 'backup'];
      if (validTabs.includes(tabId)) {
        switchTab(tabId);
        return;
      }
    }
    const rawHash = hash.substring(1);
    const validTabs = ['api', 'states', 'backup'];
    if (rawHash && validTabs.includes(rawHash)) {
      switchTab(rawHash);
      return;
    }
    switchTab('api');
  }

  // Bind hash change event
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#settings-')) {
      const tabId = hash.replace('#settings-', '');
      const validTabs = ['api', 'states', 'backup'];
      if (validTabs.includes(tabId)) {
        switchTab(tabId);
      }
    } else {
      const rawHash = hash.substring(1);
      const validTabs = ['api', 'states', 'backup'];
      if (rawHash && validTabs.includes(rawHash)) {
        switchTab(rawHash);
      }
    }
  });

  // Initialize tabs
  initTabFromHash();



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

    // Load and display current FedEx configuration
    try {
      const response = await fetch('/api/settings/fedex');
      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          fedexConfigStatus.innerHTML = '<span class="config-status-dot green"></span> Configurato';
          fedexConfigEnv.textContent = data.useSandbox ? 'Sandbox (Test)' : 'Production (Live)';
          fedexConfigAccount.textContent = data.accountNumber || '—';
          
          // Pre-fill fields (with dummy secrets values if configured)
          fedexClientIdInput.value = '••••••••••••••••';
          fedexClientSecretInput.value = '••••••••••••••••';
          if (data.accountNumber) fedexAccountNumberInput.value = data.accountNumber;
          fedexUseSandboxInput.checked = !!data.useSandbox;
        } else {
          fedexConfigStatus.innerHTML = '<span class="config-status-dot red"></span> Non configurato';
          fedexConfigEnv.textContent = '—';
          fedexConfigAccount.textContent = '—';
        }
      }
    } catch (e) {
      console.error('Errore nel caricamento delle impostazioni FedEx:', e);
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

  // Test FedEx connection without saving
  async function testFedexConnection() {
    const clientId = fedexClientIdInput.value.trim();
    const clientSecret = fedexClientSecretInput.value.trim();
    const useSandbox = fedexUseSandboxInput.checked;

    if (!clientId || !clientSecret) {
      showFedexConnectionResult('error', 'Inserisci sia il Client ID che il Client Secret per testare.');
      return;
    }

    showFedexConnectionResult('loading', 'Test di connessione FedEx in corso...');
    fedexTestBtn.disabled = true;
    const originalContent = fedexTestBtn.innerHTML;
    fedexTestBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Verifica...';

    try {
      const response = await fetch('/api/settings/fedex/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, useSandbox })
      });

      const data = await response.json();

      if (response.ok) {
        showFedexConnectionResult('success', data.message || 'Connessione a FedEx riuscita!');
      } else {
        showFedexConnectionResult('error', data.error || 'Test di connessione FedEx fallito.');
      }
    } catch (e) {
      showFedexConnectionResult('error', 'Errore di rete: impossibile raggiungere il server.');
    } finally {
      fedexTestBtn.disabled = false;
      fedexTestBtn.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Save FedEx settings
  async function saveFedexSettings(e) {
    e.preventDefault();

    const clientId = fedexClientIdInput.value.trim();
    const clientSecret = fedexClientSecretInput.value.trim();
    const accountNumber = fedexAccountNumberInput.value.trim();
    const useSandbox = fedexUseSandboxInput.checked;

    if (!clientId || !clientSecret || !accountNumber) {
      showFedexConnectionResult('error', 'Tutti i campi sono obbligatori.');
      return;
    }

    fedexSaveBtn.disabled = true;
    const originalContent = fedexSaveBtn.innerHTML;
    fedexSaveBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;"></span> Salvataggio...';

    try {
      const response = await fetch('/api/settings/fedex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, accountNumber, useSandbox })
      });

      const data = await response.json();

      if (response.ok) {
        showFedexConnectionResult('success', 'Impostazioni FedEx salvate con successo!');
        showToast('Successo', 'Impostazioni FedEx salvate correttamente!', 'success');
        // Reload displayed config (will pre-fill with dummy values)
        await loadCurrentSettings();
      } else {
        showFedexConnectionResult('error', data.error || 'Errore nel salvataggio FedEx.');
        showToast('Errore', data.error || 'Errore nel salvataggio FedEx.', 'error');
      }
    } catch (e) {
      showFedexConnectionResult('error', 'Errore di rete: impossibile raggiungere il server.');
      showToast('Errore', 'Errore di rete: impossibile raggiungere il server.', 'error');
    } finally {
      fedexSaveBtn.disabled = false;
      fedexSaveBtn.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Show FedEx connection result message
  function showFedexConnectionResult(type, message) {
    fedexConnectionResult.className = `connection-result ${type}`;
    fedexConnectionResultText.textContent = message;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    else if (type === 'error') iconName = 'alert-circle';
    else if (type === 'loading') iconName = 'loader';

    const iconEl = fedexConnectionResult.querySelector('i, svg');
    if (iconEl) {
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', iconName);
      iconEl.replaceWith(newIcon);
      lucide.createIcons();
    }
  }

  // Backup file selection handler
  function handleFileSelect() {
    const file = backupFileInput.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      showToast('File non valido', 'Seleziona un file JSON valido.', 'error');
      resetDropZone();
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.settings || !data.history) {
          throw new Error('Struttura del backup non valida. Campi obbligatori mancanti.');
        }
        
        selectedBackupData = data;
        
        // Show file is selected in UI
        backupDropZone.classList.add('file-selected');
        dropZoneText.textContent = `File caricato: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        
        // Update Icon to check-circle
        const currentIcon = document.getElementById('drop-zone-icon');
        if (currentIcon) {
          const newIcon = document.createElement('i');
          newIcon.setAttribute('data-lucide', 'check-circle');
          newIcon.setAttribute('id', 'drop-zone-icon');
          currentIcon.replaceWith(newIcon);
          lucide.createIcons();
        }

        btnRestoreBackup.disabled = false;
        showToast('Backup validato', 'File di backup pronto per il ripristino.', 'success');
      } catch (err) {
        showToast('Errore di lettura', `Impossibile analizzare il file: ${err.message}`, 'error');
        resetDropZone();
      }
    };
    reader.readAsText(file);
  }

  // Reset the file drop zone
  function resetDropZone() {
    selectedBackupData = null;
    backupFileInput.value = '';
    btnRestoreBackup.disabled = true;
    backupDropZone.classList.remove('file-selected');
    dropZoneText.textContent = 'Trascina qui il file di backup o clicca per sfogliare';
    
    // Replace Icon with file-json
    const currentIcon = document.getElementById('drop-zone-icon');
    if (currentIcon) {
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', 'file-json');
      newIcon.setAttribute('id', 'drop-zone-icon');
      currentIcon.replaceWith(newIcon);
      lucide.createIcons();
    }
  }

  // Trigger restore API call
  async function triggerRestore() {
    if (!selectedBackupData) return;

    const confirmRestore = confirm("Sei sicuro di voler procedere con il ripristino? Questa operazione sovrascriverà irrevocabilmente tutte le impostazioni e lo storico corrente.");
    if (!confirmRestore) return;

    btnRestoreBackup.disabled = true;
    const originalContent = btnRestoreBackup.innerHTML;
    btnRestoreBackup.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Ripristino in corso...';

    try {
      const response = await fetch('/api/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedBackupData)
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Ripristino Completato', 'Tutti i dati e lo storico sono stati ripristinati correttamente!', 'success');
        resetDropZone();
        // Reload all current configurations on the settings page
        await loadCurrentSettings();
      } else {
        showToast('Errore durante il ripristino', result.error || 'Errore sconosciuto durante il ripristino.', 'error');
        btnRestoreBackup.disabled = false;
      }
    } catch (e) {
      showToast('Errore di rete', 'Impossibile connettersi al server per eseguire il ripristino.', 'error');
      btnRestoreBackup.disabled = false;
    } finally {
      btnRestoreBackup.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Export functions to global scope for app.js integration
  window.switchTab = switchTab;
  window.loadCurrentSettings = loadCurrentSettings;
});

