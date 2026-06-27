const fs = require('fs');
const path = require('path');
const PrestaShopClient = require('./prestashop');

const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json');

// In-memory cache
let cachedSettings = null;
let cachedClient = null;
let cachedClientKey = null; // Track baseUrl+apiKey to know when to recreate

/**
 * Load settings from data/settings.json, falling back to .env / config.js values.
 */
function getSettings() {
  if (cachedSettings) return cachedSettings;

  const config = require('../config');

  let settings = {
    prestashop: {
      baseUrl: config.prestashop.baseUrl || '',
      apiKey: config.prestashop.apiKey || '',
      enabledOrderStates: []
    },
    shipmentTemplates: [],
    activeShipmentTemplateId: '',
    shipperTemplates: [],
    activeShipperTemplateId: '',
    shipper: {},
    defaults: {}
  };

  let needsSave = false;

  // 1. Read existing file data
  let fileData = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      fileData = JSON.parse(raw);
    } catch (err) {
      console.error('Error reading settings file:', err.message);
    }
  }

  // 2. Load PrestaShop settings
  if (fileData.prestashop) {
    if (fileData.prestashop.baseUrl) settings.prestashop.baseUrl = fileData.prestashop.baseUrl;
    if (fileData.prestashop.apiKey) settings.prestashop.apiKey = fileData.prestashop.apiKey;
    if (fileData.prestashop.enabledOrderStates) settings.prestashop.enabledOrderStates = fileData.prestashop.enabledOrderStates;
  }

  // 3. Load or initialize shipmentTemplates
  if (fileData.shipmentTemplates && fileData.shipmentTemplates.length > 0) {
    settings.shipmentTemplates = fileData.shipmentTemplates;
    settings.activeShipmentTemplateId = fileData.activeShipmentTemplateId || settings.shipmentTemplates[0].id;
  } else {
    // Initialize default shipment template
    const defaultShipment = {
      id: 't_default',
      name: 'Default Spedizione',
      weight: Number(config.package.weight) || 70,
      length: Number(config.package.length) || 80,
      width: Number(config.package.width) || 60,
      height: Number(config.package.height) || 100,
      service: config.package.service || 'FEDEX_REGIONAL_ECONOMY_FREIGHT',
      packageType: config.package.packageType || 'YOUR_PACKAGING'
    };
    settings.shipmentTemplates = [defaultShipment];
    settings.activeShipmentTemplateId = 't_default';
    needsSave = true;
  }

  // 4. Load or initialize shipperTemplates
  if (fileData.shipperTemplates && fileData.shipperTemplates.length > 0) {
    settings.shipperTemplates = fileData.shipperTemplates;
    settings.activeShipperTemplateId = fileData.activeShipperTemplateId || settings.shipperTemplates[0].id;
  } else {
    // Initialize default shipper template from fileData.shipper or config
    const existingShipper = fileData.shipper || {};
    const defaultShipper = {
      id: 's_default',
      name: 'Default Mittente',
      nameVal: existingShipper.name || config.shipper.name || '',
      company: existingShipper.company || config.shipper.company || '',
      address1: existingShipper.address1 || config.shipper.address1 || '',
      city: existingShipper.city || config.shipper.city || '',
      state: existingShipper.state || config.shipper.state || '',
      zip: existingShipper.zip || config.shipper.zip || '',
      country: existingShipper.country || config.shipper.country || '',
      phone: existingShipper.phone || config.shipper.phone || ''
    };
    settings.shipperTemplates = [defaultShipper];
    settings.activeShipperTemplateId = 's_default';
    needsSave = true;
  }

  // 5. Save if we initialized templates to keep settings file updated
  if (needsSave) {
    try {
      const dir = path.dirname(SETTINGS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
        prestashop: settings.prestashop,
        shipmentTemplates: settings.shipmentTemplates,
        activeShipmentTemplateId: settings.activeShipmentTemplateId,
        shipperTemplates: settings.shipperTemplates,
        activeShipperTemplateId: settings.activeShipperTemplateId
      }, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write settings file during initialization:', e.message);
    }
  }

  // 6. Resolve active shipper
  const activeShipper = settings.shipperTemplates.find(t => t.id === settings.activeShipperTemplateId) || settings.shipperTemplates[0];
  if (activeShipper) {
    settings.shipper = {
      name: activeShipper.nameVal || '',
      company: activeShipper.company || '',
      address1: activeShipper.address1 || '',
      city: activeShipper.city || '',
      state: activeShipper.state || '',
      zip: activeShipper.zip || '',
      country: activeShipper.country || '',
      phone: activeShipper.phone || ''
    };
  }

  // 7. Resolve active shipment defaults
  const activeShipment = settings.shipmentTemplates.find(t => t.id === settings.activeShipmentTemplateId) || settings.shipmentTemplates[0];
  if (activeShipment) {
    settings.defaults = {
      packageWeight: Number(activeShipment.weight) || 70,
      length: Number(activeShipment.length) || 80,
      width: Number(activeShipment.width) || 60,
      height: Number(activeShipment.height) || 100,
      serviceType: activeShipment.service || 'FEDEX_REGIONAL_ECONOMY_FREIGHT',
      packageType: activeShipment.packageType || 'YOUR_PACKAGING'
    };
  }

  cachedSettings = settings;
  return settings;
}

/**
 * Persist template and connection configurations to settings.json.
 */
function persistSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const toSave = {
    prestashop: settings.prestashop,
    shipmentTemplates: settings.shipmentTemplates,
    activeShipmentTemplateId: settings.activeShipmentTemplateId,
    shipperTemplates: settings.shipperTemplates,
    activeShipperTemplateId: settings.activeShipperTemplateId
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  cachedSettings = null; // Invalidate cache
}

/**
 * Save PrestaShop connection settings to data/settings.json.
 */
function saveSettings(prestashopData) {
  const current = getSettings();
  current.prestashop = {
    baseUrl: prestashopData.baseUrl || current.prestashop.baseUrl,
    apiKey: prestashopData.apiKey || current.prestashop.apiKey,
    enabledOrderStates: prestashopData.enabledOrderStates !== undefined ? prestashopData.enabledOrderStates : (current.prestashop.enabledOrderStates || [])
  };
  persistSettings(current);
  cachedClient = null;
  cachedClientKey = null;
}

/**
 * Normalizes address spacing.
 */
function cleanAddressSpacing(addr) {
  if (!addr) return '';
  return addr
    .toString()
    .replace(/\s+/g, ' ')
    .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
    .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
    .trim();
}

/**
 * Save Shipper settings (updates the currently active template).
 */
function saveShipperSettings(shipperData) {
  const current = getSettings();
  const activeId = current.activeShipperTemplateId;
  const idx = current.shipperTemplates.findIndex(t => t.id === activeId);
  if (idx !== -1) {
    current.shipperTemplates[idx] = {
      ...current.shipperTemplates[idx],
      nameVal: shipperData.name !== undefined ? shipperData.name.trim() : current.shipperTemplates[idx].nameVal,
      company: shipperData.company !== undefined ? shipperData.company.trim() : current.shipperTemplates[idx].company,
      address1: shipperData.address1 !== undefined ? cleanAddressSpacing(shipperData.address1) : current.shipperTemplates[idx].address1,
      city: shipperData.city !== undefined ? shipperData.city.trim() : current.shipperTemplates[idx].city,
      state: shipperData.state !== undefined ? shipperData.state.trim() : current.shipperTemplates[idx].state,
      zip: shipperData.zip !== undefined ? shipperData.zip.trim() : current.shipperTemplates[idx].zip,
      country: shipperData.country !== undefined ? shipperData.country.trim() : current.shipperTemplates[idx].country,
      phone: shipperData.phone !== undefined ? shipperData.phone.trim() : current.shipperTemplates[idx].phone
    };
    persistSettings(current);
  }
}

/**
 * Save/update a single template.
 */
function saveTemplate(type, templateData) {
  const current = getSettings();
  if (type === 'shipment') {
    const idx = current.shipmentTemplates.findIndex(t => t.id === templateData.id);
    const validated = {
      id: templateData.id,
      name: templateData.name.trim(),
      weight: Number(templateData.weight) || 70,
      length: Number(templateData.length) || 80,
      width: Number(templateData.width) || 60,
      height: Number(templateData.height) || 100,
      service: templateData.service || 'FEDEX_REGIONAL_ECONOMY_FREIGHT',
      packageType: templateData.packageType || 'YOUR_PACKAGING'
    };
    if (idx !== -1) {
      current.shipmentTemplates[idx] = validated;
    } else {
      current.shipmentTemplates.push(validated);
    }
  } else if (type === 'shipper') {
    const idx = current.shipperTemplates.findIndex(t => t.id === templateData.id);
    const validated = {
      id: templateData.id,
      name: templateData.name.trim(),
      nameVal: templateData.nameVal ? templateData.nameVal.trim() : '',
      company: templateData.company ? templateData.company.trim() : '',
      address1: templateData.address1 ? cleanAddressSpacing(templateData.address1) : '',
      city: templateData.city ? templateData.city.trim() : '',
      state: templateData.state ? templateData.state.trim() : '',
      zip: templateData.zip ? templateData.zip.trim() : '',
      country: templateData.country ? templateData.country.trim() : '',
      phone: templateData.phone ? templateData.phone.trim() : ''
    };
    if (idx !== -1) {
      current.shipperTemplates[idx] = validated;
    } else {
      current.shipperTemplates.push(validated);
    }
  }
  persistSettings(current);
}

/**
 * Delete a template.
 */
function deleteTemplate(type, id) {
  const current = getSettings();
  if (type === 'shipment') {
    if (current.shipmentTemplates.length <= 1) {
      throw new Error('Impossibile eliminare l\'ultimo template rimasto.');
    }
    current.shipmentTemplates = current.shipmentTemplates.filter(t => t.id !== id);
    if (current.activeShipmentTemplateId === id) {
      current.activeShipmentTemplateId = current.shipmentTemplates[0].id;
    }
  } else if (type === 'shipper') {
    if (current.shipperTemplates.length <= 1) {
      throw new Error('Impossibile eliminare l\'ultimo template rimasto.');
    }
    current.shipperTemplates = current.shipperTemplates.filter(t => t.id !== id);
    if (current.activeShipperTemplateId === id) {
      current.activeShipperTemplateId = current.shipperTemplates[0].id;
    }
  }
  persistSettings(current);
}

/**
 * Change the active template.
 */
function setActiveTemplate(type, id) {
  const current = getSettings();
  if (type === 'shipment') {
    const exists = current.shipmentTemplates.some(t => t.id === id);
    if (exists) current.activeShipmentTemplateId = id;
  } else if (type === 'shipper') {
    const exists = current.shipperTemplates.some(t => t.id === id);
    if (exists) current.activeShipperTemplateId = id;
  }
  persistSettings(current);
}

/**
 * Returns true if PrestaShop credentials are configured (non-empty URL and API key).
 */
function isConfigured() {
  const s = getSettings();
  return !!(s.prestashop.baseUrl && s.prestashop.apiKey);
}

/**
 * Get a PrestaShopClient instance. Re-creates it only when credentials change.
 */
function getPrestaShopClient() {
  const s = getSettings();
  const key = `${s.prestashop.baseUrl}::${s.prestashop.apiKey}`;

  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }

  if (!s.prestashop.baseUrl || !s.prestashop.apiKey) {
    throw new Error('PrestaShop non configurato. Vai alla pagina Impostazioni per inserire URL e chiave API.');
  }

  cachedClient = new PrestaShopClient(s.prestashop.baseUrl, s.prestashop.apiKey);
  cachedClientKey = key;
  return cachedClient;
}

/**
 * Invalidate the order states cache in the orders router.
 * Called after settings are saved so stale data is cleared.
 */
function invalidateOrderStatesCache() {
  cachedClient = null;
  cachedClientKey = null;
}

/**
 * Mask an API key for safe display: show first 4 and last 4 chars.
 */
function maskApiKey(key) {
  if (!key || key.length <= 8) return key ? '****' : '';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

module.exports = {
  getSettings,
  saveSettings,
  saveShipperSettings,
  isConfigured,
  getPrestaShopClient,
  invalidateOrderStatesCache,
  maskApiKey,
  cleanAddressSpacing,
  saveTemplate,
  deleteTemplate,
  setActiveTemplate
};
