const express = require('express');
const router = express.Router();
const { getFedExDefaults } = require('../services/fedexExcel');
const settingsStore = require('../services/settingsStore');
const PrestaShopClient = require('../services/prestashop');

// GET /api/settings/defaults — FedEx template defaults
router.get('/defaults', async (req, res) => {
  try {
    const defaults = await getFedExDefaults();
    res.json(defaults);
  } catch (error) {
    console.error('Error fetching FedEx defaults:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settings/prestashop — retrieve current PrestaShop configuration (API key masked)
router.get('/prestashop', (req, res) => {
  try {
    const settings = settingsStore.getSettings();
    res.json({
      baseUrl: settings.prestashop.baseUrl || '',
      apiKey: settingsStore.maskApiKey(settings.prestashop.apiKey),
      configured: settingsStore.isConfigured()
    });
  } catch (error) {
    console.error('Error reading PrestaShop settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/prestashop — save PrestaShop connection settings
router.post('/prestashop', (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body;

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'URL e chiave API sono obbligatori.' });
    }

    // Basic URL validation
    try {
      new URL(baseUrl);
    } catch {
      return res.status(400).json({ error: 'L\'URL inserito non è valido.' });
    }

    settingsStore.saveSettings({ baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: apiKey.trim() });

    // Reset order states cache in case new shop has different states
    try {
      const ordersRouter = require('./orders');
      if (ordersRouter && typeof ordersRouter.resetOrderStatesCache === 'function') {
        ordersRouter.resetOrderStatesCache();
      }
    } catch (e) {
      console.warn('Failed to reset order states cache:', e.message);
    }

    res.json({ success: true, message: 'Impostazioni salvate correttamente.' });
  } catch (error) {
    console.error('Error saving PrestaShop settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/prestashop/test — test connection without saving
router.post('/prestashop/test', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body;

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'URL e chiave API sono obbligatori per il test.' });
    }

    // Validate URL
    try {
      new URL(baseUrl);
    } catch {
      return res.status(400).json({ error: 'L\'URL inserito non è valido.' });
    }

    // Create a temporary client and test
    const testClient = new PrestaShopClient(baseUrl.replace(/\/+$/, ''), apiKey.trim());

    // Try fetching a single order to verify credentials
    const orders = await testClient.getOrders({ limit: '1' });

    res.json({
      success: true,
      message: `Connessione riuscita! Trovati ordini nel webservice.`
    });
  } catch (error) {
    console.error('PrestaShop connection test failed:', error.message);

    let errorMsg = 'Impossibile connettersi al webservice PrestaShop.';
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMsg = 'Chiave API non valida. Verifica le credenziali del webservice.';
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMsg = 'Indirizzo del server non raggiungibile. Verifica l\'URL.';
    } else if (error.message.includes('404')) {
      errorMsg = 'Webservice non trovato all\'indirizzo specificato. Verifica che il webservice sia attivo.';
    }

    res.status(400).json({ error: errorMsg });
  }
});

// GET /api/settings/shipper — retrieve current Shipper configuration
router.get('/shipper', (req, res) => {
  try {
    const settings = settingsStore.getSettings();
    res.json(settings.shipper || {});
  } catch (error) {
    console.error('Error reading Shipper settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/shipper — save Shipper settings
router.post('/shipper', (req, res) => {
  try {
    const { name, company, address1, city, state, zip, country, phone } = req.body;

    // Validate mandatory fields
    if (!name || !address1 || !city || !zip || !country || !phone) {
      return res.status(400).json({ error: 'I campi Nome, Indirizzo 1, Città, CAP, Paese e Telefono sono obbligatori.' });
    }

    settingsStore.saveShipperSettings({
      name,
      company: company || '',
      address1,
      city,
      state: state || '',
      zip,
      country,
      phone
    });

    res.json({ success: true, message: 'Dati mittente salvati correttamente.' });
  } catch (error) {
    console.error('Error saving Shipper settings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
