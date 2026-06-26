document.addEventListener('DOMContentLoaded', () => {
  // Inizializza le icone Lucide
  lucide.createIcons();

  // Elementi DOM
  const filterForm = document.getElementById('filter-form');
  const searchBtn = document.getElementById('search-btn');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  const ordersTableBody = document.getElementById('orders-table-body');
  const ordersCountText = document.getElementById('orders-count-text');
  const masterCheckbox = document.getElementById('master-checkbox');
  const selectAllBtn = document.getElementById('select-all-btn');
  const deselectAllBtn = document.getElementById('deselect-all-btn');
  const actionFooter = document.getElementById('action-footer');
  const selectedBadge = document.getElementById('selected-badge');
  const exportBtn = document.getElementById('export-btn');
  
  // Elementi Impostazioni Mittente
  const toggleShipperBtn = document.getElementById('toggle-shipper-settings');
  const shipperChevron = document.getElementById('shipper-chevron');
  const shipperSettingsPanel = document.getElementById('shipper-settings-panel');
  const saveShipperBtn = document.getElementById('save-shipper-btn');
  
  const shipperInputs = {
    name: document.getElementById('shipper-name'),
    company: document.getElementById('shipper-company'),
    address1: document.getElementById('shipper-address1'),
    city: document.getElementById('shipper-city'),
    zip: document.getElementById('shipper-zip'),
    country: document.getElementById('shipper-country'),
    phone: document.getElementById('shipper-phone'),
  };

  // Stato dell'Applicazione
  let loadedOrders = [];
  let selectedOrders = new Map();

  // Carica i dati predefiniti, gli stati ordine ed esegui la ricerca iniziale
  async function initializeApp() {
    // Verifica se PrestaShop è configurato
    try {
      const configRes = await fetch('/api/settings/prestashop');
      if (configRes.ok) {
        const configData = await configRes.json();
        const overlay = document.getElementById('setup-overlay');
        if (!configData.configured && overlay) {
          overlay.classList.remove('hidden');
          lucide.createIcons();
          return; // Non caricare ordini se non configurato
        }
      }
    } catch (e) {
      console.error('Errore nel controllo configurazione:', e);
    }

    await loadOrderStates();
    await loadInitialDefaults();
    handleSearch();
  }

  initializeApp();

  // Listener degli Eventi
  toggleShipperBtn.addEventListener('click', toggleShipperPanel);
  saveShipperBtn.addEventListener('click', saveShipperSettings);
  filterForm.addEventListener('submit', handleSearch);
  clearFiltersBtn.addEventListener('click', clearFilters);
  masterCheckbox.addEventListener('change', handleMasterCheckboxChange);
  selectAllBtn.addEventListener('click', selectAllOrders);
  deselectAllBtn.addEventListener('click', deselectAllOrders);
  exportBtn.addEventListener('click', handleExport);

  // Mostra/Nascondi pannello mittente
  function toggleShipperPanel() {
    const isCollapsed = shipperSettingsPanel.classList.toggle('collapsed');
    if (isCollapsed) {
      shipperChevron.style.transform = 'rotate(0deg)';
    } else {
      shipperChevron.style.transform = 'rotate(180deg)';
    }
  }

  // Carica l'elenco degli stati da PrestaShop e popola il filtro dropdown
  async function loadOrderStates() {
    try {
      const response = await fetch('/api/orders/states?filter=enabled');
      if (response.ok) {
        const states = await response.json();
        const stateSelect = document.getElementById('filter-state');
        if (stateSelect && Array.isArray(states)) {
          stateSelect.innerHTML = '<option value="">Tutti gli stati</option>';
          
          const hasState2 = states.some(s => s.id === 2);
          
          states.forEach((s, index) => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = `${s.name} (ID ${s.id})`;
            
            if (hasState2) {
              if (s.id === 2) {
                option.selected = true;
              }
            } else if (index === 0) {
              option.selected = true;
            }
            
            stateSelect.appendChild(option);
          });
        }
      }
    } catch (e) {
      console.error('Impossibile caricare gli stati ordine:', e);
      // Fallback statico in caso di errore di rete
      const stateSelect = document.getElementById('filter-state');
      if (stateSelect) {
        stateSelect.innerHTML = `
          <option value="">Tutti gli stati</option>
          <option value="2" selected>Pagamento accettato (ID 2)</option>
          <option value="3">In attesa di spedizione (ID 3)</option>
          <option value="4">Spedito (ID 4)</option>
          <option value="5">Consegnato (ID 5)</option>
          <option value="6">Annullato (ID 6)</option>
        `;
      }
    }
  }

  // Carica impostazioni iniziali dal server ed applica localStorage se presente
  async function loadInitialDefaults() {
    try {
      const response = await fetch('/api/settings/defaults');
      if (response.ok) {
        const data = await response.json();
        
        // Imposta i valori predefiniti per la spedizione dal file Excel caricato
        if (data) {
          const defaultWeight = document.getElementById('default-weight');
          const defaultLength = document.getElementById('default-length');
          const defaultWidth = document.getElementById('default-width');
          const defaultHeight = document.getElementById('default-height');
          const defaultService = document.getElementById('default-service');
          const defaultPackage = document.getElementById('default-package');

          if (defaultWeight && data.packageWeight) defaultWeight.value = data.packageWeight;
          if (defaultLength && data.length) defaultLength.value = data.length;
          if (defaultWidth && data.width) defaultWidth.value = data.width;
          if (defaultHeight && data.height) defaultHeight.value = data.height;
          if (defaultService && data.serviceType) defaultService.value = data.serviceType;
          if (defaultPackage && data.packageType) defaultPackage.value = data.packageType;

          // Imposta i valori predefiniti del mittente come fallback iniziale
          if (shipperInputs.name && data.senderContactName) shipperInputs.name.value = data.senderContactName;
          if (shipperInputs.company && data.senderCompany) shipperInputs.company.value = data.senderCompany;
          if (shipperInputs.address1 && data.senderLine1) shipperInputs.address1.value = data.senderLine1;
          if (shipperInputs.city && data.senderCity) shipperInputs.city.value = data.senderCity;
          if (shipperInputs.zip && data.senderPostcode) shipperInputs.zip.value = data.senderPostcode;
          if (shipperInputs.country && data.senderCountry) shipperInputs.country.value = data.senderCountry;
          if (shipperInputs.phone && data.senderContactNumber) shipperInputs.phone.value = data.senderContactNumber;
        }
      }
    } catch (e) {
      console.error('Impossibile caricare i valori predefiniti dal server:', e);
    }

    // Carica la configurazione del mittente salvata persistente lato server
    try {
      const response = await fetch('/api/settings/shipper');
      if (response.ok) {
        const shipperData = await response.json();
        if (shipperData && Object.keys(shipperData).length > 0) {
          if (shipperData.name) shipperInputs.name.value = shipperData.name;
          if (shipperData.company !== undefined) shipperInputs.company.value = shipperData.company;
          if (shipperData.address1) shipperInputs.address1.value = shipperData.address1;
          if (shipperData.city) shipperInputs.city.value = shipperData.city;
          if (shipperData.zip) shipperInputs.zip.value = shipperData.zip;
          if (shipperData.country) shipperInputs.country.value = shipperData.country;
          if (shipperData.phone) shipperInputs.phone.value = shipperData.phone;
        }
      }
    } catch (e) {
      console.error('Errore nel caricamento dei dati mittente dal server:', e);
    }
  }

  // Salva impostazioni sul server
  async function saveShipperSettings() {
    const settings = {};
    let missingField = false;

    // I campi obbligatori per il mittente sono nome, indirizzo, città, CAP, paese, telefono
    const mandatory = ['name', 'address1', 'city', 'zip', 'country', 'phone'];

    Object.keys(shipperInputs).forEach(key => {
      const val = shipperInputs[key].value.trim();
      settings[key] = val;
      if (mandatory.includes(key) && !val) {
        missingField = true;
      }
    });

    if (missingField) {
      showToast('Errore', 'Compila tutti i campi obbligatori del mittente (Nome, Indirizzo 1, Città, CAP, Paese e Telefono).', 'error');
      return;
    }

    saveShipperBtn.disabled = true;
    const originalContent = saveShipperBtn.innerHTML;
    saveShipperBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Salvataggio...';

    try {
      const response = await fetch('/api/settings/shipper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const data = await response.json();

      if (response.ok) {
        showToast('Successo', 'Dati mittente salvati correttamente sul server!', 'success');
      } else {
        showToast('Errore', data.error || 'Impossibile salvare i dati mittente.', 'error');
      }
    } catch (e) {
      showToast('Errore', 'Errore di rete: impossibile salvare i dati.', 'error');
    } finally {
      saveShipperBtn.disabled = false;
      saveShipperBtn.innerHTML = originalContent;
      lucide.createIcons();
    }
  }

  // Recupera i dati correnti del mittente da inviare alle API
  function getShipperData() {
    const settings = {};
    let hasData = false;
    Object.keys(shipperInputs).forEach(key => {
      const val = shipperInputs[key].value.trim();
      if (val) {
        settings[key] = val;
        hasData = true;
      }
    });
    return hasData ? settings : null;
  }

  // Ricerca Ordini
  async function handleSearch(e) {
    if (e) e.preventDefault();

    const reference = document.getElementById('filter-reference').value.trim();
    const state = document.getElementById('filter-state').value.trim();
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    const limitSelect = document.getElementById('filter-limit');
    const limit = limitSelect ? limitSelect.value : '';

    // Aggiorna footer di stato
    updateActionFooter();

    // Mostra indicatore caricamento
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="loading-container">
            <span class="spinner"></span>
            <p>Caricamento ordini dal webservice di PrestaShop...</p>
          </div>
        </td>
      </tr>
    `;
    ordersCountText.textContent = 'Ricerca in corso...';
    searchBtn.disabled = true;

    try {
      const queryParams = new URLSearchParams();
      if (reference) queryParams.append('reference', reference);
      if (state) queryParams.append('state', state);
      if (dateFrom) queryParams.append('date_from', dateFrom);
      if (dateTo) queryParams.append('date_to', dateTo);
      if (limit) queryParams.append('limit', limit);

      const response = await fetch(`/api/orders?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`Risposta del server con codice ${response.status}`);
      }

      loadedOrders = await response.json();
      renderOrdersTable();
    } catch (error) {
      console.error(error);
      showToast('Errore API', `Impossibile caricare gli ordini: ${error.message}`, 'error');
      ordersTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="12">
            <div class="empty-state">
              <i data-lucide="alert-circle" style="color: var(--color-error)"></i>
              <p>Errore nel recupero degli ordini. Controlla l'indirizzo del server o le credenziali.</p>
            </div>
          </td>
        </tr>
      `;
      ordersCountText.textContent = 'Trovati 0 ordini';
      lucide.createIcons();
    } finally {
      searchBtn.disabled = false;
    }
  }

  // Disegna Tabella Ordini
  function renderOrdersTable() {
    masterCheckbox.checked = false;

    if (!loadedOrders || loadedOrders.length === 0) {
      ordersTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="12">
            <div class="empty-state">
              <i data-lucide="package-x"></i>
              <p>Nessun ordine trovato con i criteri di filtro specificati.</p>
            </div>
          </td>
        </tr>
      `;
      ordersCountText.textContent = 'Trovati 0 ordini';
      lucide.createIcons();
      return;
    }

    ordersCountText.textContent = `Trovat${loadedOrders.length > 1 ? 'i' : 'o'} ${loadedOrders.length} ordin${loadedOrders.length > 1 ? 'i' : 'o'}`;
    
    ordersTableBody.innerHTML = loadedOrders.map(order => {
      const isChecked = selectedOrders.has(order.id);
      const formattedDate = new Date(order.date_add.replace(' ', 'T')).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const stateName = order.state_name || `Stato ${order.current_state}`;

      const productsHtml = (order.products && order.products.length > 0)
        ? order.products.map(p => `
            <div class="product-item">
              <strong class="product-qty">${p.qty}x</strong>
              <span class="product-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</span>
            </div>
          `).join('')
        : '<span class="text-muted">—</span>';

      const customerHtml = order.customer_error
        ? `<div style="display:inline-flex; align-items:center; gap:6px;" title="Attenzione: errore di caricamento cliente da PrestaShop o ID non valido">
             <i data-lucide="alert-triangle" style="width:14px;height:14px;color:var(--fedex-orange);flex-shrink:0;"></i>
             <span style="color:var(--text-secondary); font-style:italic;">${escapeHTML(order.customer_name)}</span>
           </div>`
        : escapeHTML(order.customer_name);

      const addressHtml = order.address_error
        ? `<div style="display:inline-flex; align-items:center; gap:6px;" title="Attenzione: dati di spedizione (via, nazione, cap) incompleti o non caricati correttamente">
             <i data-lucide="alert-triangle" style="width:14px;height:14px;color:var(--fedex-orange);flex-shrink:0;"></i>
             <span style="color:var(--text-secondary); font-style:italic;">${escapeHTML(order.delivery_address)}</span>
           </div>`
        : escapeHTML(order.delivery_address);

      const cityHtml = order.address_error
        ? `<span style="color:var(--text-secondary); font-style:italic;">${escapeHTML(order.delivery_city)}</span>`
        : escapeHTML(order.delivery_city);

      const provHtml = order.address_error
        ? `<span style="color:var(--text-secondary); font-style:italic;">${escapeHTML(order.delivery_province)}</span>`
        : escapeHTML(order.delivery_province);

      const countryHtml = order.address_error
        ? `<span style="color:var(--text-secondary); font-style:italic;">${escapeHTML(order.delivery_country)}</span>`
        : escapeHTML(order.delivery_country);

      return `
        <tr data-id="${order.id}">
          <td>
            <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked ? 'checked' : ''}>
          </td>
          <td>${order.id}</td>
          <td><span class="order-ref-badge">${order.reference}</span></td>
          <td>${formattedDate}</td>
          <td>${customerHtml}</td>
          <td>${addressHtml}</td>
          <td>${cityHtml}</td>
          <td class="text-center">${provHtml}</td>
          <td class="text-center">${countryHtml}</td>
          <td><div class="products-cell">${productsHtml}</div></td>
          <td><span class="badge state-badge">${stateName}</span></td>
          <td class="text-right">€ ${parseFloat(order.total_paid_tax_incl).toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    // Re-inizializza icone
    lucide.createIcons();

    // Listener checkbox singole
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.dataset.id, 10);
        const order = loadedOrders.find(o => o.id === id);
        if (cb.checked) {
          if (order) selectedOrders.set(id, order);
        } else {
          selectedOrders.delete(id);
        }
        updateMasterCheckboxState();
        updateActionFooter();
      });
    });
  }

  // Pulisci Filtri
  function clearFilters() {
    filterForm.reset();
    handleSearch();
  }

  // Gestione Selezione Checkbox
  function handleMasterCheckboxChange(e) {
    const checked = e.target.checked;
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => {
      const id = parseInt(cb.dataset.id, 10);
      cb.checked = checked;
      const order = loadedOrders.find(o => o.id === id);
      if (checked) {
        if (order) selectedOrders.set(id, order);
      } else {
        selectedOrders.delete(id);
      }
    });
    updateActionFooter();
  }

  // Seleziona/deseleziona tutti gli ordini caricati
  function selectAllOrders() {
    loadedOrders.forEach(order => selectedOrders.set(order.id, order));
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    masterCheckbox.checked = true;
    updateActionFooter();
  }

  function deselectAllOrders() {
    selectedOrders.clear();
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    masterCheckbox.checked = false;
    updateActionFooter();
  }

  function updateMasterCheckboxState() {
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    if (checkboxes.length === 0) {
      masterCheckbox.checked = false;
      return;
    }
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    masterCheckbox.checked = allChecked;
  }

  function updateActionFooter() {
    const count = selectedOrders.size;
    selectedBadge.textContent = count;

    const tagsContainer = document.getElementById('selected-tags');
    if (tagsContainer) {
      if (count > 0) {
        tagsContainer.innerHTML = Array.from(selectedOrders.values()).map(order => `
          <div class="selected-tag" data-id="${order.id}">
            <span>ID ${order.id} - ${order.reference}</span>
            <span class="selected-tag-close">&times;</span>
          </div>
        `).join('');

        // Aggiungi click listener a ciascun tag per rimuoverlo
        tagsContainer.querySelectorAll('.selected-tag').forEach(tag => {
          tag.addEventListener('click', () => {
            const id = parseInt(tag.dataset.id, 10);
            selectedOrders.delete(id);

            // Deseleziona la checkbox nella tabella se presente
            const cb = ordersTableBody.querySelector(`.order-checkbox[data-id="${id}"]`);
            if (cb) cb.checked = false;

            updateMasterCheckboxState();
            updateActionFooter();
          });
        });
      } else {
        tagsContainer.innerHTML = '';
      }
    }

    if (count > 0) {
      actionFooter.classList.remove('hidden');
    } else {
      actionFooter.classList.add('hidden');
    }
  }

  // Esportazione Ordini in Excel per FedEx
  async function handleExport() {
    if (selectedOrders.size === 0) return;

    const exportCount = selectedOrders.size;
    exportBtn.disabled = true;
    const originalContent = exportBtn.innerHTML;
    exportBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px;"></span> Generazione file...`;

    try {
      const weight = parseFloat(document.getElementById('default-weight').value) || 70.0;
      const length = parseFloat(document.getElementById('default-length').value) || 80.0;
      const width = parseFloat(document.getElementById('default-width').value) || 60.0;
      const height = parseFloat(document.getElementById('default-height').value) || 100.0;
      const service = document.getElementById('default-service').value;
      const packageType = document.getElementById('default-package').value;
      const shipper = getShipperData();

      const requestBody = {
        orderIds: Array.from(selectedOrders.keys()),
        defaults: { weight, length, width, height, service, packageType },
        shipper
      };

      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Errore del server: ${response.status}`);
      }

      // Controlla la presenza di intestazioni con avvisi personalizzati
      const warningsHeader = response.headers.get('X-Export-Warnings');
      if (warningsHeader) {
        try {
          const warnings = JSON.parse(decodeURIComponent(warningsHeader));
          warnings.forEach(warn => {
            showToast('Avviso Esportazione', warn, 'warning');
          });
        } catch (e) {
          console.error('Errore nel parsing dell\'header degli avvisi:', e);
        }
      }

      // Ricevi il foglio di calcolo come file binario ed avvia il download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      
      a.download = `spedizioni_fedex_${datePart}_${timePart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      showToast('Esportazione Completata', `Compilate correttamente ${exportCount} spedizioni in Excel.`, 'success');
      
      // Deseleziona gli ordini esportati
      deselectAllOrders();

    } catch (error) {
      console.error(error);
      showToast('Esportazione Fallita', error.message, 'error');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalContent;
    }
  }

  // Sistema di Notifica Toast
  function showToast(title, message, type = 'info') {
    const container = document.getElementById('notification-area');
    
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

    // Chiusura al click della crocetta
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.style.animation = 'none';
      toast.offsetHeight; // trigger reflow
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    });

    // Chiusura automatica dopo 6 secondi
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000);
  }

  // --- SEZIONE IMPORTAZIONE TRACKING FEDEX ---

  // Navigazione Tab
  const menuOrders = document.getElementById('menu-orders');
  const menuImportTracking = document.getElementById('menu-import-tracking');
  const menuHistory = document.getElementById('menu-history');
  const sectionOrders = document.getElementById('section-orders');
  const sectionImportTracking = document.getElementById('section-import-tracking');
  const sectionHistory = document.getElementById('section-history');
  const mainHeaderTitle = document.querySelector('.header-title h1');
  const mainHeaderSubtitle = document.querySelector('.header-title p');

  menuOrders.addEventListener('click', () => {
    menuOrders.classList.add('active');
    menuImportTracking.classList.remove('active');
    if (menuHistory) menuHistory.classList.remove('active');
    sectionOrders.classList.remove('hidden');
    sectionImportTracking.classList.add('hidden');
    if (sectionHistory) sectionHistory.classList.add('hidden');
    mainHeaderTitle.textContent = 'Gestione Spedizioni PrestaShop';
    mainHeaderSubtitle.textContent = 'Seleziona gli ordini da dagimarket.com e compila l\'Excel per la spedizione batch FedEx';
  });

  menuImportTracking.addEventListener('click', () => {
    menuOrders.classList.remove('active');
    menuImportTracking.classList.add('active');
    if (menuHistory) menuHistory.classList.remove('active');
    sectionOrders.classList.add('hidden');
    sectionImportTracking.classList.remove('hidden');
    if (sectionHistory) sectionHistory.classList.add('hidden');
    mainHeaderTitle.textContent = 'Importazione Tracking FedEx';
    mainHeaderSubtitle.textContent = 'Carica il file con i tracking di ritorno generati da FedEx per associarli in PrestaShop';
    
    // Nascondi footer di selezione ordini se attivo
    if (actionFooter) {
      actionFooter.classList.add('hidden');
    }
  });

  if (menuHistory && sectionHistory) {
    menuHistory.addEventListener('click', () => {
      menuOrders.classList.remove('active');
      menuImportTracking.classList.remove('active');
      menuHistory.classList.add('active');
      sectionOrders.classList.add('hidden');
      sectionImportTracking.classList.add('hidden');
      sectionHistory.classList.remove('hidden');
      mainHeaderTitle.textContent = 'Storico Operazioni';
      mainHeaderSubtitle.textContent = 'Visualizza il registro delle esportazioni ed importazioni effettuate';
      
      if (actionFooter) {
        actionFooter.classList.add('hidden');
      }
      
      loadHistory();
    });
  }

  // Gestione File Upload (Drag & Drop)
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  let currentFileData = null;
  let currentFileName = '';

  if (dropZone) {
    dropZone.addEventListener('click', () => {
      const actualInput = document.getElementById('file-input');
      if (actualInput) actualInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelected(e.target.files[0]);
      }
    });
  }

  async function handleFileSelected(file) {
    const validExtensions = ['xlsx', 'csv'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
      showToast('Errore file', 'Carica solo file in formato Excel (.xlsx) o CSV (.csv)', 'error');
      return;
    }

    currentFileName = file.name;
    
    // Leggi file come base64 per inviarlo al backend
    const reader = new FileReader();
    reader.onload = async function(e) {
      const dataUrl = e.target.result;
      currentFileData = dataUrl.split(',')[1];
      await parseFile(currentFileData, currentFileName);
    };
    reader.readAsDataURL(file);
  }

  // Interazione API: parse-file
  const importStep1 = document.getElementById('import-step-1');
  const importStep2 = document.getElementById('import-step-2');
  const importStep3 = document.getElementById('import-step-3');
  const mapReferenceCol = document.getElementById('map-reference-col');
  const mapTrackingCol = document.getElementById('map-tracking-col');
  const previewTableHead = document.getElementById('preview-table-head');
  const previewTableBody = document.getElementById('preview-table-body');

  async function parseFile(fileData, fileName) {
    if (!dropZone) return;
    
    const originalZoneHTML = dropZone.innerHTML;
    dropZone.innerHTML = `
      <span class="spinner" style="width:36px;height:36px;margin-bottom:16px;"></span>
      <h3>Lettura del file in corso...</h3>
      <p>Estrazione delle colonne e dell'anteprima</p>
    `;
    
    try {
      const response = await fetch('/api/tracking/parse-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileData, fileName })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Errore durante la lettura del file.');
      }

      const result = await response.json();
      renderMappingStep(result);
      
    } catch (error) {
      console.error(error);
      showToast('Errore caricamento', error.message, 'error');
      resetImportStep1();
    }
  }

  function resetImportStep1() {
    if (!dropZone) return;
    dropZone.innerHTML = `
      <i data-lucide="file-up"></i>
      <h3>Trascina il file qui o clicca per sfogliare</h3>
      <p>Supporta formati Excel (.xlsx) e CSV (.csv)</p>
      <input type="file" id="file-input" class="hidden-file-input" accept=".xlsx,.csv">
    `;
    lucide.createIcons();
    
    // Riassegna il listener sul nuovo input file creato
    const newFileInput = document.getElementById('file-input');
    if (newFileInput) {
      newFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileSelected(e.target.files[0]);
        }
      });
    }
  }

  function renderMappingStep(data) {
    const { headers, preview, autoMapped } = data;
    
    // Popola i menu a tendina
    mapReferenceCol.innerHTML = '';
    mapTrackingCol.innerHTML = '';
    
    headers.forEach(h => {
      const opt1 = document.createElement('option');
      opt1.value = h;
      opt1.textContent = h;
      if (h === autoMapped.referenceColumn) opt1.selected = true;
      mapReferenceCol.appendChild(opt1);
      
      const opt2 = document.createElement('option');
      opt2.value = h;
      opt2.textContent = h;
      if (h === autoMapped.trackingColumn) opt2.selected = true;
      mapTrackingCol.appendChild(opt2);
    });

    // Intestazione tabella anteprima
    previewTableHead.innerHTML = '';
    const trHead = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    });
    previewTableHead.appendChild(trHead);

    // Righe tabella anteprima
    previewTableBody.innerHTML = '';
    if (preview.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${headers.length}" class="text-center" style="color:var(--text-muted); padding: 24px 0;">Nessun dato rilevato per l'anteprima.</td>`;
      previewTableBody.appendChild(tr);
    } else {
      preview.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(h => {
          const td = document.createElement('td');
          td.textContent = row[h] || '';
          tr.appendChild(td);
        });
        previewTableBody.appendChild(tr);
      });
    }

    importStep1.classList.add('hidden');
    importStep2.classList.remove('hidden');
    importStep3.classList.add('hidden');
    lucide.createIcons();
  }

  // Pulsanti Step 2
  const btnCancelMapping = document.getElementById('btn-cancel-mapping');
  const btnStartImport = document.getElementById('btn-start-import');

  if (btnCancelMapping) {
    btnCancelMapping.addEventListener('click', () => {
      importStep1.classList.remove('hidden');
      importStep2.classList.add('hidden');
      importStep3.classList.add('hidden');
      resetImportStep1();
    });
  }

  if (btnStartImport) {
    btnStartImport.addEventListener('click', async () => {
      const refCol = mapReferenceCol.value;
      const trackCol = mapTrackingCol.value;

      if (!refCol || !trackCol) {
        showToast('Errore mappatura', 'Seleziona entrambe le colonne obbligatorie.', 'error');
        return;
      }

      if (refCol === trackCol) {
        showToast('Errore mappatura', 'La colonna Riferimento e la colonna Codice Tracking non possono coincidere.', 'warning');
        return;
      }

      btnStartImport.disabled = true;
      const originalContent = btnStartImport.innerHTML;
      btnStartImport.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Importazione in corso...';

      try {
        const response = await fetch('/api/tracking/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileData: currentFileData,
            fileName: currentFileName,
            referenceColumn: refCol,
            trackingColumn: trackCol
          })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Errore durante l\'aggiornamento dei tracking.');
        }

        const result = await response.json();
        renderResultsStep(result);
        
      } catch (error) {
        console.error(error);
        showToast('Importazione Fallita', error.message, 'error');
      } finally {
        btnStartImport.disabled = false;
        btnStartImport.innerHTML = originalContent;
      }
    });
  }

  // Elementi Step 3
  const summaryTotal = document.getElementById('summary-total');
  const summarySuccess = document.getElementById('summary-success');
  const summaryWarning = document.getElementById('summary-warning');
  const summaryError = document.getElementById('summary-error');
  const logTableBody = document.getElementById('log-table-body');
  const btnResetImport = document.getElementById('btn-reset-import');

  function renderResultsStep(result) {
    const { summary, details } = result;
    
    // Aggiorna contatori
    summaryTotal.textContent = summary.totalProcessed;
    summarySuccess.textContent = summary.successCount;
    summaryWarning.textContent = summary.warningCount;
    summaryError.textContent = summary.errorCount;

    // Popola log delle operazioni
    logTableBody.innerHTML = '';
    
    const allLogs = [];
    
    details.success.forEach(item => {
      allLogs.push({
        row: item.row,
        reference: item.reference,
        type: 'success',
        message: item.message
      });
    });

    details.warnings.forEach(item => {
      allLogs.push({
        row: item.row,
        reference: item.reference,
        type: 'warning',
        message: item.message
      });
    });

    details.errors.forEach(item => {
      allLogs.push({
        row: item.row,
        reference: item.reference,
        type: 'error',
        message: item.message
      });
    });

    // Ordina per numero di riga del file
    allLogs.sort((a, b) => a.row - b.row);

    if (allLogs.length === 0) {
      logTableBody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:var(--text-muted); padding:20px;">Nessun tracciato di log registrato.</td></tr>';
    } else {
      allLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let tagClass = 'success';
        let tagText = 'Successo';
        if (log.type === 'warning') {
          tagClass = 'warning';
          tagText = 'Avviso';
        } else if (log.type === 'error') {
          tagClass = 'error';
          tagText = 'Errore';
        }

        tr.innerHTML = `
          <td class="text-center font-semibold" style="color: var(--text-secondary);">${log.row}</td>
          <td><code class="font-mono">${escapeHTML(log.reference)}</code></td>
          <td><span class="log-tag ${tagClass}">${tagText}</span></td>
          <td class="font-medium" style="color: var(--text-secondary);">${escapeHTML(log.message)}</td>
        `;
        logTableBody.appendChild(tr);
      });
    }

    importStep1.classList.add('hidden');
    importStep2.classList.add('hidden');
    importStep3.classList.remove('hidden');
    lucide.createIcons();

    showToast(
      'Importazione Completata',
      `Processati ${summary.totalProcessed} elementi: ${summary.successCount} riusciti, ${summary.warningCount + summary.errorCount} anomalie.`,
      summary.errorCount > 0 ? 'error' : (summary.warningCount > 0 ? 'warning' : 'success')
    );
  }

  if (btnResetImport) {
    btnResetImport.addEventListener('click', () => {
      importStep1.classList.remove('hidden');
      importStep2.classList.add('hidden');
      importStep3.classList.add('hidden');
      resetImportStep1();
    });
  }

  // Button Close Detail
  const btnCloseHistoryDetail = document.getElementById('btn-close-history-detail');
  if (btnCloseHistoryDetail) {
    btnCloseHistoryDetail.addEventListener('click', () => {
      const detailCard = document.getElementById('history-detail-card');
      if (detailCard) detailCard.classList.add('hidden');
    });
  }

  // Button Clear All History
  const btnClearAllHistory = document.getElementById('btn-clear-all-history');
  if (btnClearAllHistory) {
    btnClearAllHistory.addEventListener('click', () => {
      if (confirm('Sei assolutamente sicuro di voler eliminare TUTTO lo storico delle operazioni? Questa azione eliminerà permanentemente tutti i log e tutti i file Excel salvati sul server e non può essere annullata.')) {
        clearAllHistory();
      }
    });
  }

  async function loadHistory() {
    const tableBody = document.getElementById('history-table-body');
    const detailCard = document.getElementById('history-detail-card');
    if (!tableBody) return;

    if (detailCard) detailCard.classList.add('hidden'); // Nascondi dettagli precedenti

    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center" style="padding: 30px;">
          <span class="spinner" style="width:24px;height:24px;margin: 0 auto;display:block;"></span>
          Caricamento storico...
        </td>
      </tr>
    `;

    try {
      const response = await fetch('/api/history');
      if (!response.ok) throw new Error('Errore nel recupero dello storico.');

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        tableBody.innerHTML = `
          <tr class="empty-row">
            <td colspan="5">
              <div class="empty-state">
                <i data-lucide="history"></i>
                <p>Nessuna operazione registrata nello storico.</p>
              </div>
            </td>
          </tr>
        `;
        lucide.createIcons();
        return;
      }

      tableBody.innerHTML = '';
      data.forEach(item => {
        const tr = document.createElement('tr');
        
        // Date formatting
        const dateObj = new Date(item.timestamp);
        const formattedDate = dateObj.toLocaleString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Type Badge
        const isExport = item.type === 'export';
        const badgeClass = isExport ? 'badge-export' : 'badge-import';
        const badgeText = isExport ? 'Esportazione' : 'Importazione';

        // Summary details
        let summaryText = '';
        if (isExport) {
          summaryText = `${item.count} ordini esportati`;
        } else {
          const succ = item.summary ? item.summary.successCount : 0;
          const warn = item.summary ? item.summary.warningCount : 0;
          const errs = item.summary ? item.summary.errorCount : 0;
          summaryText = `${succ} riusciti, ${warn} avvisi, ${errs} errori`;
        }

        // Actions buttons
        let actionsHTML = '';
        if (isExport && item.fileName) {
          actionsHTML += `
            <a href="/api/history/download/${encodeURIComponent(item.fileName)}" class="btn btn-outline btn-sm btn-icon-only" download title="Scarica file Excel" style="margin-right: 6px; display: inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0;">
              <i data-lucide="download" style="width:16px; height:16px;"></i>
            </a>
          `;
        }
        
        actionsHTML += `
          <button class="btn btn-outline btn-sm btn-icon-only btn-view-details" data-id="${item.id}" title="Visualizza dettagli log" style="margin-right: 6px; display: inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0;">
            <i data-lucide="eye" style="width:16px; height:16px;"></i>
          </button>
          <button class="btn btn-outline btn-sm btn-icon-only btn-delete-entry" style="border-color: var(--color-error); color: var(--color-error); display: inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0;" data-id="${item.id}" title="Elimina operazione">
            <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
          </button>
        `;

        tr.innerHTML = `
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td>${formattedDate}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.88rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(item.fileName || 'Log Importazione')}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${item.id}</div>
          </td>
          <td class="font-medium" style="color: var(--text-secondary);">${summaryText}</td>
          <td class="text-right">${actionsHTML}</td>
        `;

        // Event listener for view details
        tr.querySelector('.btn-view-details').addEventListener('click', () => {
          showHistoryDetails(item);
        });

        // Event listener for delete entry
        tr.querySelector('.btn-delete-entry').addEventListener('click', async () => {
          if (confirm('Sei sicuro di voler eliminare questa operazione dallo storico? Se si tratta di un\'esportazione, verrà eliminato anche il relativo file Excel dal server.')) {
            await deleteHistoryEntry(item.id);
          }
        });

        tableBody.appendChild(tr);
      });

      lucide.createIcons();

    } catch (error) {
      console.error(error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center" style="padding: 30px; color: var(--color-error);">
            <i data-lucide="alert-circle" style="margin: 0 auto 8px; display:block;"></i>
            Impossibile caricare lo storico: ${escapeHTML(error.message)}
          </td>
        </tr>
      `;
      lucide.createIcons();
    }
  }

  // Show details of a history log
  function showHistoryDetails(item) {
    const detailCard = document.getElementById('history-detail-card');
    const detailTitle = document.getElementById('history-detail-title');
    const detailSubtitle = document.getElementById('history-detail-subtitle');
    const detailThead = document.getElementById('history-detail-thead');
    const detailTbody = document.getElementById('history-detail-tbody');

    if (!detailCard || !detailTbody) return;

    detailCard.classList.remove('hidden');
    
    // Set title and date
    const dateObj = new Date(item.timestamp);
    detailTitle.textContent = item.type === 'export' ? 'Dettaglio Esportazione FedEx' : 'Dettaglio Importazione Tracking';
    detailSubtitle.textContent = `Data operazione: ${dateObj.toLocaleString('it-IT')} | ID: ${item.id}`;

    detailTbody.innerHTML = '';

    if (item.type === 'export') {
      // Headers for export details
      detailThead.innerHTML = `
        <tr>
          <th width="100" class="text-center">Indice</th>
          <th>Riferimento Ordine PrestaShop</th>
        </tr>
      `;

      if (item.details && item.details.length > 0) {
        item.details.forEach((ref, index) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="text-center font-semibold">${index + 1}</td>
            <td><code class="font-mono">${escapeHTML(ref)}</code></td>
          `;
          detailTbody.appendChild(tr);
        });
      } else {
        detailTbody.innerHTML = '<tr><td colspan="2" class="text-center">Nessun ordine registrato.</td></tr>';
      }

      // Append warnings if any
      if (item.warnings && item.warnings.length > 0) {
        const warningTr = document.createElement('tr');
        warningTr.innerHTML = `
          <td colspan="2" style="background: rgba(245, 158, 11, 0.05); padding: 16px;">
            <div style="font-weight: 700; color: var(--color-warning); margin-bottom: 8px;">
              <i data-lucide="alert-triangle" style="width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>
              Avvisi riscontrati durante l'esportazione:
            </div>
            <ul style="margin-left: 20px; font-size: 0.85rem; color: var(--text-secondary); list-style-type: disc;">
              ${item.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join('')}
            </ul>
          </td>
        `;
        detailTbody.appendChild(warningTr);
        lucide.createIcons();
      }
    } else {
      // Headers for import details
      detailThead.innerHTML = `
        <tr>
          <th width="100" class="text-center">Riga File</th>
          <th width="180">Riferimento Ordine</th>
          <th width="130">Esito</th>
          <th>Messaggio di Dettaglio</th>
        </tr>
      `;

      const allLogs = [];
      const details = item.details || { success: [], warnings: [], errors: [] };

      (details.success || []).forEach(l => {
        allLogs.push({ row: l.row, reference: l.reference, type: 'success', message: l.message });
      });
      (details.warnings || []).forEach(l => {
        allLogs.push({ row: l.row, reference: l.reference, type: 'warning', message: l.message });
      });
      (details.errors || []).forEach(l => {
        allLogs.push({ row: l.row, reference: l.reference, type: 'error', message: l.message });
      });

      allLogs.sort((a, b) => a.row - b.row);

      if (allLogs.length > 0) {
        allLogs.forEach(log => {
          const tr = document.createElement('tr');
          let tagClass = 'success';
          let tagText = 'Successo';
          if (log.type === 'warning') {
            tagClass = 'warning';
            tagText = 'Avviso';
          } else if (log.type === 'error') {
            tagClass = 'error';
            tagText = 'Errore';
          }

          tr.innerHTML = `
            <td class="text-center font-semibold" style="color: var(--text-secondary);">${log.row}</td>
            <td><code class="font-mono">${escapeHTML(log.reference)}</code></td>
            <td><span class="log-tag ${tagClass}">${tagText}</span></td>
            <td class="font-medium" style="color: var(--text-secondary);">${escapeHTML(log.message)}</td>
          `;
          detailTbody.appendChild(tr);
        });
      } else {
        detailTbody.innerHTML = '<tr><td colspan="4" class="text-center">Nessun log dettagliato trovato.</td></tr>';
      }
    }

    // Scroll details card into view
    detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Delete a history entry
  async function deleteHistoryEntry(id) {
    try {
      const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      const result = await response.json();

      if (response.ok) {
        showToast('Successo', result.message || 'Operazione eliminata.', 'success');
        await loadHistory();
      } else {
        showToast('Errore', result.error || 'Impossibile eliminare l\'operazione.', 'error');
      }
    } catch (e) {
      showToast('Errore', 'Errore di rete: impossibile eliminare l\'operazione.', 'error');
    }
  }

  // Clear all history
  async function clearAllHistory() {
    try {
      const response = await fetch('/api/history', { method: 'DELETE' });
      const result = await response.json();

      if (response.ok) {
        showToast('Successo', result.message || 'Storico ripulito.', 'success');
        await loadHistory();
      } else {
        showToast('Errore', result.error || 'Impossibile svuotare lo storico.', 'error');
      }
    } catch (e) {
      showToast('Errore', 'Errore di rete: impossibile svuotare lo storico.', 'error');
    }
  }

  // Utility Escaping HTML
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

