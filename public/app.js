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
  const actionFooter = document.getElementById('action-footer');
  const selectedBadge = document.getElementById('selected-badge');
  const exportBtn = document.getElementById('export-btn');
  
  // Elementi Impostazioni Mittente
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
  let activePollingInterval = null; // Guard contro doppio import tracking

  // Nomi amichevoli dei servizi FedEx
  const serviceFriendlyNames = {
    'FEDEX_PRIORITY_FREIGHT': 'FedEx® Priority Freight',
    'FEDEX_REGIONAL_ECONOMY': 'FedEx® Regional Economy',
    'INTERNATIONAL_FIRST': 'FedEx International First®',
    'FEDEX_INTERNATIONAL_PRIORITY': 'FedEx International Priority®',
    'FEDEX_INTERNATIONAL_CONNECT_PLUS': 'FedEx International Connect Plus',
    'PRIORITY_OVERNIGHT': 'FedEx Priority Overnight®',
    'FEDEX_INTERNATIONAL_PRIORITY_EXPRESS': 'FedEx International Priority® Express',
    'INTERNATIONAL_ECONOMY_FREIGHT': 'FedEx International Economy® Freight',
    'INTERNATIONAL_PRIORITY_FREIGHT': 'FedEx International Priority® Freight',
    'FEDEX_1_DAY_FREIGHT': 'FedEx 1Day® Freight',
    'FEDEX_PRIORITY_EXPRESS_FREIGHT': 'FedEx® Priority Express Freight',
    'INTERNATIONAL_ECONOMY': 'FedEx International Economy®',
    'FIRST_OVERNIGHT': 'FedEx First Overnight®',
    'FEDEX_REGIONAL_ECONOMY_FREIGHT': 'FedEx® Regional Economy Freight',
    'FEDEX_PRIORITY': 'FedEx® Priority',
    'FEDEX_PRIORITY_EXPRESS': 'FedEx® Priority Express',
    'FEDEX_FIRST': 'FedEx® First',
    'INTERNATIONAL_DEFERRED_FREIGHT': 'FedEx® International Deferred Freight',
    'STANDARD_OVERNIGHT': 'Standard Overnight',
    'FEDEX_GROUND': 'FedEx Ground®',
    'GROUND_HOME_DELIVERY': 'FedEx Home Delivery®',
    'SMART_POST': 'Fedex Ground® Economy',
    'FEDEX_EXPRESS_SAVER': 'FedEx Express Saver®',
    'FEDEX_ECONOMY_SELECT': 'FedEx Economy Select'
  };

  // Indicatore di connessione dinamico
  function updateConnectionStatus(ok) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    if (dot && text) {
      dot.className = `status-dot ${ok ? 'green' : 'red'}`;
      text.textContent = ok ? 'Connesso' : 'Errore connessione';
    }
  }

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

    try {
      await loadOrderStates();
    } catch (e) {
      console.error('Errore nel caricamento degli stati ordine:', e);
    }
    try {
      await loadTemplates();
    } catch (e) {
      console.error('Errore nel caricamento dei template:', e);
    }
    try {
      setupExportModal();
    } catch (e) {
      console.error('Errore durante il setup del modal di esportazione:', e);
    }
    try {
      handleSearch();
    } catch (e) {
      console.error('Errore nella ricerca iniziale:', e);
    }
  }

  try {
    initializeApp();
  } catch (e) {
    console.error('Errore durante l\'inizializzazione dell\'applicazione:', e);
  }

  // Listener degli Eventi
  if (filterForm) filterForm.addEventListener('submit', handleSearch);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
  if (masterCheckbox) masterCheckbox.addEventListener('change', handleMasterCheckboxChange);
  if (exportBtn) exportBtn.addEventListener('click', handleExport);

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

  // Template states
  let shipmentTemplates = [];
  let shipperTemplates = [];
  let activeShipmentTemplateId = '';
  let activeShipperTemplateId = '';

  const shipmentTemplateSelect = document.getElementById('shipment-template-select');
  const shipperTemplateSelect = document.getElementById('shipper-template-select');

  // Load templates from API
  async function loadTemplates() {
    try {
      const response = await fetch('/api/settings/templates');
      if (response.ok) {
        const data = await response.json();
        
        // Shipment Templates
        shipmentTemplates = data.shipment.templates;
        activeShipmentTemplateId = data.shipment.activeId;
        
        // Shipper Templates
        shipperTemplates = data.shipper.templates;
        activeShipperTemplateId = data.shipper.activeId;

        // Populate selects
        populateTemplateSelect(shipmentTemplateSelect, shipmentTemplates, activeShipmentTemplateId);
        populateTemplateSelect(shipperTemplateSelect, shipperTemplates, activeShipperTemplateId);
        
        // confirmTemplatesBeforeExport setting
        const confirmTemplatesCheckbox = document.getElementById('confirm-templates-checkbox');
        if (confirmTemplatesCheckbox) {
          confirmTemplatesCheckbox.checked = !!data.confirmTemplatesBeforeExport;
        }

        // Apply active values to inputs
        applyActiveShipmentTemplate();
        applyActiveShipperTemplate();
        lucide.createIcons();
      }
    } catch (e) {
      console.error('Errore nel caricamento dei template:', e);
    }
  }

  function populateTemplateSelect(selectEl, templates, activeId) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === activeId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function applyActiveShipmentTemplate() {
    const active = shipmentTemplates.find(t => t.id === activeShipmentTemplateId);
    if (!active) return;
    
    const fields = {
      'default-weight': active.weight,
      'default-length': active.length,
      'default-width': active.width,
      'default-height': active.height,
      'default-service': active.service,
      'default-package': active.packageType
    };
    
    Object.keys(fields).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = fields[id];
    });
  }

  function applyActiveShipperTemplate() {
    const active = shipperTemplates.find(t => t.id === activeShipperTemplateId);
    if (!active) return;
    
    if (shipperInputs.name) shipperInputs.name.value = active.nameVal || '';
    if (shipperInputs.company) shipperInputs.company.value = active.company || '';
    if (shipperInputs.address1) shipperInputs.address1.value = active.address1 || '';
    if (shipperInputs.city) shipperInputs.city.value = active.city || '';
    if (shipperInputs.zip) shipperInputs.zip.value = active.zip || '';
    if (shipperInputs.country) {
      const code = (active.country || 'IT').toUpperCase().trim();
      let optionExists = false;
      for (let i = 0; i < shipperInputs.country.options.length; i++) {
        if (shipperInputs.country.options[i].value === code) {
          optionExists = true;
          break;
        }
      }
      if (!optionExists && code) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = `${code} - Altro`;
        shipperInputs.country.appendChild(opt);
      }
      shipperInputs.country.value = code;
    }
    if (shipperInputs.phone) shipperInputs.phone.value = active.phone || '';
  }

  // Active change listeners
  if (shipmentTemplateSelect) {
    shipmentTemplateSelect.addEventListener('change', async (e) => {
      const newId = e.target.value;
      try {
        const res = await fetch('/api/settings/templates/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'shipment', id: newId })
        });
        if (res.ok) {
          activeShipmentTemplateId = newId;
          applyActiveShipmentTemplate();
          showToast('Successo', 'Template spedizione attivo modificato.', 'success');
        }
      } catch (err) {
        showToast('Errore', 'Impossibile cambiare template.', 'error');
      }
    });
  }

  if (shipperTemplateSelect) {
    shipperTemplateSelect.addEventListener('change', async (e) => {
      const newId = e.target.value;
      try {
        const res = await fetch('/api/settings/templates/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'shipper', id: newId })
        });
        if (res.ok) {
          activeShipperTemplateId = newId;
          applyActiveShipperTemplate();
          showToast('Successo', 'Template mittente attivo modificato.', 'success');
        }
      } catch (err) {
        showToast('Errore', 'Impossibile cambiare template.', 'error');
      }
    });
  }

  // Save current fields back to active template
  async function saveActiveShipmentTemplate() {
    const active = shipmentTemplates.find(t => t.id === activeShipmentTemplateId);
    if (!active) return;
    
    const weight = parseFloat(document.getElementById('default-weight').value) || 70.0;
    const length = parseFloat(document.getElementById('default-length').value) || 80.0;
    const width = parseFloat(document.getElementById('default-width').value) || 60.0;
    const height = parseFloat(document.getElementById('default-height').value) || 100.0;
    const service = document.getElementById('default-service').value;
    const packageType = document.getElementById('default-package').value;

    const payload = {
      type: 'shipment',
      template: {
        id: active.id,
        name: active.name,
        weight, length, width, height, service, packageType
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Successo', `Template spedizione "${active.name}" salvato con successo!`, 'success');
        await loadTemplates();
      } else {
        showToast('Errore', 'Errore nel salvataggio del template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Impossibile connettersi al server.', 'error');
    }
  }

  async function saveActiveShipperTemplate() {
    const active = shipperTemplates.find(t => t.id === activeShipperTemplateId);
    if (!active) return;

    const nameVal = shipperInputs.name.value.trim();
    const company = shipperInputs.company.value.trim();
    const address1 = shipperInputs.address1.value.trim();
    const city = shipperInputs.city.value.trim();
    const zip = shipperInputs.zip.value.trim();
    const country = shipperInputs.country.value.trim();
    const phone = shipperInputs.phone.value.trim();

    if (!nameVal || !address1 || !city || !zip || !country || !phone) {
      showToast('Errore', 'Compila tutti i campi obbligatori del mittente.', 'error');
      return;
    }

    const payload = {
      type: 'shipper',
      template: {
        id: active.id,
        name: active.name,
        nameVal, company, address1, city, zip, country, phone
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Successo', `Template mittente "${active.name}" salvato con successo!`, 'success');
        await loadTemplates();
      } else {
        showToast('Errore', 'Errore nel salvataggio del template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Impossibile connettersi al server.', 'error');
    }
  }

  // Save buttons click bindings
  const saveShipmentBtn = document.getElementById('save-shipment-btn');
  if (saveShipmentBtn) {
    saveShipmentBtn.addEventListener('click', saveActiveShipmentTemplate);
  }
  if (saveShipperBtn) {
    saveShipperBtn.addEventListener('click', saveActiveShipperTemplate);
  }

  // Confirm templates checkbox toggle listener
  const confirmTemplatesCheckbox = document.getElementById('confirm-templates-checkbox');
  if (confirmTemplatesCheckbox) {
    confirmTemplatesCheckbox.addEventListener('change', async () => {
      const enabled = confirmTemplatesCheckbox.checked;
      try {
        const response = await fetch('/api/settings/confirm-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmTemplatesBeforeExport: enabled })
        });
        if (response.ok) {
          showToast('Impostazione Aggiornata', enabled ? 'Conferma template all\'esportazione attivata.' : 'Conferma template all\'esportazione disattivata.', 'success');
        } else {
          showToast('Errore', 'Impossibile salvare l\'impostazione.', 'error');
          confirmTemplatesCheckbox.checked = !enabled;
        }
      } catch (err) {
        showToast('Errore', 'Impossibile connettersi al server.', 'error');
        confirmTemplatesCheckbox.checked = !enabled;
      }
    });
  }

  // Rename active templates
  async function renameActiveShipmentTemplate() {
    const active = shipmentTemplates.find(t => t.id === activeShipmentTemplateId);
    if (!active) return;

    const newName = await showCustomPrompt('Rinomina Template Spedizione', 'Inserisci il nuovo nome per il template di spedizione:', active.name, 'scale');
    if (!newName) return;

    const payload = {
      type: 'shipment',
      template: {
        ...active,
        name: newName.trim()
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Successo', `Template rinominato in "${newName}"`, 'success');
        await loadTemplates();
      } else {
        showToast('Errore', 'Errore nel rinominare il template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Impossibile connettersi al server.', 'error');
    }
  }

  async function renameActiveShipperTemplate() {
    const active = shipperTemplates.find(t => t.id === activeShipperTemplateId);
    if (!active) return;

    const newName = await showCustomPrompt('Rinomina Template Mittente', 'Inserisci il nuovo nome per il template mittente:', active.name, 'user');
    if (!newName) return;

    const payload = {
      type: 'shipper',
      template: {
        ...active,
        name: newName.trim()
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Successo', `Template rinominato in "${newName}"`, 'success');
        await loadTemplates();
      } else {
        showToast('Errore', 'Errore nel rinominare il template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Impossibile connettersi al server.', 'error');
    }
  }

  // Rename buttons click bindings
  const btnRenameShipmentTemplate = document.getElementById('btn-rename-shipment-template');
  if (btnRenameShipmentTemplate) {
    btnRenameShipmentTemplate.addEventListener('click', renameActiveShipmentTemplate);
  }
  const btnRenameShipperTemplate = document.getElementById('btn-rename-shipper-template');
  if (btnRenameShipperTemplate) {
    btnRenameShipperTemplate.addEventListener('click', renameActiveShipperTemplate);
  }

  // Create new template clones
  async function createShipmentTemplate() {
    const name = await showCustomPrompt('Nuovo Template Spedizione', 'Inserisci il nome del nuovo template di spedizione:', '', 'scale');
    if (!name) return;

    const id = 't_' + Date.now();
    const weight = parseFloat(document.getElementById('default-weight').value) || 70.0;
    const length = parseFloat(document.getElementById('default-length').value) || 80.0;
    const width = parseFloat(document.getElementById('default-width').value) || 60.0;
    const height = parseFloat(document.getElementById('default-height').value) || 100.0;
    const service = document.getElementById('default-service').value;
    const packageType = document.getElementById('default-package').value;

    const payload = {
      type: 'shipment',
      template: {
        id,
        name: name.trim(),
        weight, length, width, height, service, packageType
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetch('/api/settings/templates/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'shipment', id })
        });
        showToast('Successo', `Template spedizione "${name}" creato.`, 'success');
        await loadTemplates();
      }
    } catch (err) {
      showToast('Errore', 'Impossibile creare il template.', 'error');
    }
  }

  async function createShipperTemplate() {
    const name = await showCustomPrompt('Nuovo Template Mittente', 'Inserisci il nome del nuovo template mittente:', '', 'user');
    if (!name) return;

    const id = 's_' + Date.now();
    const nameVal = shipperInputs.name.value.trim();
    const company = shipperInputs.company.value.trim();
    const address1 = shipperInputs.address1.value.trim();
    const city = shipperInputs.city.value.trim();
    const zip = shipperInputs.zip.value.trim();
    const country = shipperInputs.country.value.trim();
    const phone = shipperInputs.phone.value.trim();

    const payload = {
      type: 'shipper',
      template: {
        id,
        name: name.trim(),
        nameVal, company, address1, city, zip, country, phone
      }
    };

    try {
      const res = await fetch('/api/settings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetch('/api/settings/templates/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'shipper', id })
        });
        showToast('Successo', `Template mittente "${name}" creato.`, 'success');
        await loadTemplates();
      }
    } catch (err) {
      showToast('Errore', 'Impossibile creare il template.', 'error');
    }
  }

  const btnAddShipmentTemplate = document.getElementById('btn-add-shipment-template');
  if (btnAddShipmentTemplate) {
    btnAddShipmentTemplate.addEventListener('click', createShipmentTemplate);
  }
  const btnAddShipperTemplate = document.getElementById('btn-add-shipper-template');
  if (btnAddShipperTemplate) {
    btnAddShipperTemplate.addEventListener('click', createShipperTemplate);
  }

  // Delete active templates
  async function deleteActiveShipmentTemplate() {
    const active = shipmentTemplates.find(t => t.id === activeShipmentTemplateId);
    if (!active) return;
    if (shipmentTemplates.length <= 1) {
      showToast('Errore', 'Impossibile eliminare l\'ultimo template rimasto.', 'error');
      return;
    }
    const confirmed = await showCustomConfirm('Elimina Template Spedizione', `Sei sicuro di voler eliminare il template di spedizione "${active.name}"? Questa azione è irreversibile.`, 'trash-2', true);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/settings/templates?type=shipment&id=${active.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Successo', `Template "${active.name}" eliminato.`, 'success');
        await loadTemplates();
      } else {
        const data = await res.json();
        showToast('Errore', data.error || 'Impossibile eliminare il template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Errore di connessione.', 'error');
    }
  }

  async function deleteActiveShipperTemplate() {
    const active = shipperTemplates.find(t => t.id === activeShipperTemplateId);
    if (!active) return;
    if (shipperTemplates.length <= 1) {
      showToast('Errore', 'Impossibile eliminare l\'ultimo template rimasto.', 'error');
      return;
    }
    const confirmed = await showCustomConfirm('Elimina Template Mittente', `Sei sicuro di voler eliminare il template mittente "${active.name}"? Questa azione è irreversibile.`, 'trash-2', true);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/settings/templates?type=shipper&id=${active.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Successo', `Template "${active.name}" eliminato.`, 'success');
        await loadTemplates();
      } else {
        const data = await res.json();
        showToast('Errore', data.error || 'Impossibile eliminare il template.', 'error');
      }
    } catch (err) {
      showToast('Errore', 'Errore di connessione.', 'error');
    }
  }

  const btnDeleteShipmentTemplate = document.getElementById('btn-delete-shipment-template');
  if (btnDeleteShipmentTemplate) {
    btnDeleteShipmentTemplate.addEventListener('click', deleteActiveShipmentTemplate);
  }
  const btnDeleteShipperTemplate = document.getElementById('btn-delete-shipper-template');
  if (btnDeleteShipperTemplate) {
    btnDeleteShipperTemplate.addEventListener('click', deleteActiveShipperTemplate);
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
      updateConnectionStatus(true);
      renderOrdersTable();
    } catch (error) {
      console.error(error);
      updateConnectionStatus(false);
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

      let productsHtml = '';
      if (order.products && order.products.length > 0) {
        productsHtml = `
          <div class="products-cell-list">
            ${order.products.map(p => `
              <div class="product-inline-item" title="${escapeHTML(p.name)}">
                <span class="product-qty">${p.qty}x</span>
                <span class="product-name">${escapeHTML(p.name)}</span>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        productsHtml = '<span class="text-muted">—</span>';
      }

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
          <td><div class="truncate-cell" style="max-width: 140px;" title="${escapeHTML(order.customer_name)}">${customerHtml}</div></td>
          <td><div class="truncate-cell" style="max-width: 180px;" title="${escapeHTML(order.delivery_address)}">${addressHtml}</div></td>
          <td><div class="truncate-cell" style="max-width: 110px;" title="${escapeHTML(order.delivery_city)}">${cityHtml}</div></td>
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

  function deselectAllOrders() {
    selectedOrders.clear();
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    if (masterCheckbox) {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = false;
    }
    updateActionFooter();
  }

  function updateMasterCheckboxState() {
    const checkboxes = ordersTableBody.querySelectorAll('.order-checkbox');
    if (checkboxes.length === 0) {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = false;
      return;
    }
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (checkedCount === 0) {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
      masterCheckbox.checked = true;
      masterCheckbox.indeterminate = false;
    } else {
      masterCheckbox.checked = false;
      masterCheckbox.indeterminate = true;
    }
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

  // Setup dei listener per il modal di esportazione
  function setupExportModal() {
    const modal = document.getElementById('export-confirm-modal');
    if (!modal) return;

    const btnCancel = document.getElementById('btn-export-cancel');
    const btnConfirm = document.getElementById('btn-export-confirm');
    const shipperSelect = document.getElementById('export-shipper-select');
    const shipmentSelect = document.getElementById('export-shipment-select');

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        const selectedShipperId = shipperSelect.value;
        const selectedShipmentId = shipmentSelect.value;

        const selectedShipper = shipperTemplates.find(t => t.id === selectedShipperId);
        const selectedShipment = shipmentTemplates.find(t => t.id === selectedShipmentId);

        if (!selectedShipper || !selectedShipment) {
          showToast('Errore', 'Seleziona dei template validi.', 'error');
          return;
        }

        modal.classList.add('hidden');

        // Mappa i campi mittente nel formato richiesto dal payload
        const shipper = {
          name: selectedShipper.nameVal || '',
          company: selectedShipper.company || '',
          address1: selectedShipper.address1 || '',
          city: selectedShipper.city || '',
          zip: selectedShipper.zip || '',
          country: selectedShipper.country || '',
          phone: selectedShipper.phone || '',
        };

        const defaults = {
          weight: selectedShipment.weight,
          length: selectedShipment.length,
          width: selectedShipment.width,
          height: selectedShipment.height,
          service: selectedShipment.service,
          packageType: selectedShipment.packageType
        };

        await executeExport(defaults, shipper);
      });
    }

    if (shipperSelect) {
      shipperSelect.addEventListener('change', updateExportShipperDetails);
    }

    if (shipmentSelect) {
      shipmentSelect.addEventListener('change', updateExportShipmentDetails);
    }
  }

  // Apre il pop-up e pre-popola i dati
  function openExportConfirmModal() {
    const modal = document.getElementById('export-confirm-modal');
    if (!modal) return;

    const shipperSelect = document.getElementById('export-shipper-select');
    const shipmentSelect = document.getElementById('export-shipment-select');

    if (shipperSelect) {
      populateTemplateSelect(shipperSelect, shipperTemplates, activeShipperTemplateId);
      updateExportShipperDetails();
    }

    if (shipmentSelect) {
      populateTemplateSelect(shipmentSelect, shipmentTemplates, activeShipmentTemplateId);
      updateExportShipmentDetails();
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
  }

  // Aggiorna dinamicamente i dettagli del mittente selezionato nel pop-up
  function updateExportShipperDetails() {
    const selectEl = document.getElementById('export-shipper-select');
    const detailsEl = document.getElementById('export-shipper-details');
    if (!selectEl || !detailsEl) return;
    const selectedId = selectEl.value;
    const t = shipperTemplates.find(x => x.id === selectedId);
    if (t) {
      detailsEl.innerHTML = `
        <strong>${escapeHTML(t.nameVal || t.company || '')}</strong><br>
        ${escapeHTML(t.address1 || '')}<br>
        ${escapeHTML(t.zip || '')} ${escapeHTML(t.city || '')} (${escapeHTML(t.state || '')}) - ${escapeHTML(t.country || '')}<br>
        Tel: ${escapeHTML(t.phone || '')}
      `;
    } else {
      detailsEl.innerHTML = 'Nessun dettaglio mittente disponibile.';
    }
  }

  // Aggiorna dinamicamente i dettagli della spedizione selezionata nel pop-up
  function updateExportShipmentDetails() {
    const selectEl = document.getElementById('export-shipment-select');
    const detailsEl = document.getElementById('export-shipment-details');
    if (!selectEl || !detailsEl) return;
    const selectedId = selectEl.value;
    const t = shipmentTemplates.find(x => x.id === selectedId);
    if (t) {
      detailsEl.innerHTML = `
        <strong>Servizio:</strong> ${escapeHTML(serviceFriendlyNames[t.service] || t.service || '')}<br>
        <strong>Imballo:</strong> ${escapeHTML(t.packageType || '')}<br>
        <strong>Peso:</strong> ${t.weight} kg | 
        <strong>Misure:</strong> ${t.length}x${t.width}x${t.height} cm
      `;
    } else {
      detailsEl.innerHTML = 'Nessun dettaglio spedizione disponibile.';
    }
  }

  // Esegue la chiamata all'API di esportazione
  async function executeExport(defaults, shipper) {
    const exportCount = selectedOrders.size;
    exportBtn.disabled = true;
    const originalContent = exportBtn.innerHTML;
    exportBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px;"></span> Generazione file...`;

    try {
      const requestBody = {
        orderIds: Array.from(selectedOrders.keys()),
        defaults,
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

  // Esportazione Ordini in Excel per FedEx (Wrapper condizionale)
  async function handleExport() {
    if (selectedOrders.size === 0) return;

    // Se l'opzione di conferma è attiva, mostra il pop-up
    const confirmTemplatesCheckbox = document.getElementById('confirm-templates-checkbox');
    if (confirmTemplatesCheckbox && confirmTemplatesCheckbox.checked) {
      openExportConfirmModal();
      return;
    }

    // Altrimenti procedi con l'esportazione standard
    const weight = parseFloat(document.getElementById('default-weight').value) || 70.0;
    const length = parseFloat(document.getElementById('default-length').value) || 80.0;
    const width = parseFloat(document.getElementById('default-width').value) || 60.0;
    const height = parseFloat(document.getElementById('default-height').value) || 100.0;
    const service = document.getElementById('default-service').value;
    const packageType = document.getElementById('default-package').value;
    const shipper = getShipperData();

    await executeExport(
      { weight, length, width, height, service, packageType },
      shipper
    );
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
  const menuShipmentSettings = document.getElementById('menu-shipment-settings');
  const menuHistory = document.getElementById('menu-history');
  const menuSettings = document.getElementById('menu-settings');
  
  const sectionOrders = document.getElementById('section-orders');
  const sectionImportTracking = document.getElementById('section-import-tracking');
  const sectionShipmentSettings = document.getElementById('section-shipment-settings');
  const sectionHistory = document.getElementById('section-history');
  const sectionSettings = document.getElementById('section-settings');
  
  const mainHeaderTitle = document.querySelector('.header-title h1');
  const mainHeaderSubtitle = document.querySelector('.header-title p');

  function deactivateAllTabs() {
    menuOrders.classList.remove('active');
    menuImportTracking.classList.remove('active');
    if (menuShipmentSettings) menuShipmentSettings.classList.remove('active');
    if (menuHistory) menuHistory.classList.remove('active');
    if (menuSettings) menuSettings.classList.remove('active');
    
    sectionOrders.classList.add('hidden');
    sectionImportTracking.classList.add('hidden');
    if (sectionShipmentSettings) sectionShipmentSettings.classList.add('hidden');
    if (sectionHistory) sectionHistory.classList.add('hidden');
    if (sectionSettings) sectionSettings.classList.add('hidden');
    
    if (actionFooter) {
      actionFooter.classList.add('hidden');
    }
  }

  menuOrders.addEventListener('click', () => {
    deactivateAllTabs();
    menuOrders.classList.add('active');
    sectionOrders.classList.remove('hidden');
    mainHeaderTitle.textContent = 'Gestione Spedizioni PrestaShop';
    mainHeaderSubtitle.textContent = 'Seleziona gli ordini da dagimarket.com e compila l\'Excel per la spedizione batch FedEx';
    updateActionFooter();
    history.replaceState(null, null, ' ');
  });

  menuImportTracking.addEventListener('click', () => {
    deactivateAllTabs();
    menuImportTracking.classList.add('active');
    sectionImportTracking.classList.remove('hidden');
    mainHeaderTitle.textContent = 'Importa Tracking su PrestaShop';
    mainHeaderSubtitle.textContent = 'Carica il file con i tracking di ritorno generati da FedEx per associarli in PrestaShop';
    history.replaceState(null, null, '#import-tracking');
    
    // Default to Excel file upload tab when navigation menu is clicked
    if (tabImportFile) tabImportFile.click();
  });

  const tabImportFile = document.getElementById('tab-import-file');
  const tabImportDirect = document.getElementById('tab-import-direct');
  const panelImportFile = document.getElementById('panel-import-file');
  const panelImportDirect = document.getElementById('panel-import-direct');

  if (tabImportFile && tabImportDirect) {
    tabImportFile.addEventListener('click', () => {
      tabImportFile.classList.add('active');
      tabImportDirect.classList.remove('active');
      panelImportFile.classList.remove('hidden');
      panelImportDirect.classList.add('hidden');
      importStep3.classList.add('hidden');
    });

    tabImportDirect.addEventListener('click', () => {
      tabImportDirect.classList.add('active');
      tabImportFile.classList.remove('active');
      panelImportDirect.classList.remove('hidden');
      panelImportFile.classList.add('hidden');
      importStep3.classList.add('hidden');
      
      // Clear previous direct sync states
      if (directPendingContainer) directPendingContainer.classList.add('hidden');
      if (directEmptyState) directEmptyState.classList.add('hidden');
    });
  }

  if (menuShipmentSettings) {
    menuShipmentSettings.addEventListener('click', () => {
      deactivateAllTabs();
      menuShipmentSettings.classList.add('active');
      sectionShipmentSettings.classList.remove('hidden');
      mainHeaderTitle.textContent = 'Configurazione Spedizione';
      mainHeaderSubtitle.textContent = 'Imposta i valori predefiniti e i dettagli del mittente per le spedizioni FedEx';
      history.replaceState(null, null, '#shipment-settings');
    });
  }

  if (menuHistory && sectionHistory) {
    menuHistory.addEventListener('click', () => {
      deactivateAllTabs();
      menuHistory.classList.add('active');
      sectionHistory.classList.remove('hidden');
      mainHeaderTitle.textContent = 'Storico Operazioni';
      mainHeaderSubtitle.textContent = 'Visualizza il registro delle esportazioni ed importazioni effettuate';
      loadHistory();
      history.replaceState(null, null, '#history');
    });
  }

  if (menuSettings && sectionSettings) {
    menuSettings.addEventListener('click', () => {
      deactivateAllTabs();
      menuSettings.classList.add('active');
      sectionSettings.classList.remove('hidden');
      mainHeaderTitle.textContent = 'Impostazioni API';
      mainHeaderSubtitle.textContent = 'Gestisci le connessioni API, gli stati dell\'ordine e le opzioni di backup dell\'applicazione';
      
      // Update hash to settings default tab (api) if not starting with #settings
      const hash = window.location.hash;
      if (!hash.startsWith('#settings')) {
        history.replaceState(null, null, '#settings-api');
      }
    });
  }

  // Setup config button listener
  const btnSetupConfig = document.getElementById('btn-setup-config');
  if (btnSetupConfig) {
    btnSetupConfig.addEventListener('click', () => {
      const overlay = document.getElementById('setup-overlay');
      if (overlay) overlay.classList.add('hidden');
      if (menuSettings) menuSettings.click();
    });
  }

  // URL hash routing
  function initRoutingFromHash() {
    const hash = window.location.hash;
    if (hash === '#settings' || hash.startsWith('#settings')) {
      if (menuSettings) menuSettings.click();
      
      // Also switch active settings tab if the hash specifies one (e.g. #settings-states)
      if (hash.startsWith('#settings-')) {
        const subHash = hash.replace('#settings-', '');
        const validTabs = ['api', 'states', 'backup'];
        if (validTabs.includes(subHash) && typeof window.switchTab === 'function') {
          window.switchTab(subHash);
        }
      }
    } else if (hash === '#history') {
      if (menuHistory) menuHistory.click();
    } else if (hash === '#shipment-settings') {
      if (menuShipmentSettings) menuShipmentSettings.click();
    } else if (hash === '#import-tracking') {
      if (menuImportTracking) menuImportTracking.click();
    }
  }

  setTimeout(initRoutingFromHash, 100);


  // Gestione File Upload (Drag & Drop)
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  let currentFileData = null;
  let currentFileName = '';

  if (dropZone) {
    dropZone.addEventListener('click', (e) => {
      if (e.target.id === 'file-input') return;
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
    const { headers, preview, autoMapped, totalRows } = data;
    
    const importDetectedRows = document.getElementById('import-detected-rows');
    if (importDetectedRows) {
      importDetectedRows.textContent = totalRows !== undefined ? totalRows : 0;
    }
    
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

      if (activePollingInterval) {
        showToast('Attenzione', 'Un\'importazione è già in corso. Attendi il completamento.', 'warning');
        return;
      }

      btnStartImport.disabled = true;
      const originalContent = btnStartImport.innerHTML;
      btnStartImport.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Importazione avviata...';

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

        const initialJob = await response.json();
        const importId = initialJob.importId;
        const total = initialJob.total;

        // Inizializza progress bar
        const progressContainer = document.getElementById('import-progress-container');
        const progressBar = document.getElementById('import-progress-bar');
        const progressPercent = document.getElementById('import-progress-percent');
        const progressStatus = document.getElementById('import-progress-status');
        
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressStatus) progressStatus.textContent = `Avvio importazione (${total} elementi)...`;

        // Start polling the status endpoint
        pollImportStatus(importId, total, originalContent);
        
      } catch (error) {
        console.error(error);
        showToast('Importazione Fallita', error.message, 'error');
        btnStartImport.disabled = false;
        btnStartImport.innerHTML = originalContent;
        const progressContainer = document.getElementById('import-progress-container');
        if (progressContainer) progressContainer.classList.add('hidden');
      }
    });
  }

  function pollImportStatus(importId, total, originalContent, triggerButton = btnStartImport, isDirectSync = false, isFetchOnlyDirect = false) {
    activePollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tracking/import-status?id=${importId}`);
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Errore nella verifica dello stato.');
        }

        const job = await response.json();

        // Target progress elements dynamically
        const prefix = isDirectSync ? (isFetchOnlyDirect ? 'direct' : 'direct-import') : 'import';
        const progressBar = document.getElementById(`${prefix}-progress-bar`);
        const progressPercent = document.getElementById(`${prefix}-progress-percent`);
        const progressStatus = document.getElementById(`${prefix}-progress-status`);
        const progressContainer = document.getElementById(`${prefix}-progress-container`);

        if (job.status === 'processing') {
          triggerButton.innerHTML = `<span class="spinner" style="width:14px;height:14px;"></span> ${isDirectSync ? (isFetchOnlyDirect ? 'Ricerca' : 'Importazione') : 'Importazione'} in corso (${job.processed}/${job.total})...`;
          
          const percent = Math.min(100, Math.round((job.processed / job.total) * 100));
          
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (progressPercent) progressPercent.textContent = `${percent}%`;
          if (progressStatus) progressStatus.textContent = `${isDirectSync ? (isFetchOnlyDirect ? 'Verifica' : 'Importazione') : 'Associazione'} in corso: ${job.processed} di ${job.total} elaborati`;
        } else if (job.status === 'completed') {
          if (progressBar) progressBar.style.width = '100%';
          if (progressPercent) progressPercent.textContent = '100%';
          setTimeout(() => {
            if (progressContainer) progressContainer.classList.add('hidden');
          }, 800);

          clearInterval(activePollingInterval);
          activePollingInterval = null;
          triggerButton.disabled = false;
          triggerButton.innerHTML = originalContent;
          
          if (isFetchOnlyDirect) {
            // Render the intermediate results table (Step 2)
            renderDirectResultsStep(job.details);
          } else {
            // If it's a real import, hide Step 2 as well when moving to Step 3
            if (isDirectSync) {
              const directStep2 = document.getElementById('direct-step-2');
              if (directStep2) directStep2.classList.add('hidden');
            }
            // Render final results in step 3
            renderResultsStep({
              summary: {
                totalProcessed: job.total,
                successCount: job.successCount,
                warningCount: job.warningCount,
                errorCount: job.errorCount
              },
              details: job.details
            });
          }
        } else if (job.status === 'failed') {
          if (progressContainer) progressContainer.classList.add('hidden');

          clearInterval(activePollingInterval);
          activePollingInterval = null;
          triggerButton.disabled = false;
          triggerButton.innerHTML = originalContent;
          showToast(`${isDirectSync ? (isFetchOnlyDirect ? 'Ricerca' : 'Importazione') : 'Importazione'} Fallita`, job.error || 'Errore riscontrato.', 'error');
        }
      } catch (error) {
        console.error('Errore nel polling:', error);
      }
    }, 1000);
  }

  // Direct Sync DOM Elements
  const btnFindPendingSync = document.getElementById('btn-find-pending-sync');
  const btnStartDirectSync = document.getElementById('btn-start-direct-sync');
  const directPendingContainer = document.getElementById('direct-pending-container');
  const directPendingTableBody = document.getElementById('direct-pending-table-body');
  const directPendingCountText = document.getElementById('direct-pending-count-text');
  const directMasterCheckbox = document.getElementById('direct-master-checkbox');
  const directEmptyState = document.getElementById('direct-empty-state');
  const directProgressContainer = document.getElementById('direct-progress-container');

  let pendingSyncOrders = [];

  const directIncludeSynced = document.getElementById('direct-include-synced');

  if (btnFindPendingSync) {
    btnFindPendingSync.addEventListener('click', async () => {
      btnFindPendingSync.disabled = true;
      const originalContent = btnFindPendingSync.innerHTML;
      btnFindPendingSync.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Ricerca...';
      
      const includeSynced = directIncludeSynced ? directIncludeSynced.checked : false;
      
      try {
        const response = await fetch(`/api/tracking/pending-sync?includeSynced=${includeSynced}`);
        if (!response.ok) {
          throw new Error('Impossibile recuperare gli ordini in attesa di sincronizzazione.');
        }
        
        pendingSyncOrders = await response.json();
        
        if (pendingSyncOrders.length === 0) {
          directPendingContainer.classList.add('hidden');
          directEmptyState.classList.remove('hidden');
        } else {
          directEmptyState.classList.add('hidden');
          directPendingContainer.classList.remove('hidden');
          
          directPendingCountText.textContent = `Trovati ${pendingSyncOrders.length} ordini pronti per la sincronizzazione`;
          
          // Populate table
          directPendingTableBody.innerHTML = '';
          pendingSyncOrders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><input type="checkbox" value="${order.id}" checked></td>
              <td>${order.id}</td>
              <td><code class="font-mono">${escapeHTML(order.reference)}</code></td>
              <td>${order.date_add}</td>
              <td>${escapeHTML(order.customer_name)}</td>
              <td>${escapeHTML(order.delivery_city)}</td>
            `;
            
            // Checkbox change listener
            const checkbox = tr.querySelector('input');
            checkbox.addEventListener('change', () => {
              updateDirectMasterCheckboxState();
            });

            directPendingTableBody.appendChild(tr);
          });
          
          updateDirectMasterCheckboxState();
        }
      } catch (err) {
        console.error(err);
        showToast('Errore ricerca', err.message, 'error');
      } finally {
        btnFindPendingSync.disabled = false;
        btnFindPendingSync.innerHTML = originalContent;
        lucide.createIcons();
      }
    });
  }

  if (directMasterCheckbox) {
    directMasterCheckbox.addEventListener('change', () => {
      const checked = directMasterCheckbox.checked;
      const checkboxes = directPendingTableBody.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = checked;
      });
    });
  }

  function updateDirectMasterCheckboxState() {
    if (!directMasterCheckbox) return;
    const checkboxes = directPendingTableBody.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length === 0) {
      directMasterCheckbox.checked = false;
      return;
    }
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    directMasterCheckbox.checked = allChecked;
  }

  if (btnStartDirectSync) {
    btnStartDirectSync.addEventListener('click', async () => {
      const checkboxes = directPendingTableBody.querySelectorAll('input[type="checkbox"]:checked');
      const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
      
      if (selectedIds.length === 0) {
        showToast('Nessun ordine selezionato', 'Seleziona almeno un ordine da verificare.', 'warning');
        return;
      }

      const ordersToSync = pendingSyncOrders
        .filter(o => selectedIds.includes(o.id))
        .map(o => ({ id: o.id, reference: o.reference }));

      if (activePollingInterval) {
        showToast('Attenzione', 'Un processo è già in corso.', 'warning');
        return;
      }

      btnStartDirectSync.disabled = true;
      const originalContent = btnStartDirectSync.innerHTML;
      btnStartDirectSync.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Inizializzazione...';

      try {
        const response = await fetch('/api/tracking/sync-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders: ordersToSync, fetchOnly: true })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Impossibile avviare la ricerca.');
        }

        const job = await response.json();
        
        // Show progress bar
        if (directProgressContainer) directProgressContainer.classList.remove('hidden');
        document.getElementById('direct-progress-bar').style.width = '0%';
        document.getElementById('direct-progress-percent').textContent = '0%';
        document.getElementById('direct-progress-status').textContent = `Verifica disponibilità tracking su FedEx per ${job.total} ordini...`;

        // Start polling (Phase 1 lookup: isFetchOnlyDirect = true)
        pollImportStatus(job.importId, job.total, originalContent, btnStartDirectSync, true, true);

      } catch (err) {
        console.error(err);
        showToast('Errore ricerca', err.message, 'error');
        btnStartDirectSync.disabled = false;
        btnStartDirectSync.innerHTML = originalContent;
        if (directProgressContainer) directProgressContainer.classList.add('hidden');
      }
    });
  }

  // Step 2 Direct Sync Result Logic
  const directStep1 = document.getElementById('direct-step-1');
  const directStep2 = document.getElementById('direct-step-2');
  const directResultsTableBody = document.getElementById('direct-results-table-body');
  const directResultsMasterCheckbox = document.getElementById('direct-results-master-checkbox');
  const btnCancelDirectResults = document.getElementById('btn-cancel-direct-results');
  const btnApplyDirectImport = document.getElementById('btn-apply-direct-import');
  const directImportProgressContainer = document.getElementById('direct-import-progress-container');

  function renderDirectResultsStep(details) {
    directStep1.classList.add('hidden');
    directStep2.classList.remove('hidden');

    directResultsTableBody.innerHTML = '';

    const successList = details.success || [];
    const warningList = details.warnings || [];
    const errorList = details.errors || [];

    const allItems = [];

    successList.forEach(item => {
      const origOrder = pendingSyncOrders.find(o => o.id === item.orderId) || {};
      allItems.push({
        orderId: item.orderId,
        reference: item.reference,
        customerName: origOrder.customer_name || 'Cliente',
        deliveryCity: origOrder.delivery_city || '—',
        trackingNumber: item.trackingNumber,
        status: 'found',
        statusText: `<span class="log-tag success">Trovato</span>`,
        message: item.message
      });
    });

    warningList.forEach(item => {
      const origOrder = pendingSyncOrders.find(o => o.reference === item.reference) || {};
      allItems.push({
        orderId: origOrder.id || '—',
        reference: item.reference,
        customerName: origOrder.customer_name || 'Cliente',
        deliveryCity: origOrder.delivery_city || '—',
        trackingNumber: '',
        status: 'not_found',
        statusText: `<span class="log-tag warning">Non spedito</span>`,
        message: item.message
      });
    });

    errorList.forEach(item => {
      const origOrder = pendingSyncOrders.find(o => o.reference === item.reference) || {};
      allItems.push({
        orderId: origOrder.id || '—',
        reference: item.reference,
        customerName: origOrder.customer_name || 'Cliente',
        deliveryCity: origOrder.delivery_city || '—',
        trackingNumber: '',
        status: 'error',
        statusText: `<span class="log-tag error">Errore API</span>`,
        message: item.message
      });
    });

    allItems.sort((a, b) => b.orderId - a.orderId);

    allItems.forEach(item => {
      const tr = document.createElement('tr');
      const hasTracking = item.status === 'found' && item.trackingNumber;
      const checkboxHTML = hasTracking 
        ? `<input type="checkbox" class="direct-result-row-cb" data-order-id="${item.orderId}" data-reference="${item.reference}" data-tracking="${item.trackingNumber}" checked>`
        : `<input type="checkbox" disabled style="opacity: 0.4;">`;

      tr.innerHTML = `
        <td>${checkboxHTML}</td>
        <td>${item.orderId}</td>
        <td><code class="font-mono">${escapeHTML(item.reference)}</code></td>
        <td>${escapeHTML(item.customerName)}</td>
        <td>${escapeHTML(item.deliveryCity)}</td>
        <td>${hasTracking ? `<code class="font-mono font-semibold" style="color:var(--color-accent);">${item.trackingNumber}</code>` : `<span style="color:var(--text-muted);">Nessuno</span>`}</td>
        <td>${item.statusText}</td>
      `;
      directResultsTableBody.appendChild(tr);
    });

    updateDirectResultsMasterCheckboxState();
    lucide.createIcons();
  }

  if (directResultsMasterCheckbox) {
    directResultsMasterCheckbox.addEventListener('change', () => {
      const checked = directResultsMasterCheckbox.checked;
      const checkboxes = directResultsTableBody.querySelectorAll('.direct-result-row-cb:not([disabled])');
      checkboxes.forEach(cb => {
        cb.checked = checked;
      });
    });
  }

  function updateDirectResultsMasterCheckboxState() {
    if (!directResultsMasterCheckbox) return;
    const checkboxes = directResultsTableBody.querySelectorAll('.direct-result-row-cb:not([disabled])');
    if (checkboxes.length === 0) {
      directResultsMasterCheckbox.checked = false;
      directResultsMasterCheckbox.disabled = true;
      return;
    }
    directResultsMasterCheckbox.disabled = false;
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    directResultsMasterCheckbox.checked = allChecked;
  }

  if (directResultsTableBody) {
    directResultsTableBody.addEventListener('change', (e) => {
      if (e.target.classList.contains('direct-result-row-cb')) {
        updateDirectResultsMasterCheckboxState();
      }
    });
  }

  if (btnCancelDirectResults) {
    btnCancelDirectResults.addEventListener('click', () => {
      directStep2.classList.add('hidden');
      directStep1.classList.remove('hidden');
      if (directImportProgressContainer) directImportProgressContainer.classList.add('hidden');
    });
  }

  if (btnApplyDirectImport) {
    btnApplyDirectImport.addEventListener('click', async () => {
      const checkedCbs = directResultsTableBody.querySelectorAll('.direct-result-row-cb:checked');
      const ordersToImport = Array.from(checkedCbs).map(cb => ({
        id: parseInt(cb.getAttribute('data-order-id'), 10),
        reference: cb.getAttribute('data-reference'),
        trackingNumber: cb.getAttribute('data-tracking')
      }));

      if (ordersToImport.length === 0) {
        showToast('Nessun ordine selezionato', 'Seleziona almeno un ordine con tracking trovato da importare.', 'warning');
        return;
      }

      if (activePollingInterval) {
        showToast('Attenzione', 'Un processo è già in corso.', 'warning');
        return;
      }

      btnApplyDirectImport.disabled = true;
      const originalContent = btnApplyDirectImport.innerHTML;
      btnApplyDirectImport.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Inizializzazione...';

      try {
        const response = await fetch('/api/tracking/import-direct-to-prestashop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders: ordersToImport })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Impossibile avviare l\'importazione.');
        }

        const job = await response.json();

        // Show progress bar
        if (directImportProgressContainer) directImportProgressContainer.classList.remove('hidden');
        document.getElementById('direct-import-progress-bar').style.width = '0%';
        document.getElementById('direct-import-progress-percent').textContent = '0%';
        document.getElementById('direct-import-progress-status').textContent = `Associazione tracking in PrestaShop per ${job.total} ordini...`;

        // Start polling (Phase 2 Import: isFetchOnlyDirect = false)
        pollImportStatus(job.importId, job.total, originalContent, btnApplyDirectImport, true, false);

      } catch (err) {
        console.error(err);
        showToast('Errore importazione', err.message, 'error');
        btnApplyDirectImport.disabled = false;
        btnApplyDirectImport.innerHTML = originalContent;
        if (directImportProgressContainer) directImportProgressContainer.classList.add('hidden');
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

  // Helper to dynamically set Lucide icon in container and re-initialize
  function setLucideIcon(containerId, iconName, styleStr = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<i data-lucide="${iconName}" style="${styleStr}"></i>`;
    lucide.createIcons();
  }

  // Graphical modal prompt with validation and dynamic icons
  function showCustomPrompt(title, message, defaultValue = '', iconName = 'edit') {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-prompt-modal');
      const titleEl = document.getElementById('custom-prompt-title');
      const messageEl = document.getElementById('custom-prompt-message');
      const inputEl = document.getElementById('custom-prompt-input');
      const errorEl = document.getElementById('custom-prompt-error');
      const btnCancel = document.getElementById('custom-prompt-cancel');
      const btnConfirm = document.getElementById('custom-prompt-confirm');

      if (!modal || !titleEl || !messageEl || !inputEl || !btnCancel || !btnConfirm) {
        resolve(prompt(message, defaultValue));
        return;
      }

      titleEl.textContent = title;
      messageEl.textContent = message;
      inputEl.value = defaultValue;
      if (errorEl) errorEl.style.display = 'none';

      // Set dynamic icon based on template type
      let iconColor = 'var(--fedex-purple-light)';
      if (iconName === 'user') iconColor = 'var(--fedex-orange)';
      setLucideIcon('custom-prompt-icon-container', iconName, `color: ${iconColor}; width: 20px; height: 20px;`);

      modal.classList.remove('hidden');
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);

      const cleanup = () => {
        modal.classList.add('hidden');
        btnCancel.removeEventListener('click', onCancel);
        btnConfirm.removeEventListener('click', onConfirm);
        inputEl.removeEventListener('keydown', onKeyDown);
      };

      function onCancel() {
        cleanup();
        resolve(null);
      }

      function onConfirm() {
        const val = inputEl.value.trim();
        if (!val) {
          if (errorEl) {
            errorEl.style.display = 'block';
          }
          inputEl.focus();
          return;
        }
        cleanup();
        resolve(val);
      }

      function onKeyDown(e) {
        if (e.key === 'Enter') {
          onConfirm();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }

      btnCancel.addEventListener('click', onCancel);
      btnConfirm.addEventListener('click', onConfirm);
      inputEl.addEventListener('keydown', onKeyDown);
    });
  }

  // Graphical modal confirm with danger/alert style support
  function showCustomConfirm(title, message, iconName = 'alert-triangle', isDanger = false) {
    return new Promise((resolve) => {
      const modal = document.getElementById('custom-confirm-modal');
      const titleEl = document.getElementById('custom-confirm-title');
      const messageEl = document.getElementById('custom-confirm-message');
      const iconContainer = document.getElementById('custom-confirm-icon-container');
      const btnCancel = document.getElementById('custom-confirm-cancel');
      const btnConfirm = document.getElementById('custom-confirm-confirm');

      if (!modal || !titleEl || !messageEl || !btnCancel || !btnConfirm) {
        resolve(confirm(message));
        return;
      }

      titleEl.textContent = title;
      messageEl.textContent = message;

      // Set dynamic icon and danger background
      if (iconContainer) {
        if (isDanger) {
          iconContainer.style.background = 'rgba(239, 68, 68, 0.1)';
          setLucideIcon('custom-confirm-icon-container', iconName, 'color: var(--color-error); width: 20px; height: 20px;');
        } else {
          iconContainer.style.background = 'rgba(108, 35, 194, 0.1)';
          setLucideIcon('custom-confirm-icon-container', iconName, 'color: var(--fedex-purple-light); width: 20px; height: 20px;');
        }
      }

      // Stylize confirm button (red for danger, standard for normal)
      if (btnConfirm) {
        if (isDanger) {
          btnConfirm.style.background = 'var(--color-error)';
          btnConfirm.style.borderColor = 'var(--color-error)';
          btnConfirm.style.color = '#fff';
        } else {
          btnConfirm.removeAttribute('style');
          btnConfirm.style.flex = '1';
          btnConfirm.style.justifyContent = 'center';
          btnConfirm.style.height = '40px';
          btnConfirm.style.margin = '0';
        }
      }

      modal.classList.remove('hidden');
      btnConfirm.focus();

      const cleanup = () => {
        modal.classList.add('hidden');
        btnCancel.removeEventListener('click', onCancel);
        btnConfirm.removeEventListener('click', onConfirm);
        window.removeEventListener('keydown', onKeyDown);
      };

      function onCancel() {
        cleanup();
        resolve(false);
      }

      function onConfirm() {
        cleanup();
        resolve(true);
      }

      function onKeyDown(e) {
        if (e.key === 'Enter') {
          onConfirm();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }

      btnCancel.addEventListener('click', onCancel);
      btnConfirm.addEventListener('click', onConfirm);
      window.addEventListener('keydown', onKeyDown);
    });
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

