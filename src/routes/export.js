const express = require('express');
const router = express.Router();
const { buildFedExExcel, getFedExDefaults } = require('../services/fedexExcel');
const config = require('../config');
const settingsStore = require('../services/settingsStore');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.post('/', async (req, res) => {
  try {
    const psClient = settingsStore.getPrestaShopClient();
    const { orderIds, defaults, shipper: shipperOverride } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Nessun ID ordine fornito per l\'esportazione.' });
    }

    // Load defaults from the Excel template sheet dynamically, with config.js as fallback
    const excelDefaults = await getFedExDefaults().catch(err => {
      console.warn('Could not load defaults from excel template, using config.js fallbacks:', err.message);
      return {};
    });

    // Default package options
    const defaultWeight = (defaults && defaults.weight) ? parseFloat(defaults.weight) : (excelDefaults.packageWeight || parseFloat(config.package.weight));
    const defaultLength = (defaults && defaults.length) ? parseFloat(defaults.length) : (excelDefaults.length || parseFloat(config.package.length));
    const defaultWidth = (defaults && defaults.width) ? parseFloat(defaults.width) : (excelDefaults.width || parseFloat(config.package.width));
    const defaultHeight = (defaults && defaults.height) ? parseFloat(defaults.height) : (excelDefaults.height || parseFloat(config.package.height));
    const defaultService = (defaults && defaults.service) || excelDefaults.serviceType || config.package.service;
    const defaultPackageType = (defaults && defaults.packageType) || excelDefaults.packageType || config.package.packageType;

    const savedShipper = settingsStore.getSettings().shipper || {};

    const shipper = {
      name: (shipperOverride && shipperOverride.name) || savedShipper.name || excelDefaults.senderContactName || config.shipper.name,
      company: (shipperOverride && shipperOverride.company) || savedShipper.company || excelDefaults.senderCompany || config.shipper.company,
      address1: (shipperOverride && shipperOverride.address1) || savedShipper.address1 || excelDefaults.senderLine1 || config.shipper.address1,
      city: (shipperOverride && shipperOverride.city) || savedShipper.city || excelDefaults.senderCity || config.shipper.city,
      zip: (shipperOverride && shipperOverride.zip) || savedShipper.zip || excelDefaults.senderPostcode || config.shipper.zip,
      country: (shipperOverride && shipperOverride.country) || savedShipper.country || excelDefaults.senderCountry || config.shipper.country,
      phone: (shipperOverride && shipperOverride.phone) || savedShipper.phone || excelDefaults.senderContactNumber || config.shipper.phone,
    };

    const rows = [];
    const warnings = [];

    for (const orderId of orderIds) {
      try {
        await delay(100); // 100ms throttle delay
        const order = await psClient.getOrder(orderId);

        if (!order) {
          warnings.push(`Ordine ID ${orderId} non trovato in PrestaShop.`);
          continue;
        }

        const idAddress = order.id_address_delivery;
        if (!idAddress || idAddress === '0') {
          warnings.push(`L'ordine con riferimento ${order.reference} (ID ${orderId}) non ha un indirizzo di spedizione.`);
          continue;
        }

        // Fetch recipient address and customer details
        const address = await psClient.getAddress(idAddress);
        if (!address) {
          warnings.push(`Impossibile caricare l'indirizzo ID ${idAddress} per l'ordine ${order.reference} (ID ${orderId}).`);
          continue;
        }

        const customer = await psClient.getCustomer(order.id_customer);
        let countryCode = 'IT'; // Default fallback
        if (address.id_country && address.id_country !== '0') {
          await delay(50);
          const country = await psClient.getCountry(address.id_country);
          if (country && country.iso_code) {
            countryCode = country.iso_code;
          }
        }

        let stateCode = null;
        if (address.id_state && address.id_state !== '0') {
          await delay(50);
          const stateObj = await psClient.getState(address.id_state);
          if (stateObj && stateObj.iso_code) {
            stateCode = stateObj.iso_code;
          }
        }

        // Determine recipient notification language (default to 'en' as seen in user screenshot, or 'it' for Italy)
        // Determine recipient notification language and locale based on country code
        let langCode = 'en';
        let localeCode = null;
        
        const countryUpper = (countryCode || '').toUpperCase().trim();
        switch (countryUpper) {
          case 'IT':
            langCode = 'it';
            break;
          case 'FR':
            langCode = 'fr';
            break;
          case 'DE':
            langCode = 'de';
            break;
          case 'ES':
            langCode = 'es';
            break;
          case 'NL':
            langCode = 'nl';
            break;
          case 'PL':
            langCode = 'pl';
            break;
          case 'FI':
            langCode = 'fi';
            break;
          case 'SE':
            langCode = 'se'; // Swedish
            break;
          case 'NO':
            langCode = 'no'; // Norwegian
            break;
          case 'HU':
            langCode = 'hu'; // Hungarian
            break;
          case 'TR':
            langCode = 'tr'; // Turkish
            break;
          case 'RU':
            langCode = 'ru'; // Russian
            break;
          case 'CZ':
            langCode = 'cs'; // Czech
            break;
          case 'DK':
            langCode = 'da'; // Danish
            break;
          case 'PT':
            langCode = 'pt'; // Portuguese
            break;
          case 'BR':
            langCode = 'pt'; // Portuguese (Latin America)
            localeCode = 'br';
            break;
          case 'MX':
            langCode = 'es'; // Spanish (Latin America)
            localeCode = 'mx';
            break;
          case 'JP':
            langCode = 'ja'; // Japanese
            break;
          case 'KR':
            langCode = 'ko'; // Korean
            break;
          default:
            langCode = 'en'; // Default to English
        }

        // Push order mapping directly to the 59-column template structure + notification extensions
        rows.push({
          reference: order.reference || '',
          senderContactName: shipper.name,
          senderCompany: shipper.company,
          senderContactNumber: shipper.phone,
          senderEmail: '', // Empty or optional
          senderLine1: shipper.address1,
          senderLine2: null,
          senderPostcode: shipper.zip,
          senderState: null,
          senderCity: shipper.city,
          senderCountry: shipper.country,
          
          recipientContactName: `${address.firstname || ''} ${address.lastname || ''}`.trim() || (customer ? `${customer.firstname || ''} ${customer.lastname || ''}`.trim() : ''),
          recipientCompany: address.company || null,
          recipientContactNumber: address.phone_mobile || address.phone || '',
          recipientEmail: customer ? customer.email : null,
          recipientLine1: address.address1 || '',
          recipientLine2: address.address2 || null,
          recipientLine3: null,
          recipientPostcode: address.postcode || '',
          recipientState: stateCode,
          recipientCity: address.city || '',
          recipientCountry: countryCode,
          
          packageType: defaultPackageType,
          numberOfPackages: 1,
          packageWeight: defaultWeight,
          weightUnits: excelDefaults.weightUnits || 'KGS',
          length: defaultLength,
          width: defaultWidth,
          height: defaultHeight,
          currencyType: excelDefaults.currencyType || 'EUR',
          oneRatePricing: null,
          commodityType: excelDefaults.commodityType || 'ITEMS',
          itemDescription: excelDefaults.itemDescription || 'elettronica',
          harmonizedCode: null,
          manufacturingCountry: null,
          commodityQuantity: null,
          commodityMeasureUnit: null,
          commodityWeight: null,
          customsValue: null,
          documentType: null,
          documentDescription: null,
          purposeOfShipment: null,
          generateInvoice: null,
          etdEnabled: excelDefaults.etdEnabled || 'Y',
          serviceType: defaultService,

          // Email notification flags for columns 60-64 (enabling pickup, delivery, exceptions, estimated delivery updates)
          recipientDeliveryNotification: 'Y',
          recipientExceptionNotification: 'Y',
          recipientShipAlertNotification: 'Y',
          recipientNotificationLanguageCode: langCode,
          recipientNotificationLocaleCode: localeCode,

          // Billing and tax terms (SENDER bills transportation and duties/taxes to their own account)
          taxPaymentType: 'SENDER',
          paymentType: 'SENDER'
        });

      } catch (err) {
        console.error(`Errore nell'elaborazione dell'ordine ${orderId}:`, err);
        warnings.push(`Errore nell'elaborazione dell'ordine ID ${orderId}: ${err.message}`);
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({
        error: 'Nessun ordine valido è stato preparato per l\'esportazione.',
        warnings
      });
    }

    const workbook = await buildFedExExcel(rows);

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `spedizioni_fedex_${datePart}_${timePart}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // Add custom header with warnings (JSON string)
    if (warnings.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', 'X-Export-Warnings');
      res.setHeader('X-Export-Warnings', encodeURIComponent(JSON.stringify(warnings)));
    }

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
