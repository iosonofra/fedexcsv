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
      const response = await fetch('/api/orders/states');
      if (response.ok) {
        const states = await response.json();
        const stateSelect = document.getElementById('filter-state');
        if (stateSelect && Array.isArray(states)) {
          stateSelect.innerHTML = '<option value="">Tutti gli stati</option>';
          states.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = `${s.name} (ID ${s.id})`;
            if (s.id === 2) {
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

          // Imposta i valori predefiniti del mittente
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

    // Carica eventuali override personalizzati salvati dall'utente in LocalStorage
    const saved = localStorage.getItem('fedex_shipper_settings');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        Object.keys(shipperInputs).forEach(key => {
          if (shipperInputs[key] && config[key] !== undefined) {
            shipperInputs[key].value = config[key];
          }
        });
      } catch (e) {
        console.error('Errore nel parsing delle impostazioni mittente salvate:', e);
      }
    }
  }

  // Salva impostazioni in localStorage
  function saveShipperSettings() {
    const settings = {};
    Object.keys(shipperInputs).forEach(key => {
      settings[key] = shipperInputs[key].value.trim();
    });
    localStorage.setItem('fedex_shipper_settings', JSON.stringify(settings));
    showToast('Successo', 'Dati mittente salvati correttamente!', 'success');
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

      return `
        <tr data-id="${order.id}">
          <td>
            <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked ? 'checked' : ''}>
          </td>
          <td>${order.id}</td>
          <td><span class="order-ref-badge">${order.reference}</span></td>
          <td>${formattedDate}</td>
          <td>${escapeHTML(order.customer_name)}</td>
          <td>${escapeHTML(order.delivery_address)}</td>
          <td>${escapeHTML(order.delivery_city)}</td>
          <td class="text-center">${escapeHTML(order.delivery_province)}</td>
          <td class="text-center">${escapeHTML(order.delivery_country)}</td>
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
      a.download = `spedizioni_fedex_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  // L'avvio iniziale viene gestito da initializeApp()
});
