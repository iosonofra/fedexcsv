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

  // Defaults from .env / config.js
  let settings = {
    prestashop: {
      baseUrl: config.prestashop.baseUrl || '',
      apiKey: config.prestashop.apiKey || ''
    },
    shipper: {
      name: config.shipper.name || '',
      company: config.shipper.company || '',
      address1: config.shipper.address1 || '',
      city: config.shipper.city || '',
      state: config.shipper.state || '',
      zip: config.shipper.zip || '',
      country: config.shipper.country || '',
      phone: config.shipper.phone || ''
    }
  };

  // Override with persisted file if it exists
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const fileData = JSON.parse(raw);
      if (fileData.prestashop) {
        if (fileData.prestashop.baseUrl) settings.prestashop.baseUrl = fileData.prestashop.baseUrl;
        if (fileData.prestashop.apiKey) settings.prestashop.apiKey = fileData.prestashop.apiKey;
      }
      if (fileData.shipper) {
        settings.shipper = {
          name: fileData.shipper.name !== undefined ? fileData.shipper.name : settings.shipper.name,
          company: fileData.shipper.company !== undefined ? fileData.shipper.company : settings.shipper.company,
          address1: fileData.shipper.address1 !== undefined ? fileData.shipper.address1 : settings.shipper.address1,
          city: fileData.shipper.city !== undefined ? fileData.shipper.city : settings.shipper.city,
          state: fileData.shipper.state !== undefined ? fileData.shipper.state : settings.shipper.state,
          zip: fileData.shipper.zip !== undefined ? fileData.shipper.zip : settings.shipper.zip,
          country: fileData.shipper.country !== undefined ? fileData.shipper.country : settings.shipper.country,
          phone: fileData.shipper.phone !== undefined ? fileData.shipper.phone : settings.shipper.phone
        };
      }
    }
  } catch (err) {
    console.error('Error reading settings file:', err.message);
  }

  cachedSettings = settings;
  return settings;
}

/**
 * Save PrestaShop connection settings to data/settings.json.
 */
function saveSettings(prestashopData) {
  const current = getSettings();

  const toSave = {
    prestashop: {
      baseUrl: prestashopData.baseUrl || current.prestashop.baseUrl,
      apiKey: prestashopData.apiKey || current.prestashop.apiKey
    },
    shipper: current.shipper
  };

  // Ensure data directory exists
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');

  // Invalidate caches so next call picks up the new values
  cachedSettings = null;
  cachedClient = null;
  cachedClientKey = null;
}

/**
 * Save Shipper settings to data/settings.json.
 */
function saveShipperSettings(shipperData) {
  const current = getSettings();

  const toSave = {
    prestashop: current.prestashop,
    shipper: {
      name: shipperData.name !== undefined ? shipperData.name.trim() : current.shipper.name,
      company: shipperData.company !== undefined ? shipperData.company.trim() : current.shipper.company,
      address1: shipperData.address1 !== undefined ? shipperData.address1.trim() : current.shipper.address1,
      city: shipperData.city !== undefined ? shipperData.city.trim() : current.shipper.city,
      state: shipperData.state !== undefined ? shipperData.state.trim() : current.shipper.state,
      zip: shipperData.zip !== undefined ? shipperData.zip.trim() : current.shipper.zip,
      country: shipperData.country !== undefined ? shipperData.country.trim() : current.shipper.country,
      phone: shipperData.phone !== undefined ? shipperData.phone.trim() : current.shipper.phone
    }
  };

  // Ensure data directory exists
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf-8');

  // Invalidate caches so next call picks up the new values
  cachedSettings = null;
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
  maskApiKey
};
