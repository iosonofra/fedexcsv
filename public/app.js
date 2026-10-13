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
      await loadPrestashopCarriers();
    } catch (e) {
      console.error('Errore nel caricamento dei corrieri PrestaShop:', e);
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
  const menuManifest = document.getElementById('menu-manifest');
  
  const sectionOrders = document.getElementById('section-orders');
  const sectionImportTracking = document.getElementById('section-import-tracking');
  const sectionManifest = document.getElementById('section-manifest');
  const sectionShipmentSettings = document.getElementById('section-shipment-settings');
  const sectionHistory = document.getElementById('section-history');
  const sectionSettings = document.getElementById('section-settings');
  
  const mainHeaderTitle = document.querySelector('.header-title h1');
  const mainHeaderSubtitle = document.querySelector('.header-title p');

  function deactivateAllTabs() {
    menuOrders.classList.remove('active');
    menuImportTracking.classList.remove('active');
    if (menuManifest) menuManifest.classList.remove('active');
    if (menuShipmentSettings) menuShipmentSettings.classList.remove('active');
    if (menuHistory) menuHistory.classList.remove('active');
    if (menuSettings) menuSettings.classList.remove('active');
    
    sectionOrders.classList.add('hidden');
    sectionImportTracking.classList.add('hidden');
    if (sectionManifest) sectionManifest.classList.add('hidden');
    if (sectionShipmentSettings) sectionShipmentSettings.classList.add('hidden');
    if (sectionHistory) sectionHistory.classList.add('hidden');
    if (sectionSettings) sectionSettings.classList.add('hidden');
    
    if (actionFooter) {
      actionFooter.classList.add('hidden');
    }
  }

  if (menuManifest && sectionManifest) {
    menuManifest.addEventListener('click', () => {
      deactivateAllTabs();
      menuManifest.classList.add('active');
      sectionManifest.classList.remove('hidden');
      mainHeaderTitle.textContent = 'Borderò di Spedizione';
      mainHeaderSubtitle.textContent = 'Genera, stampa e scarica la distinta di presa in carico dei colli affidati al corriere';
      history.replaceState(null, null, '#manifest');
      loadManifestHistory();
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    });
  }

  menuOrders.addEventListener('click', () => {
    deactivateAllTabs();
    menuOrders.classList.add('active');
    sectionOrders.classList.remove('hidden');
    mainHeaderTitle.textContent = 'Gestione Spedizioni PrestaShop';
    mainHeaderSubtitle.textContent = 'Seleziona gli ordini da dagimarket.com e compila l\'Excel per la spedizione batch FedEx';
    updateActionFooter();
    if (window.location.hash && window.location.hash !== '#' && window.location.hash !== '#orders') {
      history.replaceState(null, null, window.location.pathname + window.location.search);
    }
  });

  const brandEl = document.querySelector('.brand');
  if (brandEl) {
    brandEl.style.cursor = 'pointer';
    brandEl.addEventListener('click', () => {
      if (menuOrders) menuOrders.click();
    });
  }

  menuImportTracking.addEventListener('click', () => {
    deactivateAllTabs();
    menuImportTracking.classList.add('active');
    sectionImportTracking.classList.remove('hidden');
    mainHeaderTitle.textContent = 'Importa Tracking su PrestaShop';
    mainHeaderSubtitle.textContent = 'Carica il file con i tracking generati da FedEx o TNT per associarli in PrestaShop';
    history.replaceState(null, null, '#import-tracking');
    
    loadPrestashopCarriers();

    // Default to Excel file upload tab when navigation menu is clicked
    showFileImportTab();
  });

  const tabImportFile = document.getElementById('tab-import-file');
  const tabImportDirect = document.getElementById('tab-import-direct');
  const panelImportFile = document.getElementById('panel-import-file');
  const panelImportDirect = document.getElementById('panel-import-direct');
  const importStep1 = document.getElementById('import-step-1');
  const importStep2 = document.getElementById('import-step-2');
  const importStep3 = document.getElementById('import-step-3');
  const directStep1 = document.getElementById('direct-step-1');
  const directStep2 = document.getElementById('direct-step-2');
  const btnResetImport = document.getElementById('btn-reset-import');
  const btnResetDirect = document.getElementById('btn-reset-direct');

  function showFileImportTab(forceReset = false) {
    if (tabImportFile) tabImportFile.classList.add('active');
    if (tabImportDirect) tabImportDirect.classList.remove('active');
    if (panelImportFile) panelImportFile.classList.remove('hidden');
    if (panelImportDirect) panelImportDirect.classList.add('hidden');

    const isStep3Visible = importStep3 && !importStep3.classList.contains('hidden');
    const areBothStepsHidden = importStep1 && importStep2 && importStep1.classList.contains('hidden') && importStep2.classList.contains('hidden');

    if (importStep3) importStep3.classList.add('hidden');

    if (forceReset || isStep3Visible || areBothStepsHidden || (!currentFileData && !currentPdfRows)) {
      if (importStep1) importStep1.classList.remove('hidden');
      if (importStep2) importStep2.classList.add('hidden');
      const importProgressContainer = document.getElementById('import-progress-container');
      if (importProgressContainer) importProgressContainer.classList.add('hidden');
      if (typeof resetImportStep1 === 'function') {
        resetImportStep1();
      }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  function showDirectSyncTab(forceReset = false) {
    if (tabImportDirect) tabImportDirect.classList.add('active');
    if (tabImportFile) tabImportFile.classList.remove('active');
    if (panelImportDirect) panelImportDirect.classList.remove('hidden');
    if (panelImportFile) panelImportFile.classList.add('hidden');

    const isStep3Visible = importStep3 && !importStep3.classList.contains('hidden');
    const areBothDirectStepsHidden = directStep1 && directStep2 && directStep1.classList.contains('hidden') && directStep2.classList.contains('hidden');

    if (importStep3) importStep3.classList.add('hidden');

    if (forceReset || isStep3Visible || areBothDirectStepsHidden) {
      if (directStep1) directStep1.classList.remove('hidden');
      if (directStep2) directStep2.classList.add('hidden');
      const directPendingContainer = document.getElementById('direct-pending-container');
      const directEmptyState = document.getElementById('direct-empty-state');
      const directProgressContainer = document.getElementById('direct-progress-container');
      const directImportProgressContainer = document.getElementById('direct-import-progress-container');
      const directResultsTableBody = document.getElementById('direct-results-table-body');
      const btnFindPendingSync = document.getElementById('btn-find-pending-sync');

      if (directPendingContainer) directPendingContainer.classList.add('hidden');
      if (directEmptyState) directEmptyState.classList.add('hidden');
      if (directProgressContainer) directProgressContainer.classList.add('hidden');
      if (directImportProgressContainer) directImportProgressContainer.classList.add('hidden');
      if (directResultsTableBody) directResultsTableBody.innerHTML = '';
      if (btnFindPendingSync) {
        btnFindPendingSync.disabled = false;
        btnFindPendingSync.innerHTML = '<i data-lucide="search"></i> Cerca Spedizioni da Associare';
      }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  if (tabImportFile) {
    tabImportFile.addEventListener('click', () => {
      showFileImportTab();
    });
  }

  if (tabImportDirect) {
    tabImportDirect.addEventListener('click', () => {
      showDirectSyncTab();
    });
  }

  if (btnResetImport) {
    btnResetImport.addEventListener('click', () => {
      showFileImportTab(true);
    });
  }

  if (btnResetDirect) {
    btnResetDirect.addEventListener('click', () => {
      showDirectSyncTab(true);
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
        const validTabs = ['api', 'states', 'backup', 'templates'];
        if (validTabs.includes(subHash) && typeof window.switchTab === 'function') {
          window.switchTab(subHash, false);
        }
      }
    } else if (hash === '#manifest') {
      if (menuManifest) menuManifest.click();
    } else if (hash === '#history') {
      if (menuHistory) menuHistory.click();
    } else if (hash === '#shipment-settings') {
      if (menuShipmentSettings) menuShipmentSettings.click();
    } else if (hash === '#import-tracking') {
      if (menuImportTracking) menuImportTracking.click();
    } else {
      // Default / Homepage: Ordini PrestaShop
      if (menuOrders) menuOrders.click();
    }
  }



  // Gestione File Upload (Drag & Drop)
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  let currentFileData = null;
  let currentFileName = '';

  if (dropZone) {
    let trackingDragCounter = 0;

    dropZone.addEventListener('click', (e) => {
      if (e.target.id === 'file-input') return;
      const actualInput = document.getElementById('file-input');
      if (actualInput) actualInput.click();
    });

    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      trackingDragCounter++;
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      trackingDragCounter--;
      if (trackingDragCounter <= 0) {
        trackingDragCounter = 0;
        dropZone.classList.remove('dragover');
      }
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      trackingDragCounter = 0;
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

  // Stato Corrieri e Import
  let availableCarriers = [];
  let currentPdfRows = null;
  let currentIsPdf = false;

  // Cerca un corriere per parola chiave (es. "tnt" o "fedex")
  function findCarrierByKeyword(keyword) {
    if (!availableCarriers || availableCarriers.length === 0) return null;
    const kw = keyword.toLowerCase().trim();
    // 1. Cerca per nome esatto (es. "tnt" o "fedex")
    let match = availableCarriers.find(c => c.name.toLowerCase().trim() === kw);
    if (match) return match;
    // 2. Cerca per inclusione parola (es. "TNT Express" o "FedEx Priority")
    match = availableCarriers.find(c => c.name.toLowerCase().includes(kw));
    return match || null;
  }

  // Popola o aggiorna i menu a tendina dei corrieri tenendo conto del filtro non attivi
  function populateCarrierSelects() {
    const fileShowInactive = document.getElementById('file-show-inactive-carriers');
    const directShowInactive = document.getElementById('direct-show-inactive-carriers');
    const showInactive = localStorage.getItem('show_inactive_carriers') !== 'false'; // default true

    if (fileShowInactive) fileShowInactive.checked = showInactive;
    if (directShowInactive) directShowInactive.checked = showInactive;

    const fileCarrierSelect = document.getElementById('file-carrier-select');
    const directCarrierSelect = document.getElementById('direct-carrier-select');

    [fileCarrierSelect, directCarrierSelect].forEach(select => {
      if (!select) return;
      const prevVal = select.value;
      select.innerHTML = '<option value="">-- Seleziona Corriere PrestaShop --</option>';

      const filtered = showInactive ? availableCarriers : availableCarriers.filter(c => c.active);

      filtered.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        const inactiveTag = c.active === false ? ' (Non attivo)' : '';
        opt.textContent = `${c.name} (ID: ${c.id})${inactiveTag}`;
        select.appendChild(opt);
      });

      if (prevVal && select.querySelector(`option[value="${prevVal}"]`)) {
        select.value = prevVal;
      }
    });
  }

  async function loadPrestashopCarriers() {
    try {
      const response = await fetch('/api/tracking/carriers');
      if (!response.ok) return;
      availableCarriers = await response.json();
      populateCarrierSelects();
    } catch (e) {
      console.warn('Errore nel caricamento corrieri PrestaShop:', e);
    }
  }

  // Sincronizzazione controlli corrieri e preferenze
  const fileCarrierSelect = document.getElementById('file-carrier-select');
  const fileChangeCarrier = document.getElementById('file-change-carrier');
  const fileOverwriteTracking = document.getElementById('file-overwrite-tracking');
  const fileShowInactive = document.getElementById('file-show-inactive-carriers');
  const fileRememberCarrier = document.getElementById('file-remember-carrier');

  const directCarrierSelect = document.getElementById('direct-carrier-select');
  const directChangeCarrier = document.getElementById('direct-change-carrier');
  const directOverwriteTracking = document.getElementById('direct-overwrite-tracking');
  const directShowInactive = document.getElementById('direct-show-inactive-carriers');
  const directRememberCarrier = document.getElementById('direct-remember-carrier');

  // Gestione opzione "Mostra anche corrieri non attivi"
  function handleToggleShowInactive(checked) {
    localStorage.setItem('show_inactive_carriers', checked ? 'true' : 'false');
    if (fileShowInactive) fileShowInactive.checked = checked;
    if (directShowInactive) directShowInactive.checked = checked;
    populateCarrierSelects();
  }

  if (fileShowInactive) {
    fileShowInactive.addEventListener('change', (e) => handleToggleShowInactive(e.target.checked));
  }
  if (directShowInactive) {
    directShowInactive.addEventListener('change', (e) => handleToggleShowInactive(e.target.checked));
  }

  // Gestione opzione "Ricorda corriere selezionato"
  const rememberPref = localStorage.getItem('pref_remember_carrier') !== 'false'; // default true
  if (fileRememberCarrier) fileRememberCarrier.checked = rememberPref;
  if (directRememberCarrier) directRememberCarrier.checked = rememberPref;

  if (fileRememberCarrier) {
    fileRememberCarrier.addEventListener('change', (e) => {
      const checked = e.target.checked;
      localStorage.setItem('pref_remember_carrier', checked ? 'true' : 'false');
      if (directRememberCarrier) directRememberCarrier.checked = checked;
    });
  }
  if (directRememberCarrier) {
    directRememberCarrier.addEventListener('change', (e) => {
      const checked = e.target.checked;
      localStorage.setItem('pref_remember_carrier', checked ? 'true' : 'false');
      if (fileRememberCarrier) fileRememberCarrier.checked = checked;
    });
  }

  if (fileCarrierSelect) {
    fileCarrierSelect.addEventListener('change', () => {
      const val = fileCarrierSelect.value;
      const shouldRemember = !fileRememberCarrier || fileRememberCarrier.checked;
      if (shouldRemember && val) {
        if (currentIsPdf) {
          localStorage.setItem('preferred_carrier_tnt', val);
        } else {
          localStorage.setItem('preferred_carrier_fedex', val);
        }
        localStorage.setItem('preferred_prestashop_carrier_id', val);
      }
      if (directCarrierSelect && directCarrierSelect.value !== val) {
        directCarrierSelect.value = val;
      }
    });
  }

  if (directCarrierSelect) {
    directCarrierSelect.addEventListener('change', () => {
      const val = directCarrierSelect.value;
      const shouldRemember = !directRememberCarrier || directRememberCarrier.checked;
      if (shouldRemember && val) {
        localStorage.setItem('preferred_carrier_fedex', val);
        localStorage.setItem('preferred_prestashop_carrier_id', val);
      }
      if (fileCarrierSelect && fileCarrierSelect.value !== val) {
        fileCarrierSelect.value = val;
      }
    });
  }

  if (fileChangeCarrier) {
    const saved = localStorage.getItem('pref_change_carrier');
    if (saved !== null) fileChangeCarrier.checked = (saved === 'true');
    fileChangeCarrier.addEventListener('change', () => {
      localStorage.setItem('pref_change_carrier', fileChangeCarrier.checked);
      if (currentIsPdf) {
        localStorage.setItem('pref_change_carrier_tnt', fileChangeCarrier.checked ? 'true' : 'false');
      } else {
        localStorage.setItem('pref_change_carrier_fedex', fileChangeCarrier.checked ? 'true' : 'false');
      }
      if (directChangeCarrier) directChangeCarrier.checked = fileChangeCarrier.checked;
    });
  }

  if (directChangeCarrier) {
    const saved = localStorage.getItem('pref_change_carrier');
    if (saved !== null) directChangeCarrier.checked = (saved === 'true');
    directChangeCarrier.addEventListener('change', () => {
      localStorage.setItem('pref_change_carrier', directChangeCarrier.checked);
      localStorage.setItem('pref_change_carrier_fedex', directChangeCarrier.checked ? 'true' : 'false');
      if (fileChangeCarrier) fileChangeCarrier.checked = directChangeCarrier.checked;
    });
  }

  if (fileOverwriteTracking) {
    const saved = localStorage.getItem('pref_overwrite_tracking');
    if (saved !== null) fileOverwriteTracking.checked = (saved === 'true');
    fileOverwriteTracking.addEventListener('change', () => {
      localStorage.setItem('pref_overwrite_tracking', fileOverwriteTracking.checked);
      if (directOverwriteTracking) directOverwriteTracking.checked = fileOverwriteTracking.checked;
    });
  }

  if (directOverwriteTracking) {
    const saved = localStorage.getItem('pref_overwrite_tracking');
    if (saved !== null) directOverwriteTracking.checked = (saved === 'true');
    directOverwriteTracking.addEventListener('change', () => {
      localStorage.setItem('pref_overwrite_tracking', directOverwriteTracking.checked);
      if (fileOverwriteTracking) fileOverwriteTracking.checked = directOverwriteTracking.checked;
    });
  }

  async function handleFileSelected(file) {
    const validExtensions = ['xlsx', 'csv', 'pdf'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
      showToast('Errore file', 'Carica solo file in formato Excel (.xlsx), CSV (.csv) o Manifest TNT (.pdf)', 'error');
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
  const mapReferenceCol = document.getElementById('map-reference-col');
  const mapTrackingCol = document.getElementById('map-tracking-col');
  const previewTableHead = document.getElementById('preview-table-head');
  const previewTableBody = document.getElementById('preview-table-body');

  async function parseFile(fileData, fileName) {
    if (!dropZone) return;
    
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
    currentFileData = null;
    currentFileName = '';
    currentPdfRows = null;
    currentIsPdf = false;

    if (!dropZone) return;
    dropZone.innerHTML = `
      <i data-lucide="file-up"></i>
      <h3>Trascina il file qui o clicca per sfogliare</h3>
      <p>Supporta formati Excel (.xlsx), CSV (.csv) e Manifest TNT (.pdf)</p>
      <input type="file" id="file-input" class="hidden-file-input" accept=".xlsx,.csv,.pdf">
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
    const importDetectedRows = document.getElementById('import-detected-rows');
    const detectedRowsBadge = document.getElementById('detected-rows-badge');
    const step2Title = document.getElementById('step-2-title');
    const step2Subtitle = document.getElementById('step-2-subtitle');
    const previewHeadingText = document.getElementById('preview-heading-text');
    const mappingFieldsExcel = document.getElementById('mapping-fields-excel');
    const pdfManifestSummary = document.getElementById('pdf-manifest-summary');
    const pdfStatusText = document.getElementById('pdf-manifest-status-text');
    const pdfBadges = document.getElementById('pdf-manifest-badges');
    const pdfErrors = document.getElementById('pdf-manifest-errors');

    if (data.isPdf) {
      currentIsPdf = true;
      currentPdfRows = data.rows || [];

      if (importDetectedRows) {
        importDetectedRows.textContent = data.totalRows !== undefined ? data.totalRows : currentPdfRows.length;
      }
      if (detectedRowsBadge) {
        detectedRowsBadge.className = 'badge badge-purple';
        detectedRowsBadge.innerHTML = `<i data-lucide="file-text" style="width:14px;height:14px;"></i><span>Rilevate <strong>${data.totalRows || currentPdfRows.length}</strong> spedizioni TNT</span>`;
      }
      if (step2Title) step2Title.textContent = '2. Verifica Manifest TNT ed Import';
      if (step2Subtitle) step2Subtitle.textContent = 'Verifica i dati estratti dal documento PDF di TNT prima di procedere all\'aggiornamento.';
      if (previewHeadingText) previewHeadingText.textContent = 'Anteprima Spedizioni TNT Rilevate';

      // Mostra riepilogo PDF e nascondi mappatura colonne Excel
      if (mappingFieldsExcel) mappingFieldsExcel.classList.add('hidden');
      if (pdfManifestSummary) pdfManifestSummary.classList.remove('hidden');

      // Validazione e coerenza colli
      if (data.validation && data.validation.valid) {
        if (pdfStatusText) {
          pdfStatusText.textContent = `Controllo coerenza superato: ${data.validation.pdfTotalColli} colli totali (Grand Totals) corrispondenti.`;
        }
        if (pdfBadges) {
          pdfBadges.innerHTML = `
            <span class="badge badge-success" style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;padding:4px 10px;">
              <i data-lucide="check-circle" style="width:14px;height:14px;"></i> Coerenza OK (${data.validation.pdfTotalColli} colli)
            </span>
            <span class="badge badge-purple" style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;padding:4px 10px;">
              <i data-lucide="package" style="width:14px;height:14px;"></i> ${data.totalRows} Spedizioni
            </span>
          `;
        }
        if (pdfErrors) pdfErrors.classList.add('hidden');
      } else {
        const errMsg = (data.validation && data.validation.error) || 'Mancata corrispondenza nel totale colli del manifest TNT.';
        if (pdfStatusText) {
          pdfStatusText.textContent = 'Attenzione: riscontrata anomalia nel manifest PDF.';
        }
        if (pdfBadges) {
          pdfBadges.innerHTML = `
            <span class="badge badge-danger" style="display:inline-flex;align-items:center;gap:5px;font-size:0.8rem;padding:4px 10px;">
              <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> Discrepanza Colli
            </span>
          `;
        }
        if (pdfErrors) {
          pdfErrors.textContent = errMsg;
          pdfErrors.classList.remove('hidden');
        }
      }

      // RICONOSCIMENTO AUTOMATICO CORRIERE TNT (Manifest PDF)
      if (availableCarriers && availableCarriers.length > 0) {
        const savedTntCarrier = localStorage.getItem('preferred_carrier_tnt');
        let targetId = savedTntCarrier;
        if (!targetId) {
          const tntCarrier = findCarrierByKeyword('tnt');
          if (tntCarrier) targetId = tntCarrier.id;
        }
        if (targetId && fileCarrierSelect) {
          fileCarrierSelect.value = targetId;
        }
        if (fileChangeCarrier) {
          const savedChangeTnt = localStorage.getItem('pref_change_carrier_tnt');
          fileChangeCarrier.checked = (savedChangeTnt !== null) ? (savedChangeTnt === 'true') : true;
        }
      }

      // Tabella anteprima TNT
      previewTableHead.innerHTML = `
        <tr>
          <th width="40" class="text-center">
            <input type="checkbox" id="file-master-checkbox" checked aria-label="Seleziona tutte le spedizioni">
          </th>
          <th width="60">N°</th>
          <th>Riferimento Ordine (PrestaShop)</th>
          <th>Codice Tracking TNT</th>
          <th width="90">Colli</th>
        </tr>
      `;
      previewTableBody.innerHTML = '';
      const tntRows = data.preview || data.rows || [];
      if (tntRows.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" class="text-center" style="color:var(--text-muted); padding: 24px 0;">Nessun dato valido rilevato nel PDF TNT.</td>`;
        previewTableBody.appendChild(tr);
      } else {
        tntRows.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="text-center">
              <input type="checkbox" class="file-row-checkbox" data-index="${row.index}" checked aria-label="Seleziona spedizione ${row.index}">
            </td>
            <td class="font-semibold text-center" style="color:var(--text-secondary);">${row.index}</td>
            <td><code class="font-mono font-semibold" style="color:var(--fedex-purple);">${escapeHTML(row.reference)}</code></td>
            <td><code class="font-mono font-semibold" style="color:var(--color-accent);">${escapeHTML(row.trackingNumber)}</code></td>
            <td><span class="badge badge-blue">${row.pieces || 1}</span></td>
          `;
          previewTableBody.appendChild(tr);
        });
      }

    } else {
      // Excel / CSV
      currentIsPdf = false;
      currentPdfRows = null;

      const { headers, preview, autoMapped, totalRows } = data;
      
      if (importDetectedRows) {
        importDetectedRows.textContent = totalRows !== undefined ? totalRows : 0;
      }
      if (detectedRowsBadge) {
        detectedRowsBadge.className = 'badge badge-purple';
        detectedRowsBadge.innerHTML = `<i data-lucide="file-spreadsheet" style="width:14px;height:14px;"></i><span>Rilevate <strong>${totalRows !== undefined ? totalRows : 0}</strong> righe di dati</span>`;
      }
      if (step2Title) step2Title.textContent = '2. Verifica e Configurazione Import';
      if (step2Subtitle) step2Subtitle.textContent = 'Controlla i dati rilevati e configura le opzioni di corriere prima di applicare l\'aggiornamento.';
      if (previewHeadingText) previewHeadingText.textContent = 'Anteprima Dati Rilevati';

      // Mostra mappatura colonne Excel e nascondi riepilogo PDF
      if (mappingFieldsExcel) mappingFieldsExcel.classList.remove('hidden');
      if (pdfManifestSummary) pdfManifestSummary.classList.add('hidden');
      
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

      // RICONOSCIMENTO AUTOMATICO CORRIERE FEDEX (File Excel / CSV)
      if (availableCarriers && availableCarriers.length > 0) {
        const savedFedexCarrier = localStorage.getItem('preferred_carrier_fedex');
        let targetId = savedFedexCarrier;
        if (!targetId) {
          const fedexCarrier = findCarrierByKeyword('fedex');
          if (fedexCarrier) targetId = fedexCarrier.id;
        }
        if (targetId && fileCarrierSelect) {
          fileCarrierSelect.value = targetId;
        }
        if (fileChangeCarrier) {
          const savedChangeFedex = localStorage.getItem('pref_change_carrier_fedex');
          fileChangeCarrier.checked = (savedChangeFedex !== null) ? (savedChangeFedex === 'true') : false;
        }
      }

      // Intestazione tabella anteprima
      previewTableHead.innerHTML = '';
      const trHead = document.createElement('tr');
      const thCb = document.createElement('th');
      thCb.style.width = '40px';
      thCb.className = 'text-center';
      thCb.innerHTML = '<input type="checkbox" id="file-master-checkbox" checked aria-label="Seleziona tutte le righe">';
      trHead.appendChild(thCb);

      headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        trHead.appendChild(th);
      });
      previewTableHead.appendChild(trHead);

      // Righe tabella anteprima
      previewTableBody.innerHTML = '';
      const excelRows = preview || [];
      if (excelRows.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="${headers.length + 1}" class="text-center" style="color:var(--text-muted); padding: 24px 0;">Nessun dato rilevato per l'anteprima.</td>`;
        previewTableBody.appendChild(tr);
      } else {
        excelRows.forEach((row, idx) => {
          const tr = document.createElement('tr');
          const tdCb = document.createElement('td');
          tdCb.className = 'text-center';
          const rowNum = row.__rowNum || (idx + 2);
          tdCb.innerHTML = `<input type="checkbox" class="file-row-checkbox" data-row-num="${rowNum}" checked aria-label="Seleziona riga ${rowNum}">`;
          tr.appendChild(tdCb);

          headers.forEach(h => {
            const td = document.createElement('td');
            td.textContent = row[h] || '';
            tr.appendChild(td);
          });
          previewTableBody.appendChild(tr);
        });
      }
    }

    bindFileSelectionEvents();
    updateFileSelectionSummary();

    importStep1.classList.add('hidden');
    importStep2.classList.remove('hidden');
    importStep3.classList.add('hidden');
    lucide.createIcons();
  }

  // Gestione selezione righe per import file (Master checkbox & contatore)
  function updateFileSelectionSummary() {
    const masterCb = document.getElementById('file-master-checkbox');
    const countEl = document.getElementById('file-selected-count');
    const startBtn = document.getElementById('btn-start-import');
    const checkboxes = previewTableBody ? previewTableBody.querySelectorAll('.file-row-checkbox') : [];

    const total = checkboxes.length;
    let selected = 0;
    checkboxes.forEach(cb => {
      if (cb.checked) selected++;
    });

    if (countEl) {
      countEl.textContent = `${selected} di ${total}`;
    }

    if (masterCb) {
      if (total === 0) {
        masterCb.checked = false;
        masterCb.indeterminate = false;
        masterCb.disabled = true;
      } else if (selected === total) {
        masterCb.checked = true;
        masterCb.indeterminate = false;
        masterCb.disabled = false;
      } else if (selected === 0) {
        masterCb.checked = false;
        masterCb.indeterminate = false;
        masterCb.disabled = false;
      } else {
        masterCb.checked = false;
        masterCb.indeterminate = true;
        masterCb.disabled = false;
      }
    }

    if (startBtn) {
      if (selected === 0) {
        startBtn.disabled = true;
      } else {
        startBtn.disabled = false;
      }
    }
  }

  function bindFileSelectionEvents() {
    const masterCb = document.getElementById('file-master-checkbox');
    if (masterCb) {
      masterCb.onchange = () => {
        const isChecked = masterCb.checked;
        const checkboxes = previewTableBody ? previewTableBody.querySelectorAll('.file-row-checkbox') : [];
        checkboxes.forEach(cb => {
          cb.checked = isChecked;
        });
        updateFileSelectionSummary();
      };
    }

    const btnFileSelectAll = document.getElementById('btn-file-select-all');
    if (btnFileSelectAll) {
      btnFileSelectAll.onclick = () => {
        const checkboxes = previewTableBody ? previewTableBody.querySelectorAll('.file-row-checkbox') : [];
        checkboxes.forEach(cb => {
          cb.checked = true;
        });
        updateFileSelectionSummary();
      };
    }

    const btnFileDeselectAll = document.getElementById('btn-file-deselect-all');
    if (btnFileDeselectAll) {
      btnFileDeselectAll.onclick = () => {
        const checkboxes = previewTableBody ? previewTableBody.querySelectorAll('.file-row-checkbox') : [];
        checkboxes.forEach(cb => {
          cb.checked = false;
        });
        updateFileSelectionSummary();
      };
    }

    if (previewTableBody) {
      previewTableBody.onchange = (e) => {
        if (e.target && e.target.classList.contains('file-row-checkbox')) {
          updateFileSelectionSummary();
        }
      };
    }
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
      let refCol = null;
      let trackCol = null;

      const checkedCbs = previewTableBody ? previewTableBody.querySelectorAll('.file-row-checkbox:checked') : [];
      if (checkedCbs.length === 0) {
        showToast('Nessuna riga selezionata', 'Seleziona almeno una spedizione o riga da importare.', 'warning');
        return;
      }

      if (!currentIsPdf) {
        refCol = mapReferenceCol.value;
        trackCol = mapTrackingCol.value;

        if (!refCol || !trackCol) {
          showToast('Errore mappatura', 'Seleziona entrambe le colonne obbligatorie.', 'error');
          return;
        }

        if (refCol === trackCol) {
          showToast('Errore mappatura', 'La colonna Riferimento e la colonna Codice Tracking non possono coincidere.', 'warning');
          return;
        }
      } else {
        if (!currentPdfRows || currentPdfRows.length === 0) {
          showToast('Errore file', 'Nessuna riga valida da importare dal file PDF TNT.', 'error');
          return;
        }
      }

      if (activePollingInterval) {
        showToast('Attenzione', 'Un\'importazione è già in corso. Attendi il completamento.', 'warning');
        return;
      }

      const carrierSelect = document.getElementById('file-carrier-select');
      const changeCarrierCb = document.getElementById('file-change-carrier');
      const overwriteCb = document.getElementById('file-overwrite-tracking');

      const carrierId = carrierSelect ? carrierSelect.value : null;
      const changeCarrier = changeCarrierCb ? changeCarrierCb.checked : false;
      const overwrite = overwriteCb ? overwriteCb.checked : false;

      if (changeCarrier && !carrierId) {
        showToast('Seleziona Corriere', 'Hai attivato l\'aggiornamento del corriere, ma non hai selezionato nessun corriere dalla lista.', 'warning');
        return;
      }

      const fileRememberCarrierCb = document.getElementById('file-remember-carrier');
      if (carrierId && (!fileRememberCarrierCb || fileRememberCarrierCb.checked)) {
        if (currentIsPdf) {
          localStorage.setItem('preferred_carrier_tnt', carrierId);
          localStorage.setItem('pref_change_carrier_tnt', changeCarrier ? 'true' : 'false');
        } else {
          localStorage.setItem('preferred_carrier_fedex', carrierId);
          localStorage.setItem('pref_change_carrier_fedex', changeCarrier ? 'true' : 'false');
        }
        localStorage.setItem('preferred_prestashop_carrier_id', carrierId);
      }

      let payload;
      if (currentIsPdf) {
        const selectedIndices = new Set(Array.from(checkedCbs).map(cb => parseInt(cb.getAttribute('data-index'), 10)));
        const selectedRows = (currentPdfRows || []).filter(r => selectedIndices.has(r.index));

        if (selectedRows.length === 0) {
          showToast('Nessuna riga selezionata', 'Nessuna riga valida selezionata dal manifest TNT.', 'error');
          return;
        }

        payload = {
          fileName: currentFileName,
          rows: selectedRows,
          carrierId: carrierId ? parseInt(carrierId, 10) : null,
          changeCarrier: changeCarrier,
          overwrite: overwrite
        };
      } else {
        const selectedRowNums = Array.from(checkedCbs).map(cb => parseInt(cb.getAttribute('data-row-num'), 10));

        payload = {
          fileData: currentFileData,
          fileName: currentFileName,
          referenceColumn: refCol,
          trackingColumn: trackCol,
          selectedRowNums: selectedRowNums,
          carrierId: carrierId ? parseInt(carrierId, 10) : null,
          changeCarrier: changeCarrier,
          overwrite: overwrite
        };
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
          body: JSON.stringify(payload)
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
        .map(o => ({ 
          id: o.id, 
          reference: o.reference,
          customer_name: o.customer_name,
          delivery_city: o.delivery_city,
          weight: o.weight,
          cod: o.cod
        }));

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
      const origOrder = pendingSyncOrders.find(o => o.id === item.orderId || o.reference === item.reference) || {};
      allItems.push({
        orderId: item.orderId || origOrder.id || '—',
        reference: item.reference,
        customerName: origOrder.customer_name || item.customerName || 'Cliente',
        deliveryCity: origOrder.delivery_city || item.deliveryCity || '—',
        weight: origOrder.weight || item.weight || 0,
        cod: origOrder.cod || item.cod || 0,
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
        ? `<input type="checkbox" class="direct-result-row-cb" data-order-id="${item.orderId}" data-reference="${item.reference}" data-tracking="${item.trackingNumber}" data-customer="${escapeHTML(item.customerName)}" data-city="${escapeHTML(item.deliveryCity)}" data-weight="${item.weight || 0}" data-cod="${item.cod || 0}" checked>`
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

    // Riconoscimento automatico corriere FedEx per Sincronizzazione Diretta
    if (availableCarriers && availableCarriers.length > 0) {
      const savedFedexCarrier = localStorage.getItem('preferred_carrier_fedex');
      let targetId = savedFedexCarrier;
      if (!targetId) {
        const fedexCarrier = findCarrierByKeyword('fedex');
        if (fedexCarrier) targetId = fedexCarrier.id;
      }
      if (targetId && directCarrierSelect) {
        directCarrierSelect.value = targetId;
      }
      if (directChangeCarrier) {
        const savedChange = localStorage.getItem('pref_change_carrier_fedex');
        directChangeCarrier.checked = (savedChange !== null) ? (savedChange === 'true') : false;
      }
    }
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
        trackingNumber: cb.getAttribute('data-tracking'),
        customer_name: cb.getAttribute('data-customer') || '',
        delivery_city: cb.getAttribute('data-city') || '',
        weight: parseFloat(cb.getAttribute('data-weight')) || 0,
        cod: parseFloat(cb.getAttribute('data-cod')) || 0
      }));

      if (ordersToImport.length === 0) {
        showToast('Nessun ordine selezionato', 'Seleziona almeno un ordine con tracking trovato da importare.', 'warning');
        return;
      }

      if (activePollingInterval) {
        showToast('Attenzione', 'Un processo è già in corso.', 'warning');
        return;
      }

      const carrierSelect = document.getElementById('direct-carrier-select');
      const changeCarrierCb = document.getElementById('direct-change-carrier');
      const overwriteCb = document.getElementById('direct-overwrite-tracking');

      const carrierId = carrierSelect ? carrierSelect.value : null;
      const changeCarrier = changeCarrierCb ? changeCarrierCb.checked : false;
      const overwrite = overwriteCb ? overwriteCb.checked : false;

      if (changeCarrier && !carrierId) {
        showToast('Seleziona Corriere', 'Hai attivato l\'aggiornamento del corriere, ma non hai selezionato nessun corriere dalla lista.', 'warning');
        return;
      }

      const directRememberCarrierCb = document.getElementById('direct-remember-carrier');
      if (carrierId && (!directRememberCarrierCb || directRememberCarrierCb.checked)) {
        localStorage.setItem('preferred_carrier_fedex', carrierId);
        localStorage.setItem('pref_change_carrier_fedex', changeCarrier ? 'true' : 'false');
        localStorage.setItem('preferred_prestashop_carrier_id', carrierId);
      }

      btnApplyDirectImport.disabled = true;
      const originalContent = btnApplyDirectImport.innerHTML;
      btnApplyDirectImport.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Inizializzazione...';

      try {
        const response = await fetch('/api/tracking/import-direct-to-prestashop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orders: ordersToImport,
            carrierId: carrierId ? parseInt(carrierId, 10) : null,
            changeCarrier: changeCarrier,
            overwrite: overwrite
          })
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

  let lastImportSuccessItems = [];

  function renderResultsStep(result) {
    const { summary, details } = result;
    
    // Salva le spedizioni riuscite per il borderò
    lastImportSuccessItems = details.success || [];
    
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

    if (importStep1) importStep1.classList.add('hidden');
    if (importStep2) importStep2.classList.add('hidden');
    if (directStep1) directStep1.classList.add('hidden');
    if (directStep2) directStep2.classList.add('hidden');
    if (panelImportFile) panelImportFile.classList.add('hidden');
    if (panelImportDirect) panelImportDirect.classList.add('hidden');
    if (importStep3) importStep3.classList.remove('hidden');
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }

    showToast(
      'Importazione Completata',
      `Processati ${summary.totalProcessed} elementi: ${summary.successCount} riusciti, ${summary.warningCount + summary.errorCount} anomalie.`,
      summary.errorCount > 0 ? 'error' : (summary.warningCount > 0 ? 'warning' : 'success')
    );
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

  // History Pagination State
  let allHistoryData = [];
  let historyCurrentPage = 1;
  let historyPageSize = parseInt(localStorage.getItem('history_page_size'), 10) || 10;

  // Bind History Page Size Selector
  const historyPageSizeSelect = document.getElementById('history-page-size');
  if (historyPageSizeSelect) {
    historyPageSizeSelect.value = String(historyPageSize);
    historyPageSizeSelect.addEventListener('change', (e) => {
      const newSize = parseInt(e.target.value, 10) || 10;
      historyPageSize = newSize;
      localStorage.setItem('history_page_size', newSize);
      historyCurrentPage = 1;
      renderHistoryPage();
    });
  }

  // Calculate pagination pages array with ellipsis
  function getPaginationPages(current, total) {
    if (total <= 7) {
      const pages = [];
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  // Render pagination navigation controls and summary
  function renderHistoryPagination(totalPages, totalItems, startIdx, endIdx) {
    const paginationContainer = document.getElementById('history-pagination');
    const summaryEl = document.getElementById('history-pagination-summary');
    const navEl = document.getElementById('history-pagination-nav');
    const pageSizeSelect = document.getElementById('history-page-size');

    if (!paginationContainer || !summaryEl || !navEl) return;

    if (totalItems === 0) {
      paginationContainer.classList.add('hidden');
      return;
    }

    paginationContainer.classList.remove('hidden');

    if (pageSizeSelect) {
      pageSizeSelect.value = String(historyPageSize);
    }

    const showingFrom = startIdx + 1;
    const showingTo = Math.min(endIdx, totalItems);
    summaryEl.innerHTML = `Mostrati <strong>${showingFrom}–${showingTo}</strong> di <strong>${totalItems}</strong> operazioni`;

    navEl.innerHTML = '';

    // First button («)
    const btnFirst = document.createElement('button');
    btnFirst.className = 'pagination-btn';
    btnFirst.title = 'Prima pagina';
    btnFirst.innerHTML = '&laquo;';
    btnFirst.disabled = historyCurrentPage <= 1;
    btnFirst.addEventListener('click', () => {
      if (historyCurrentPage > 1) {
        historyCurrentPage = 1;
        renderHistoryPage();
      }
    });
    navEl.appendChild(btnFirst);

    // Prev button (‹)
    const btnPrev = document.createElement('button');
    btnPrev.className = 'pagination-btn';
    btnPrev.title = 'Pagina precedente';
    btnPrev.innerHTML = '&lsaquo;';
    btnPrev.disabled = historyCurrentPage <= 1;
    btnPrev.addEventListener('click', () => {
      if (historyCurrentPage > 1) {
        historyCurrentPage--;
        renderHistoryPage();
      }
    });
    navEl.appendChild(btnPrev);

    // Numbered & ellipsis buttons
    const pages = getPaginationPages(historyCurrentPage, totalPages);
    pages.forEach(p => {
      if (p === '...') {
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '…';
        navEl.appendChild(span);
      } else {
        const btnPage = document.createElement('button');
        btnPage.className = `pagination-btn ${p === historyCurrentPage ? 'active' : ''}`;
        btnPage.textContent = p;
        if (p === historyCurrentPage) {
          btnPage.disabled = true;
        } else {
          btnPage.addEventListener('click', () => {
            historyCurrentPage = p;
            renderHistoryPage();
          });
        }
        navEl.appendChild(btnPage);
      }
    });

    // Next button (›)
    const btnNext = document.createElement('button');
    btnNext.className = 'pagination-btn';
    btnNext.title = 'Pagina successiva';
    btnNext.innerHTML = '&rsaquo;';
    btnNext.disabled = historyCurrentPage >= totalPages;
    btnNext.addEventListener('click', () => {
      if (historyCurrentPage < totalPages) {
        historyCurrentPage++;
        renderHistoryPage();
      }
    });
    navEl.appendChild(btnNext);

    // Last button (»)
    const btnLast = document.createElement('button');
    btnLast.className = 'pagination-btn';
    btnLast.title = 'Ultima pagina';
    btnLast.innerHTML = '&raquo;';
    btnLast.disabled = historyCurrentPage >= totalPages;
    btnLast.addEventListener('click', () => {
      if (historyCurrentPage < totalPages) {
        historyCurrentPage = totalPages;
        renderHistoryPage();
      }
    });
    navEl.appendChild(btnLast);
  }

  // Render current page of history
  function renderHistoryPage() {
    const tableBody = document.getElementById('history-table-body');
    const paginationContainer = document.getElementById('history-pagination');
    if (!tableBody) return;

    if (!Array.isArray(allHistoryData) || allHistoryData.length === 0) {
      if (paginationContainer) paginationContainer.classList.add('hidden');
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

    const totalItems = allHistoryData.length;
    const totalPages = Math.ceil(totalItems / historyPageSize) || 1;
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
    if (historyCurrentPage < 1) historyCurrentPage = 1;

    const startIdx = (historyCurrentPage - 1) * historyPageSize;
    const endIdx = startIdx + historyPageSize;
    const pageItems = allHistoryData.slice(startIdx, endIdx);

    tableBody.innerHTML = '';
    pageItems.forEach(item => {
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

    renderHistoryPagination(totalPages, totalItems, startIdx, endIdx);
    lucide.createIcons();
  }

  async function loadHistory() {
    const tableBody = document.getElementById('history-table-body');
    const detailCard = document.getElementById('history-detail-card');
    const paginationContainer = document.getElementById('history-pagination');
    if (!tableBody) return;

    if (detailCard) detailCard.classList.add('hidden'); // Nascondi dettagli precedenti
    if (paginationContainer) paginationContainer.classList.add('hidden');

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
      allHistoryData = Array.isArray(data) ? data : [];
      renderHistoryPage();

    } catch (error) {
      console.error(error);
      if (paginationContainer) paginationContainer.classList.add('hidden');
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
        // Adjust page if current page became empty
        const remaining = allHistoryData.filter(i => i.id !== id).length;
        const newTotalPages = Math.ceil(remaining / historyPageSize) || 1;
        if (historyCurrentPage > newTotalPages) {
          historyCurrentPage = newTotalPages;
        }
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
        historyCurrentPage = 1;
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

  // =========================================================================
  // GESTIONE BORDERÒ DI SPEDIZIONE / DISTINTA DI RITIRO
  // =========================================================================
  const manifestDropZone = document.getElementById('manifest-drop-zone');
  const manifestFileInput = document.getElementById('manifest-file-input');
  const manifestFileInfo = document.getElementById('manifest-file-info');
  const manifestFileNameEl = document.getElementById('manifest-file-name');
  const manifestBtnClearFile = document.getElementById('manifest-btn-clear-file');
  const manifestCarrierSelect = document.getElementById('manifest-carrier-select');
  const manifestNotesInput = document.getElementById('manifest-notes-input');
  const btnProcessManifestFile = document.getElementById('btn-process-manifest-file');
  const btnManifestViewHistory = document.getElementById('btn-manifest-view-history');

  const manifestInputCard = document.getElementById('manifest-input-card');
  const manifestPreviewCard = document.getElementById('manifest-preview-card');
  const manifestCodeBadge = document.getElementById('manifest-code-badge');
  const manifestTableBody = document.getElementById('manifest-table-body');
  const btnAddManifestRow = document.getElementById('btn-add-manifest-row');
  const btnCancelManifestPreview = document.getElementById('btn-cancel-manifest-preview');
  const btnPrintManifestBrowser = document.getElementById('btn-print-manifest-browser');
  const btnDownloadManifestPdf = document.getElementById('btn-download-manifest-pdf');

  const manifestStatCount = document.getElementById('manifest-stat-count');
  const manifestStatPackages = document.getElementById('manifest-stat-packages');
  const manifestStatWeight = document.getElementById('manifest-stat-weight');
  const manifestStatCod = document.getElementById('manifest-stat-cod');

  const manifestHistoryTableBody = document.getElementById('manifest-history-table-body');
  const btnRefreshManifestHistory = document.getElementById('btn-refresh-manifest-history');
  const manifestPrintArea = document.getElementById('manifest-print-area');

  let manifestFileData = null;
  let manifestFileName = '';
  let currentManifestRows = [];
  let currentManifestCode = '';
  let currentManifestShipper = null;
  let currentManifestCarrier = 'FedEx';

  // Setup Drag & Drop File Upload per Borderò
  if (manifestDropZone) {
    let manifestDragCounter = 0;

    manifestDropZone.addEventListener('click', (e) => {
      if (e.target.id === 'manifest-file-input' || e.target.closest('#manifest-btn-clear-file')) return;
      if (manifestFileInput) manifestFileInput.click();
    });

    manifestDropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      manifestDragCounter++;
      manifestDropZone.classList.add('dragover');
    });

    manifestDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      manifestDropZone.classList.add('dragover');
    });

    manifestDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      manifestDragCounter--;
      if (manifestDragCounter <= 0) {
        manifestDragCounter = 0;
        manifestDropZone.classList.remove('dragover');
      }
    });

    manifestDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      manifestDragCounter = 0;
      manifestDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleManifestFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (manifestFileInput) {
    manifestFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleManifestFileSelect(e.target.files[0]);
      }
    });
  }

  function handleManifestFileSelect(file) {
    const validExtensions = ['xlsx', 'xls', 'csv', 'pdf'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      showToast('Formato non supportato', 'Seleziona un file Excel (.xlsx, .xls), CSV (.csv) o un Manifest TNT (.pdf).', 'error');
      return;
    }

    manifestFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target.result.split(',')[1];
      manifestFileData = base64String;

      if (manifestFileNameEl) manifestFileNameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      if (manifestFileInfo) manifestFileInfo.classList.remove('hidden');
      if (manifestDropZone) manifestDropZone.classList.add('file-selected');

      if (ext === 'pdf' && manifestCarrierSelect) {
        manifestCarrierSelect.value = 'TNT';
      }
      showToast('File caricato', `File "${file.name}" pronto per l'elaborazione.`, 'info');
    };
    reader.readAsDataURL(file);
  }

  if (manifestBtnClearFile) {
    manifestBtnClearFile.addEventListener('click', (e) => {
      e.stopPropagation();
      clearManifestFile();
    });
  }

  function clearManifestFile() {
    manifestFileData = null;
    manifestFileName = '';
    if (manifestFileInput) manifestFileInput.value = '';
    if (manifestFileInfo) manifestFileInfo.classList.add('hidden');
    if (manifestFileNameEl) manifestFileNameEl.textContent = '';
    if (manifestDropZone) manifestDropZone.classList.remove('file-selected');
  }

  // Elabora file per il Borderò
  if (btnProcessManifestFile) {
    btnProcessManifestFile.addEventListener('click', async () => {
      if (!manifestFileData) {
        showToast('Nessun file selezionato', 'Carica un file Excel, CSV o PDF prima di procedere.', 'warning');
        return;
      }

      await processManifestInput({
        fileData: manifestFileData,
        fileName: manifestFileName,
        carrier: manifestCarrierSelect ? manifestCarrierSelect.value : 'FedEx',
        notes: manifestNotesInput ? manifestNotesInput.value : ''
      });
    });
  }

  // Scorciatoia rapida da Import Tracking
  const btnCreateManifestFromImport = document.getElementById('btn-create-manifest-from-import');
  if (btnCreateManifestFromImport) {
    btnCreateManifestFromImport.addEventListener('click', async () => {
      if (!lastImportSuccessItems || lastImportSuccessItems.length === 0) {
        showToast('Nessuna spedizione', 'Non ci sono spedizioni riuscite disponibili per il borderò.', 'warning');
        return;
      }

      const shipments = lastImportSuccessItems.map(item => {
        let trk = item.tracking || item.trackingNumber || '';
        if (!trk && item.message) {
          const m = item.message.match(/tracking\s+([A-Z0-9]+)/i);
          if (m) trk = m[1];
        }

        const refUpper = (item.reference || '').trim().toUpperCase();
        const matchedPending = (typeof pendingSyncOrders !== 'undefined' && Array.isArray(pendingSyncOrders))
          ? pendingSyncOrders.find(p => (p.reference || '').trim().toUpperCase() === refUpper || p.id === item.orderId)
          : null;
        const matchedLoaded = (typeof loadedOrders !== 'undefined' && Array.isArray(loadedOrders))
          ? loadedOrders.find(l => (l.reference || '').trim().toUpperCase() === refUpper || l.id === item.orderId)
          : null;

        const recipient = item.customerName
          || item.customer_name
          || (matchedPending && matchedPending.customer_name && matchedPending.customer_name !== 'Cliente' ? matchedPending.customer_name : '')
          || (matchedLoaded && matchedLoaded.customer_name ? matchedLoaded.customer_name : '')
          || '';

        const city = item.deliveryCity
          || item.delivery_city
          || (matchedPending && matchedPending.delivery_city && matchedPending.delivery_city !== '—' ? matchedPending.delivery_city : '')
          || (matchedLoaded && matchedLoaded.delivery_city ? matchedLoaded.delivery_city : '')
          || '';

        const weight = (item.weight && Number(item.weight) > 0 ? item.weight : null)
          || (matchedPending && matchedPending.weight ? matchedPending.weight : null)
          || (matchedLoaded && matchedLoaded.weight ? matchedLoaded.weight : null)
          || 0;

        const packages = item.packages || 1;
        const service = item.service || 'FedEx';

        const cod = (item.cod !== undefined && item.cod !== null && Number(item.cod) > 0 ? item.cod : null)
          || (matchedPending && matchedPending.cod ? matchedPending.cod : null)
          || (matchedLoaded && matchedLoaded.cod ? matchedLoaded.cod : null)
          || 0;

        return {
          reference: item.reference || '',
          tracking: trk,
          recipient: recipient,
          city: city,
          packages: packages,
          weight: weight,
          cod: cod,
          service: service
        };
      });

      if (menuManifest) menuManifest.click();

      await processManifestInput({
        shipments,
        carrier: 'FedEx',
        notes: ''
      });
    });
  }

  // Chiamata backend per estrarre e normalizzare le spedizioni
  async function processManifestInput(payload) {
    try {
      const originalText = btnProcessManifestFile ? btnProcessManifestFile.innerHTML : '';
      if (btnProcessManifestFile) {
        btnProcessManifestFile.disabled = true;
        btnProcessManifestFile.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Elaborazione...';
      }

      const res = await fetch('/api/manifest/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Errore durante la lettura del file di spedizione.');
      }

      const data = await res.json();
      currentManifestRows = data.shipments || [];
      currentManifestCode = data.manifestCode;
      currentManifestShipper = data.shipper;
      currentManifestCarrier = data.carrier || payload.carrier || 'FedEx';

      if (manifestCodeBadge) manifestCodeBadge.textContent = currentManifestCode;
      if (manifestCarrierSelect) manifestCarrierSelect.value = currentManifestCarrier;

      // Mostra pannello anteprima
      if (manifestPreviewCard) manifestPreviewCard.classList.remove('hidden');
      renderManifestTable();
      recalculateManifestStats();

      // Scroll morbido verso l'anteprima
      manifestPreviewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Borderò preparato', `Rilevate ${currentManifestRows.length} spedizioni. Verifica e modifica i colli se necessario.`, 'success');

    } catch (err) {
      console.error('Errore elaborazione borderò:', err);
      showToast('Errore', err.message, 'error');
    } finally {
      if (btnProcessManifestFile) {
        btnProcessManifestFile.disabled = false;
        btnProcessManifestFile.innerHTML = '<i data-lucide="arrow-right"></i> Elabora ed Anteprima Borderò';
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
    }
  }

  // Renderizza la tabella modificabile delle spedizioni del borderò
  function renderManifestTable() {
    if (!manifestTableBody) return;
    manifestTableBody.innerHTML = '';

    if (currentManifestRows.length === 0) {
      manifestTableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">
            <div class="empty-state">
              <i data-lucide="package-x"></i>
              <p>Nessuna spedizione presente nel borderò.</p>
            </div>
          </td>
        </tr>
      `;
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }

    currentManifestRows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-index', idx);
      tr.innerHTML = `
        <td class="text-center font-semibold" style="color:var(--text-secondary);">${idx + 1}</td>
        <td>
          <input type="text" class="manifest-row-ref font-mono font-semibold" value="${escapeHTML(row.reference || '')}" placeholder="Rif. Ordine" style="color:var(--fedex-purple);">
        </td>
        <td>
          <input type="text" class="manifest-row-track font-mono font-semibold" value="${escapeHTML(row.tracking || '')}" placeholder="Tracking AWB" style="color:var(--color-accent);">
        </td>
        <td>
          <input type="text" class="manifest-row-recipient" value="${escapeHTML(row.recipient || '')}" placeholder="Nome Cliente / Destinatario">
        </td>
        <td>
          <input type="text" class="manifest-row-city" value="${escapeHTML(row.city || '')}" placeholder="Città / Località">
        </td>
        <td class="text-center">
          <input type="number" class="manifest-row-packages text-center font-bold" min="1" value="${row.packages || 1}">
        </td>
        <td class="text-right">
          <input type="number" class="manifest-row-weight text-right" step="0.1" min="0" value="${row.weight !== undefined ? row.weight : 0}">
        </td>
        <td class="text-right">
          <input type="number" class="manifest-row-cod text-right font-semibold" step="0.01" min="0" value="${row.cod !== undefined ? row.cod : 0}" style="${Number(row.cod) > 0 ? 'color:#b91c1c;' : ''}">
        </td>
        <td>
          <input type="text" class="manifest-row-service" value="${escapeHTML(row.service || currentManifestCarrier || '')}" placeholder="Servizio">
        </td>
        <td class="text-center">
          <button type="button" class="manifest-row-btn-delete" title="Rimuovi riga" data-index="${idx}">
            <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
          </button>
        </td>
      `;

      manifestTableBody.appendChild(tr);
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  // Event delegation per modifiche e cancellazioni in tabella
  if (manifestTableBody) {
    manifestTableBody.addEventListener('input', (e) => {
      syncManifestRowsFromDOM();
      recalculateManifestStats();
    });

    manifestTableBody.addEventListener('click', (e) => {
      const btnDelete = e.target.closest('.manifest-row-btn-delete');
      if (btnDelete) {
        const idx = parseInt(btnDelete.getAttribute('data-index'), 10);
        if (!isNaN(idx) && idx >= 0 && idx < currentManifestRows.length) {
          syncManifestRowsFromDOM();
          currentManifestRows.splice(idx, 1);
          renderManifestTable();
          recalculateManifestStats();
        }
      }
    });
  }

  // Sincronizza i dati dai campi input del DOM nell'array currentManifestRows
  function syncManifestRowsFromDOM() {
    if (!manifestTableBody) return;
    const trs = manifestTableBody.querySelectorAll('tr[data-index]');
    currentManifestRows = Array.from(trs).map(tr => {
      const idx = parseInt(tr.getAttribute('data-index'), 10);
      const prevRow = currentManifestRows[idx] || {};
      return {
        ...prevRow,
        reference: tr.querySelector('.manifest-row-ref')?.value?.trim() || '',
        tracking: tr.querySelector('.manifest-row-track')?.value?.trim() || '',
        recipient: tr.querySelector('.manifest-row-recipient')?.value?.trim() || '',
        city: tr.querySelector('.manifest-row-city')?.value?.trim() || '',
        packages: parseInt(tr.querySelector('.manifest-row-packages')?.value || 1, 10) || 1,
        weight: parseFloat(tr.querySelector('.manifest-row-weight')?.value || 0) || 0,
        cod: parseFloat(tr.querySelector('.manifest-row-cod')?.value || 0) || 0,
        service: tr.querySelector('.manifest-row-service')?.value?.trim() || currentManifestCarrier
      };
    });
  }

  // Ricalcola le statistiche riassuntive
  function recalculateManifestStats() {
    let totCount = currentManifestRows.length;
    let totPkgs = 0;
    let totWeight = 0;
    let totCod = 0;

    currentManifestRows.forEach(r => {
      totPkgs += Number(r.packages) || 1;
      totWeight += Number(r.weight) || 0;
      totCod += Number(r.cod) || 0;
    });

    if (manifestStatCount) manifestStatCount.textContent = totCount;
    if (manifestStatPackages) manifestStatPackages.textContent = totPkgs;
    if (manifestStatWeight) manifestStatWeight.textContent = `${totWeight.toFixed(2).replace('.', ',')} kg`;
    if (manifestStatCod) manifestStatCod.textContent = `${totCod.toFixed(2).replace('.', ',')} €`;
  }

  // Aggiungi riga manuale
  if (btnAddManifestRow) {
    btnAddManifestRow.addEventListener('click', () => {
      syncManifestRowsFromDOM();
      currentManifestRows.push({
        reference: '',
        tracking: '',
        recipient: '',
        city: '',
        packages: 1,
        weight: 0,
        cod: 0,
        service: currentManifestCarrier
      });
      renderManifestTable();
      recalculateManifestStats();
      const lastRefInput = manifestTableBody.querySelector('tr:last-child .manifest-row-ref');
      if (lastRefInput) lastRefInput.focus();
    });
  }

  // Completa o ricarica dati mancanti da PrestaShop
  const btnEnrichManifestPs = document.getElementById('btn-enrich-manifest-ps');
  if (btnEnrichManifestPs) {
    btnEnrichManifestPs.addEventListener('click', async () => {
      syncManifestRowsFromDOM();
      if (!currentManifestRows || currentManifestRows.length === 0) {
        showToast('Nessuna riga', 'Non ci sono spedizioni nella tabella da completare.', 'warning');
        return;
      }

      btnEnrichManifestPs.disabled = true;
      const originalHtml = btnEnrichManifestPs.innerHTML;
      btnEnrichManifestPs.innerHTML = '<span class="spinner" style="width:13px;height:13px;"></span> Completamento...';

      try {
        const res = await fetch('/api/manifest/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shipments: currentManifestRows, forceRefresh: true })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Impossibile completare i dati da PrestaShop.');
        }

        const data = await res.json();
        if (data.shipments && data.shipments.length > 0) {
          currentManifestRows = data.shipments;
          renderManifestTable();
          recalculateManifestStats();
          showToast('Dati Sincronizzati', `Pesi reali da FedEx API, città e destinatari sincronizzati per ${currentManifestRows.length} spedizioni.`, 'success');
        }
      } catch (err) {
        console.error('Errore completamento dati:', err);
        showToast('Errore', err.message, 'error');
      } finally {
        btnEnrichManifestPs.disabled = false;
        btnEnrichManifestPs.innerHTML = originalHtml;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
    });
  }

  // Chiudi anteprima
  if (btnCancelManifestPreview) {
    btnCancelManifestPreview.addEventListener('click', () => {
      if (manifestPreviewCard) manifestPreviewCard.classList.add('hidden');
      clearManifestFile();
      if (manifestInputCard) manifestInputCard.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Stampa con il Browser (A4 print layout matching official PDF structure)
  if (btnPrintManifestBrowser) {
    btnPrintManifestBrowser.addEventListener('click', () => {
      syncManifestRowsFromDOM();
      if (currentManifestRows.length === 0) {
        showToast('Attenzione', 'Nessuna spedizione presente nel borderò da stampare.', 'warning');
        return;
      }

      // Archivia in background nello storico per sincronizzare il Registro Borderò Emessi
      try {
        fetch('/api/manifest/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manifestCode: currentManifestCode,
            carrier: currentManifestCarrier,
            shipper: currentManifestShipper,
            shipments: currentManifestRows,
            notes: manifestNotesInput ? manifestNotesInput.value.trim() : ''
          })
        }).then(() => {
          if (typeof loadManifestHistory === 'function') loadManifestHistory();
        }).catch(() => {});
      } catch (e) {}

      printManifestInBrowser();
    });
  }

  function printManifestInBrowser() {
    if (!manifestPrintArea) return;

    // Helper formatting matching manifestPdf.js
    const formatWeight = num => {
      if (num === null || num === undefined || isNaN(num)) return '0,000';
      return Number(num).toFixed(3).replace('.', ',');
    };

    const formatCod = val => {
      const num = Number(val);
      if (!num || isNaN(num) || num <= 0) return '';
      return Number(num).toFixed(2).replace('.', ',');
    };

    const formatDateDot = (date = new Date()) => {
      const d = new Date(date);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    };

    const formatServiceName = (service, carrier = 'FedEx') => {
      if (!service) return 'Express';
      const s = String(service).trim();
      if (/REGIONAL_ECONOMY/i.test(s)) return 'Regional Economy';
      if (/REGIONAL/i.test(s)) return 'Regional';
      if (/INTERNATIONAL_PRIORITY/i.test(s)) return 'Intl Priority';
      if (/INTERNATIONAL_ECONOMY/i.test(s)) return 'Intl Economy';
      if (/PRIORITY_OVERNIGHT/i.test(s)) return 'Priority';
      if (/STANDARD_OVERNIGHT/i.test(s)) return 'Standard';
      if (/2_DAY/i.test(s)) return '2 Day';
      if (/EXPRESS_SAVER/i.test(s)) return 'Express Saver';
      if (/ECONOMY_FREIGHT/i.test(s)) return 'Economy Freight';
      if (/GROUND/i.test(s)) return 'Ground';
      if (/EXPRESS/i.test(s)) return 'Express';
      return s.replace(/^FEDEX_/i, '').replace(/_/g, ' ');
    };

    const isTNT = String(currentManifestCarrier || '').toUpperCase().includes('TNT');
    const carrierNameUpper = isTNT ? 'TNT' : 'FEDEX';

    // Scope detection (DOMESTIC vs INTERNATIONAL)
    const hasInternational = currentManifestRows.some(s => {
      const country = (s.country || s.recipientCountry || '').toUpperCase();
      const city = (s.city || '').toUpperCase();
      return (country && country !== 'IT' && country !== 'ITA' && country !== 'ITALIA') ||
             (/\([A-Z]{2}\)/.test(city) && !/\(IT\)/i.test(city));
    });
    const allInternational = currentManifestRows.length > 0 && currentManifestRows.every(s => {
      const country = (s.country || s.recipientCountry || '').toUpperCase();
      const city = (s.city || '').toUpperCase();
      return (country && country !== 'IT' && country !== 'ITA' && country !== 'ITALIA') ||
             (/\([A-Z]{2}\)/.test(city) && !/\(IT\)/i.test(city));
    });
    const scopeType = allInternational ? 'INTERNATIONAL' : (hasInternational ? 'DOMESTIC / INTL' : 'DOMESTIC');

    let totalPieces = 0;
    let totalWeight = 0;
    let totalCod = 0;
    currentManifestRows.forEach(r => {
      totalPieces += Number(r.packages) || 1;
      totalWeight += Number(r.weight) || 0;
      totalCod += Number(r.cod) || 0;
    });

    const now = new Date();
    const shipper = currentManifestShipper || {};
    const senderAccount = shipper.accountNumber || (shipper.fedex && shipper.fedex.accountNumber) || '';
    const senderName = (shipper.company || shipper.nameVal || shipper.name || 'MITTENTE NON SPECIFICATO').toUpperCase();
    const senderAddressLine1 = (shipper.address1 || '').toLowerCase();
    const cityPart = (shipper.city || '').toUpperCase();
    const statePart = (shipper.state || '').toUpperCase();
    const zipPart = (shipper.zip || '');
    const countryPart = (shipper.country || 'IT').toUpperCase();
    const senderAddressLine2 = [cityPart, statePart, zipPart, countryPart].filter(Boolean).join(',  ');

    const notes = manifestNotesInput ? manifestNotesInput.value.trim() : '';

    const logoHtml = isTNT ? `
      <div class="manifest-tnt-logo">
        <span>T</span><span>N</span><span>T</span>
      </div>
    ` : `
      <div class="manifest-fedex-logo">
        <span class="logo-fed">Fed</span><span class="logo-ex">Ex</span>
      </div>
    `;

    const rowsHtml = currentManifestRows.map(row => {
      const receiverName = (row.recipient || row.customerName || '').toUpperCase();
      const serviceName = formatServiceName(row.service, currentManifestCarrier);

      let cityDisplay = (row.city || '').toUpperCase();
      const countryVal = (row.country || row.recipientCountry || '').toUpperCase();
      if (countryVal && countryVal !== 'IT' && countryVal !== 'ITA' && countryVal !== 'ITALIA') {
        if (!cityDisplay.includes(`(${countryVal})`) && !cityDisplay.endsWith(` ${countryVal}`)) {
          cityDisplay = cityDisplay ? `${cityDisplay} (${countryVal})` : countryVal;
        }
      }

      const codVal = formatCod(row.cod);

      return `
        <tr>
          <td class="col-con-nr">${escapeHTML(String(row.tracking || '-'))}</td>
          <td class="col-pieces text-right">${escapeHTML(String(row.packages || 1))}</td>
          <td class="col-weight text-right">${escapeHTML(formatWeight(row.weight))}</td>
          <td class="col-ref">${escapeHTML(String(row.reference || '-').toUpperCase())}</td>
          <td class="col-receiver">${escapeHTML(receiverName)}</td>
          <td class="col-city">${escapeHTML(cityDisplay)}</td>
          <td class="col-service">${escapeHTML(serviceName)}</td>
          <td class="col-cod text-right">${escapeHTML(codVal)}</td>
        </tr>
      `;
    }).join('');

    manifestPrintArea.innerHTML = `
      <div class="manifest-print-container">
        <!-- TOP HEADER -->
        <div class="manifest-print-header">
          <div class="manifest-print-logo">
            ${logoHtml}
          </div>
          <div class="manifest-print-title-area">
            <div class="manifest-print-main-title">COLLECTION MANIFEST (SUMMARY) - 1</div>
            <div class="manifest-print-sub-title">${escapeHTML(carrierNameUpper)} ${escapeHTML(scopeType)}</div>
          </div>
          <div class="manifest-print-scope">
            ${escapeHTML(scopeType)}
          </div>
        </div>

        <!-- SENDER & MANIFEST DETAILS TABLE -->
        <table class="manifest-print-meta-table">
          <tr>
            <td class="manifest-lbl" style="width:110px;">Sender Account:</td>
            <td class="manifest-val" style="width:300px;">${escapeHTML(senderAccount)}</td>
            <td class="manifest-lbl text-right" style="width:70px;">Page:</td>
            <td class="manifest-val text-right" style="width:50px;">1</td>
          </tr>
          <tr>
            <td class="manifest-lbl">Sender Name:</td>
            <td class="manifest-val bold">${escapeHTML(senderName)}</td>
            <td class="manifest-lbl text-right">Date:</td>
            <td class="manifest-val text-right">${formatDateDot(now)}</td>
          </tr>
          <tr>
            <td class="manifest-lbl" style="vertical-align:top;">& Address</td>
            <td class="manifest-val bold" style="vertical-align:top;">
              ${escapeHTML(senderAddressLine1)}<br>
              ${escapeHTML(senderAddressLine2)}
            </td>
            <td class="manifest-lbl text-right" style="vertical-align:top;">Doc:</td>
            <td class="manifest-val text-right" style="vertical-align:top;">${escapeHTML(currentManifestCode)}</td>
          </tr>
        </table>

        <!-- DIVIDER LINE -->
        <div class="manifest-print-divider"></div>

        <!-- MAIN TABLE -->
        <table class="manifest-print-table">
          <thead>
            <tr>
              <th class="col-con-nr">Con Nr</th>
              <th class="col-pieces text-right">No. of<br>Pieces</th>
              <th class="col-weight text-right">Weight<br>(kgs)</th>
              <th class="col-ref">Shipper Ref.</th>
              <th class="col-receiver">Receiver</th>
              <th class="col-city">City</th>
              <th class="col-service">Destination Service</th>
              <th class="col-cod text-right">C.O.D.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- TOTALS SECTION -->
        <div class="manifest-print-divider"></div>
        <div class="manifest-print-totals-section">
          <div class="manifest-totals-heading">Account &nbsp;${escapeHTML(senderAccount || '00000000')}&nbsp; Totals:</div>
          <table class="manifest-totals-table">
            <tr>
              <td class="col-con-nr pl-indent">${currentManifestRows.length}</td>
              <td class="col-pieces text-right">${totalPieces}</td>
              <td class="col-weight text-right">${formatWeight(totalWeight)}</td>
              <td class="col-ref-blank"></td>
              <td class="col-receiver-blank"></td>
              <td class="col-city-blank"></td>
              <td class="col-service-blank"></td>
              <td class="col-cod text-right">${totalCod > 0 ? formatCod(totalCod) : ''}</td>
            </tr>
          </table>
        </div>

        <div class="manifest-print-divider"></div>
        <div class="manifest-print-totals-section">
          <div class="manifest-totals-heading">Grand Totals:</div>
          <table class="manifest-totals-table">
            <tr>
              <td class="col-con-nr pl-indent">${currentManifestRows.length}</td>
              <td class="col-pieces text-right">${totalPieces}</td>
              <td class="col-weight text-right">${formatWeight(totalWeight)}</td>
              <td class="col-ref-blank"></td>
              <td class="col-receiver-blank"></td>
              <td class="col-city-blank"></td>
              <td class="col-service-blank"></td>
              <td class="col-cod text-right">${totalCod > 0 ? formatCod(totalCod) : ''}</td>
            </tr>
          </table>
        </div>
        <div class="manifest-print-divider"></div>

        <!-- NOTES (IF ANY) -->
        ${notes ? `<div class="manifest-print-notes">Note Ritiro: ${escapeHTML(notes)}</div>` : ''}

        <!-- SIGNATURES SECTION -->
        <div class="manifest-print-signatures">
          <div class="manifest-print-sig-row">
            <span class="manifest-sig-title">Sender's Signature</span>
            <span class="manifest-sig-rule">_________________________</span>
            <span class="manifest-sig-date">Date: &nbsp;______/______/_____</span>
          </div>

          <div class="manifest-print-sig-row" style="margin-top:28px;">
            <span class="manifest-sig-title">Received by ${escapeHTML(carrierNameUpper)}</span>
            <span class="manifest-sig-rule">_________________________</span>
            <span class="manifest-sig-date">Date: &nbsp;______/______/_____ &nbsp;&nbsp;&nbsp; Time: &nbsp;_______:______ &nbsp;hrs</span>
          </div>
        </div>
      </div>
    `;

    window.print();
  }

  // Genera e scarica il file PDF ufficiale dal Backend
  if (btnDownloadManifestPdf) {
    btnDownloadManifestPdf.addEventListener('click', async () => {
      syncManifestRowsFromDOM();
      if (currentManifestRows.length === 0) {
        showToast('Attenzione', 'Nessuna spedizione presente nel borderò.', 'warning');
        return;
      }

      btnDownloadManifestPdf.disabled = true;
      const originalText = btnDownloadManifestPdf.innerHTML;
      btnDownloadManifestPdf.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Generazione PDF...';

      try {
        const payload = {
          manifestCode: currentManifestCode,
          carrier: currentManifestCarrier,
          shipper: currentManifestShipper,
          shipments: currentManifestRows,
          notes: manifestNotesInput ? manifestNotesInput.value.trim() : ''
        };

        const res = await fetch('/api/manifest/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Impossibile creare il file PDF.');
        }

        const data = await res.json();
        
        // Avvia download del file PDF
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = data.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('PDF Generato', `Il Borderò "${data.manifestCode}" è stato creato e scaricato con successo!`, 'success');

        // Aggiorna tabella storico borderò
        loadManifestHistory();

      } catch (err) {
        console.error('Errore creazione PDF borderò:', err);
        showToast('Errore', err.message, 'error');
      } finally {
        btnDownloadManifestPdf.disabled = false;
        btnDownloadManifestPdf.innerHTML = originalText;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }
    });
  }

  // =========================================================================
  // PAGINAZIONE REGISTRO BORDERÒ EMESSI
  // =========================================================================
  let allManifestData = [];
  let manifestCurrentPage = 1;
  let manifestPageSize = parseInt(localStorage.getItem('manifest_page_size'), 10) || 10;

  // Bind Manifest Page Size Selector
  const manifestPageSizeSelect = document.getElementById('manifest-page-size');
  if (manifestPageSizeSelect) {
    manifestPageSizeSelect.value = String(manifestPageSize);
    manifestPageSizeSelect.addEventListener('change', (e) => {
      const newSize = parseInt(e.target.value, 10) || 10;
      manifestPageSize = newSize;
      localStorage.setItem('manifest_page_size', newSize);
      manifestCurrentPage = 1;
      renderManifestHistoryPage();
    });
  }

  // Renderizza controlli di navigazione paginazione per i borderò
  function renderManifestHistoryPagination(totalPages, totalItems, startIdx, endIdx) {
    const paginationContainer = document.getElementById('manifest-pagination');
    const summaryEl = document.getElementById('manifest-pagination-summary');
    const navEl = document.getElementById('manifest-pagination-nav');
    const pageSizeSelect = document.getElementById('manifest-page-size');

    if (!paginationContainer || !summaryEl || !navEl) return;

    if (totalItems === 0) {
      paginationContainer.classList.add('hidden');
      return;
    }

    paginationContainer.classList.remove('hidden');

    if (pageSizeSelect) {
      pageSizeSelect.value = String(manifestPageSize);
    }

    const showingFrom = startIdx + 1;
    const showingTo = Math.min(endIdx, totalItems);
    summaryEl.innerHTML = `Mostrati <strong>${showingFrom}–${showingTo}</strong> di <strong>${totalItems}</strong> borderò`;

    navEl.innerHTML = '';

    // First button («)
    const btnFirst = document.createElement('button');
    btnFirst.className = 'pagination-btn';
    btnFirst.title = 'Prima pagina';
    btnFirst.innerHTML = '&laquo;';
    btnFirst.disabled = manifestCurrentPage <= 1;
    btnFirst.addEventListener('click', () => {
      if (manifestCurrentPage > 1) {
        manifestCurrentPage = 1;
        renderManifestHistoryPage();
      }
    });
    navEl.appendChild(btnFirst);

    // Prev button (‹)
    const btnPrev = document.createElement('button');
    btnPrev.className = 'pagination-btn';
    btnPrev.title = 'Pagina precedente';
    btnPrev.innerHTML = '&lsaquo;';
    btnPrev.disabled = manifestCurrentPage <= 1;
    btnPrev.addEventListener('click', () => {
      if (manifestCurrentPage > 1) {
        manifestCurrentPage--;
        renderManifestHistoryPage();
      }
    });
    navEl.appendChild(btnPrev);

    // Numbered & ellipsis buttons
    const pages = getPaginationPages(manifestCurrentPage, totalPages);
    pages.forEach(p => {
      if (p === '...') {
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '…';
        navEl.appendChild(span);
      } else {
        const btnPage = document.createElement('button');
        btnPage.className = `pagination-btn ${p === manifestCurrentPage ? 'active' : ''}`;
        btnPage.textContent = p;
        if (p === manifestCurrentPage) {
          btnPage.disabled = true;
        } else {
          btnPage.addEventListener('click', () => {
            manifestCurrentPage = p;
            renderManifestHistoryPage();
          });
        }
        navEl.appendChild(btnPage);
      }
    });

    // Next button (›)
    const btnNext = document.createElement('button');
    btnNext.className = 'pagination-btn';
    btnNext.title = 'Pagina successiva';
    btnNext.innerHTML = '&rsaquo;';
    btnNext.disabled = manifestCurrentPage >= totalPages;
    btnNext.addEventListener('click', () => {
      if (manifestCurrentPage < totalPages) {
        manifestCurrentPage++;
        renderManifestHistoryPage();
      }
    });
    navEl.appendChild(btnNext);

    // Last button (»)
    const btnLast = document.createElement('button');
    btnLast.className = 'pagination-btn';
    btnLast.title = 'Ultima pagina';
    btnLast.innerHTML = '&raquo;';
    btnLast.disabled = manifestCurrentPage >= totalPages;
    btnLast.addEventListener('click', () => {
      if (manifestCurrentPage < totalPages) {
        manifestCurrentPage = totalPages;
        renderManifestHistoryPage();
      }
    });
    navEl.appendChild(btnLast);
  }

  // Renderizza la pagina corrente dei borderò
  function renderManifestHistoryPage() {
    const tableBody = manifestHistoryTableBody || document.getElementById('manifest-history-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const totalItems = allManifestData.length;
    if (totalItems === 0) {
      tableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">
            <div class="empty-state">
              <i data-lucide="file-text"></i>
              <p>Nessun borderò emesso finora.</p>
            </div>
          </td>
        </tr>
      `;
      const paginationContainer = document.getElementById('manifest-pagination');
      if (paginationContainer) paginationContainer.classList.add('hidden');
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }

    const totalPages = Math.ceil(totalItems / manifestPageSize) || 1;
    if (manifestCurrentPage > totalPages) manifestCurrentPage = totalPages;
    if (manifestCurrentPage < 1) manifestCurrentPage = 1;

    const startIdx = (manifestCurrentPage - 1) * manifestPageSize;
    const endIdx = startIdx + manifestPageSize;
    const pageItems = allManifestData.slice(startIdx, endIdx);

    pageItems.forEach(m => {
      const d = new Date(m.timestamp || Date.now());
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--fedex-purple);">${escapeHTML(m.manifestCode || '-')}</strong></td>
        <td style="color:var(--text-secondary); font-size:0.85rem;">${dateStr}</td>
        <td><span class="badge badge-purple">${escapeHTML(m.carrier || 'FedEx')}</span></td>
        <td class="text-center font-semibold">${m.shipmentsCount || '-'}</td>
        <td class="text-center font-bold" style="color:var(--text-primary);">${m.totalPackages || 1}</td>
        <td class="text-right" style="font-size:0.85rem;">${m.totalWeight ? `${Number(m.totalWeight).toFixed(2).replace('.', ',')} kg` : '-'}</td>
        <td class="text-right" style="white-space:nowrap;">
          <a href="/api/manifest/download/${m.manifestCode}?inline=true" target="_blank" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:4px; text-decoration:none;" title="Visualizza / Stampa PDF">
            <i data-lucide="printer" style="width:13px;height:13px;"></i> Stampa
          </a>
          <a href="/api/manifest/download/${m.manifestCode}" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:4px; text-decoration:none; margin-left:6px;" download title="Scarica file PDF">
            <i data-lucide="download" style="width:13px;height:13px;"></i> PDF
          </a>
          <button type="button" class="btn btn-outline-danger btn-sm btn-delete-manifest" data-id="${m.id}" style="margin-left:6px; padding:4px 8px;" title="Elimina dallo storico">
            <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
          </button>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    renderManifestHistoryPagination(totalPages, totalItems, startIdx, endIdx);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  // Carica storico dei Borderò emessi
  async function loadManifestHistory() {
    const tableBody = manifestHistoryTableBody || document.getElementById('manifest-history-table-body');
    if (!tableBody) return;
    try {
      const res = await fetch('/api/manifest/history');
      if (!res.ok) return;

      const manifests = await res.json();
      allManifestData = Array.isArray(manifests) ? manifests : [];
      renderManifestHistoryPage();

    } catch (err) {
      console.error('Errore caricamento storico borderò:', err);
    }
  }

  // Elimina singolo borderò da storico
  if (manifestHistoryTableBody) {
    manifestHistoryTableBody.addEventListener('click', async (e) => {
      const btnDel = e.target.closest('.btn-delete-manifest');
      if (!btnDel) return;

      const id = btnDel.getAttribute('data-id');
      if (!id) return;

      const confirmed = await showCustomConfirm(
        'Elimina Borderò',
        'Sei sicuro di voler eliminare questo borderò dallo storico? Il file PDF fisico archiviato verrà rimosso permanentemente.'
      );
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Eliminato', 'Borderò rimosso con successo.', 'success');
          loadManifestHistory();
        } else {
          throw new Error('Errore nella rimozione.');
        }
      } catch (err) {
        showToast('Errore', err.message, 'error');
      }
    });
  }

  if (btnRefreshManifestHistory) {
    btnRefreshManifestHistory.addEventListener('click', () => {
      loadManifestHistory();
      showToast('Aggiornato', 'Storico borderò aggiornato.', 'info');
    });
  }

  if (btnManifestViewHistory) {
    btnManifestViewHistory.addEventListener('click', () => {
      const histCard = document.getElementById('manifest-history-card');
      if (histCard) {
        histCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        loadManifestHistory();
      }
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
  // Handle URL hash on load and when hash/history changes (at the end of DOMContentLoaded)
  initRoutingFromHash();
  window.addEventListener('hashchange', initRoutingFromHash);
  window.addEventListener('popstate', initRoutingFromHash);
});

