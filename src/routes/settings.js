const express = require('express');
const router = express.Router();
const { getFedExDefaults } = require('../services/fedexExcel');
const settingsStore = require('../services/settingsStore');
const PrestaShopClient = require('../services/prestashop');
const fedexApi = require('../services/fedexApi');

// GET /api/settings/defaults — FedEx template defaults
router.get('/defaults', async (req, res) => {
  try {
    const defaults = await getFedExDefaults();
    const settings = settingsStore.getSettings();
    if (settings.defaults) {
      defaults.packageWeight = settings.defaults.packageWeight;
      defaults.length = settings.defaults.length;
      defaults.width = settings.defaults.width;
      defaults.height = settings.defaults.height;
      defaults.serviceType = settings.defaults.serviceType;
      defaults.packageType = settings.defaults.packageType;
    }
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
      enabledOrderStates: settings.prestashop.enabledOrderStates || [],
      configured: settingsStore.isConfigured()
    });
  } catch (error) {
    console.error('Error reading PrestaShop settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/prestashop/states — save the enabled order states
router.post('/prestashop/states', (req, res) => {
  try {
    const { enabledOrderStates } = req.body;

    if (!Array.isArray(enabledOrderStates)) {
      return res.status(400).json({ error: 'La lista degli stati non è valida.' });
    }

    const current = settingsStore.getSettings();
    settingsStore.saveSettings({
      baseUrl: current.prestashop.baseUrl,
      apiKey: current.prestashop.apiKey,
      enabledOrderStates: enabledOrderStates.map(Number)
    });

    res.json({ success: true, message: 'Stati dell\'ordine salvati correttamente.' });
  } catch (error) {
    console.error('Error saving order states:', error);
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

// GET /api/settings/templates — Retrieve all templates and active IDs
router.get('/templates', (req, res) => {
  try {
    const settings = settingsStore.getSettings();
    res.json({
      shipment: {
        templates: settings.shipmentTemplates || [],
        activeId: settings.activeShipmentTemplateId || ''
      },
      shipper: {
        templates: settings.shipperTemplates || [],
        activeId: settings.activeShipperTemplateId || ''
      }
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/templates/active — Change active template
router.post('/templates/active', (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !id) {
      return res.status(400).json({ error: 'Campi type e id obbligatori.' });
    }
    settingsStore.setActiveTemplate(type, id);
    res.json({ success: true, message: 'Template attivo modificato.' });
  } catch (error) {
    console.error('Error setting active template:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/templates — Save or update template
router.post('/templates', (req, res) => {
  try {
    const { type, template } = req.body;
    if (!type || !template || !template.id || !template.name) {
      return res.status(400).json({ error: 'Dati del template incompleti.' });
    }
    settingsStore.saveTemplate(type, template);
    res.json({ success: true, message: 'Template salvato correttamente.' });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/settings/templates — Delete a template
router.delete('/templates', (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) {
      return res.status(400).json({ error: 'Campi type e id obbligatori.' });
    }
    settingsStore.deleteTemplate(type, id);
    res.json({ success: true, message: 'Template eliminato correttamente.' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/settings/fedex — retrieve current FedEx configuration (keys masked)
router.get('/fedex', (req, res) => {
  try {
    const settings = settingsStore.getSettings();
    const fedex = settings.fedex || {};
    res.json({
      clientId: settingsStore.maskApiKey(fedex.clientId),
      clientSecret: settingsStore.maskApiKey(fedex.clientSecret),
      accountNumber: fedex.accountNumber || '',
      useSandbox: fedex.useSandbox !== undefined ? fedex.useSandbox : true,
      configured: settingsStore.isFedexConfigured()
    });
  } catch (error) {
    console.error('Error reading FedEx settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to check if a submitted value is a dummy/masked value
const isDummy = (val) => {
  if (!val) return true;
  const str = String(val).trim();
  return str === '' || str.includes('•') || str.includes('\u2022') || str.includes('*');
};

// POST /api/settings/fedex — save FedEx connection settings
router.post('/fedex', (req, res) => {
  try {
    let { clientId, clientSecret, accountNumber, useSandbox } = req.body;

    if (!accountNumber) {
      return res.status(400).json({ error: 'Il Numero Conto è obbligatorio.' });
    }

    const settings = settingsStore.getSettings();
    const fedex = settings.fedex || {};

    // Support dummy values to preserve actual key on save
    if (isDummy(clientId)) {
      clientId = fedex.clientId;
    }
    if (isDummy(clientSecret)) {
      clientSecret = fedex.clientSecret;
    }

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID e Client Secret sono obbligatori.' });
    }

    settingsStore.saveFedexSettings({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      accountNumber: accountNumber.trim(),
      useSandbox: !!useSandbox
    });

    res.json({ success: true, message: 'Impostazioni FedEx salvate correttamente.' });
  } catch (error) {
    console.error('Error saving FedEx settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/fedex/test — test connection without saving
router.post('/fedex/test', async (req, res) => {
  try {
    let { clientId, clientSecret, useSandbox } = req.body;

    const settings = settingsStore.getSettings();
    const fedex = settings.fedex || {};

    // Support dummy values to test using already saved actual keys
    if (isDummy(clientId)) {
      clientId = fedex.clientId;
    }
    if (isDummy(clientSecret)) {
      clientSecret = fedex.clientSecret;
    }

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID e Client Secret sono obbligatori per il test.' });
    }

    // Try to get a token
    const token = await fedexApi.getAccessToken(clientId.trim(), clientSecret.trim(), useSandbox !== undefined ? !!useSandbox : fedex.useSandbox);

    if (token) {
      res.json({
        success: true,
        message: 'Connessione a FedEx riuscita! Autenticazione completata con successo.'
      });
    } else {
      res.status(400).json({ error: 'Non è stato possibile ottenere un token di accesso da FedEx.' });
    }
  } catch (error) {
    console.error('FedEx connection test failed:', error.message);
    res.status(400).json({ error: `Connessione fallita: ${error.message}` });
  }
});

// GET /api/settings/backup - Export backup file
router.get('/backup', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const historyStore = require('../services/historyStore');

    // 1. Get settings
    const settings = settingsStore.getSettings();

    // 2. Get history
    const history = historyStore.getHistory();

    // 3. Get export files as base64
    const exportsDir = historyStore.EXPORTS_DIR;
    const exportFiles = {};
    if (fs.existsSync(exportsDir)) {
      const files = fs.readdirSync(exportsDir);
      for (const file of files) {
        const filePath = path.join(exportsDir, file);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath);
          exportFiles[file] = content.toString('base64');
        }
      }
    }

    // 4. Get personal-example-batch-upload.xlsx as base64
    let personalTemplate = null;
    const personalTemplatePath = path.join(__dirname, '../../personal-example-batch-upload.xlsx');
    if (fs.existsSync(personalTemplatePath)) {
      personalTemplate = fs.readFileSync(personalTemplatePath).toString('base64');
    }

    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings,
      history,
      exports: exportFiles,
      personalTemplate
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_fedex_link_${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    console.error('Error generating backup:', error);
    res.status(500).json({ error: 'Errore durante la generazione del backup.' });
  }
});

// POST /api/settings/restore - Restore backup file
router.post('/restore', async (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || !backupData.settings || !backupData.history) {
      return res.status(400).json({ error: 'Formato del file di backup non valido.' });
    }

    const historyStore = require('../services/historyStore');
    const fs = require('fs');
    const path = require('path');

    // 1. Restore settings
    settingsStore.restoreSettings(backupData.settings);

    // 2. Restore history and physical files
    historyStore.restoreHistory(backupData.history, backupData.exports || {});

    // 3. Restore personal-example-batch-upload.xlsx if present
    if (backupData.personalTemplate) {
      const personalTemplatePath = path.join(__dirname, '../../personal-example-batch-upload.xlsx');
      try {
        fs.writeFileSync(personalTemplatePath, Buffer.from(backupData.personalTemplate, 'base64'));
      } catch (err) {
        console.error('Error restoring personal Excel template:', err.message);
      }
    }

    // Reset order states cache in case new shop has different states
    try {
      const ordersRouter = require('./orders');
      if (ordersRouter && typeof ordersRouter.resetOrderStatesCache === 'function') {
        ordersRouter.resetOrderStatesCache();
      }
    } catch (e) {
      console.warn('Failed to reset order states cache after restore:', e.message);
    }

    res.json({ success: true, message: 'Backup ripristinato con successo!' });
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ error: `Errore durante il ripristino: ${error.message}` });
  }
});

module.exports = router;

