const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const settingsStore = require('../services/settingsStore');
const historyStore = require('../services/historyStore');
const { generateManifestPdf } = require('../services/manifestPdf');
const tntParser = require('../services/tntParser');
const config = require('../config');
const fedexApi = require('../services/fedexApi');

/**
 * Helper to generate a sequential manifest code: BOR-YYYYMMDD-XXX
 */
function generateManifestCode() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  const history = historyStore.getHistory();
  const todayManifests = history.filter(h => h.type === 'manifest' && h.manifestCode && h.manifestCode.includes(dateStr));
  const nextSeq = String(todayManifests.length + 1).padStart(3, '0');

  return `BOR-${dateStr}-${nextSeq}`;
}

/**
 * Loads a workbook from a base64 string.
 */
async function loadWorkbook(base64Data, fileName) {
  const buffer = Buffer.from(base64Data, 'base64');
  const wb = new ExcelJS.Workbook();
  const fileExt = fileName.split('.').pop().toLowerCase();

  if (fileExt === 'csv') {
    const csvStream = Readable.from(buffer);
    await wb.csv.read(csvStream);
  } else {
    await wb.xlsx.load(buffer);
  }
  return wb;
}

/**
 * POST /api/manifest/parse
 * Parses uploaded tracking file (Excel/CSV/PDF) or direct rows to produce a unified manifest preview.
 */
router.post('/parse', async (req, res) => {
  try {
    const { fileData, fileName, shipments: directShipments, carrier: customCarrier } = req.body;

    const settings = settingsStore.getSettings();
    const activeShipper = (settings.shipperTemplates && settings.shipperTemplates.find(s => s.id === settings.activeShipperTemplateId)) 
      || (settings.shipperTemplates && settings.shipperTemplates[0]) 
      || {};

    // In case active shipper has accountNumber from fedex
    let shipper = {
      ...activeShipper,
      accountNumber: (settings.fedex && settings.fedex.accountNumber) || activeShipper.accountNumber || ''
    };

    let parsedShipments = [];
    let detectedCarrier = customCarrier || 'FedEx';

    // 1. Direct shipments passed in body (e.g. from tracking import UI or PrestaShop order selection)
    if (Array.isArray(directShipments) && directShipments.length > 0) {
      parsedShipments = directShipments.map(s => ({
        reference: (s.reference || s.ref || '').toString().trim(),
        tracking: (s.tracking || s.trackingNumber || '').toString().trim(),
        recipient: (s.recipient || s.customerName || s.client || '').toString().trim(),
        city: (s.city || '').toString().trim(),
        country: (s.country || s.recipientCountry || '').toString().trim(),
        packages: parseInt(s.packages || s.colli || s.pieces || 1, 10) || 1,
        weight: parseFloat(s.weight || 0) || 0,
        cod: parseFloat(s.cod || s.contrassegno || 0) || 0,
        service: s.service || detectedCarrier
      }));
    } else if (fileData && fileName) {
      const fileExt = fileName.split('.').pop().toLowerCase();

      // 2. TNT PDF format
      if (fileExt === 'pdf') {
        detectedCarrier = 'TNT';
        const buffer = Buffer.from(fileData, 'base64');
        const pdfData = await pdfParse(buffer);
        const parseResult = tntParser.parseManifestText(pdfData.text);

        parsedShipments = parseResult.rows.map(r => ({
          reference: r.reference || '',
          tracking: r.tracking || '',
          recipient: '',
          city: '',
          packages: r.pieces || 1,
          weight: 0,
          cod: 0,
          service: 'TNT Express'
        }));
      } else {
        // 3. Excel or CSV file
        const wb = await loadWorkbook(fileData, fileName);
        const ws = wb.worksheets.find(w => w.rowCount > 0) || wb.worksheets[0];

        if (!ws || ws.rowCount === 0) {
          return res.status(400).json({ error: 'Il file caricato è vuoto o privo di righe.' });
        }

        const headers = [];
        const headerRow = ws.getRow(1);
        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] = (cell.value ? cell.value.toString().trim() : '') || `Colonna ${colNumber}`;
        });

        // Detect if this is an official FedEx Shipment Report (e.g. Shipment_Report_YYYY-MM-DD.xlsx)
        const isFedExShipmentReport = 
          headers.includes('masterTrackingNumber') || 
          headers.includes('pieceTrackingNumber') ||
          (headers.includes('serviceType') && headers.includes('senderAccountNumber')) ||
          /shipment_report/i.test(fileName);

        if (isFedExShipmentReport) {
          detectedCarrier = 'FedEx';

          // Extract sender details from the report if present
          if (ws.rowCount >= 2) {
            const firstDataRow = ws.getRow(2);
            const getSenderCell = (colName) => {
              const idx = headers.indexOf(colName);
              if (idx === -1) return '';
              const cellVal = firstDataRow.getCell(idx + 1).value;
              if (cellVal === null || cellVal === undefined) return '';
              if (typeof cellVal === 'object') return cellVal.text || cellVal.result || '';
              return cellVal.toString().trim();
            };

            const senderAcc = getSenderCell('senderAccountNumber');
            const senderComp = getSenderCell('senderCompany');
            const senderLine = getSenderCell('senderLine1');
            const senderCity = getSenderCell('senderCity');
            const senderZip = getSenderCell('senderPostcode');
            const senderCountry = getSenderCell('senderCountry') || 'IT';
            const senderPhone = getSenderCell('senderContactNumber');
            const senderContact = getSenderCell('senderContactName');

            if (senderComp || senderAcc) {
              shipper = {
                ...shipper,
                accountNumber: senderAcc || shipper.accountNumber || '',
                company: senderComp || shipper.company || '',
                address1: senderLine || shipper.address1 || '',
                city: senderCity || shipper.city || '',
                zip: senderZip || shipper.zip || '',
                country: senderCountry || shipper.country || 'IT',
                phone: senderPhone || shipper.phone || '',
                personName: senderContact || shipper.personName || ''
              };
            }
          }
        }

        // Column index resolution
        const getColIdx = (name) => headers.indexOf(name);
        const findColIdx = (regex, excludeRegex = null) => {
          return headers.findIndex(h => regex.test(h) && (!excludeRegex || !excludeRegex.test(h)));
        };

        let refIdx, trackIdx, recipientContactIdx, recipientCompIdx, cityIdx, countryIdx, pkgIdx, weightIdx, codIdx, serviceIdx;

        if (isFedExShipmentReport) {
          refIdx = getColIdx('reference');
          trackIdx = getColIdx('pieceTrackingNumber') !== -1 ? getColIdx('pieceTrackingNumber') : getColIdx('masterTrackingNumber');
          recipientContactIdx = getColIdx('recipientContactName');
          recipientCompIdx = getColIdx('recipientCompany');
          cityIdx = getColIdx('recipientCity');
          countryIdx = getColIdx('recipientCountry');
          pkgIdx = getColIdx('numberOfPackages');
          weightIdx = getColIdx('totalShipmentWeight') !== -1 ? getColIdx('totalShipmentWeight') : getColIdx('packageWeight');
          codIdx = getColIdx('codAmount');
          serviceIdx = getColIdx('serviceType');
        } else {
          const EXCLUDE_SENDER = /sender|mittente/i;
          refIdx = findColIdx(/^(reference|ref|riferimento|ordine|order|id_order|id_ordine|shipper ref)$/i) !== -1 
            ? findColIdx(/^(reference|ref|riferimento|ordine|order|id_order|id_ordine|shipper ref)$/i)
            : findColIdx(/ref|riferimento|ordine|order/i);

          trackIdx = findColIdx(/^(pieceTrackingNumber|tracking|awb|waybill)$/i) !== -1
            ? findColIdx(/^(pieceTrackingNumber|tracking|awb|waybill)$/i)
            : findColIdx(/track|airway|awb|trck|waybill|spedizione|carrier_ref|con nr/i, /returnTracking/i);

          recipientContactIdx = findColIdx(/recipientContactName|recipientName|destinatario|consignee/i, EXCLUDE_SENDER);
          if (recipientContactIdx === -1) {
            recipientContactIdx = findColIdx(/recipient|destinatario|cliente|customer|name|nome/i, EXCLUDE_SENDER);
          }
          recipientCompIdx = findColIdx(/recipientCompany|ragione social|azienda.*dest/i, EXCLUDE_SENDER);

          cityIdx = findColIdx(/recipientCity|citt[aà]|city|localit[aà]|comune/i, EXCLUDE_SENDER);
          countryIdx = findColIdx(/recipientCountry|paese|nazione|country/i, EXCLUDE_SENDER);
          pkgIdx = findColIdx(/numberOfPackages|colli|pezzi|pieces|packages|pkgs|box/i);
          weightIdx = findColIdx(/totalShipmentWeight|packageWeight|peso|weight|kg/i);
          codIdx = findColIdx(/(\bcod\b|contrassegno|cash.*deliv)/i, /postcode|zip|cap|code/i);
          serviceIdx = findColIdx(/serviceType|servizio|service|tipo/i);
        }

        for (let r = 2; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          const getVal = idx => {
            if (idx === -1 || idx === undefined) return '';
            const cellVal = row.getCell(idx + 1).value;
            if (cellVal === null || cellVal === undefined) return '';
            if (typeof cellVal === 'object') return cellVal.text || cellVal.result || '';
            return cellVal.toString().trim();
          };

          const refVal = getVal(refIdx);
          const trackVal = getVal(trackIdx);

          // Row must have at least reference or tracking
          if (!refVal && !trackVal) continue;

          const contactName = getVal(recipientContactIdx);
          const compName = getVal(recipientCompIdx);
          let recipientVal = '';
          if (compName && contactName && compName !== contactName) {
            recipientVal = `${compName} - ${contactName}`;
          } else {
            recipientVal = compName || contactName || '';
          }

          const rawCity = getVal(cityIdx);
          const countryVal = (getVal(countryIdx) || '').toUpperCase();
          let displayCity = rawCity;
          if (countryVal && countryVal !== 'IT' && countryVal !== 'ITA' && countryVal !== 'ITALIA') {
            if (!rawCity.includes(`(${countryVal})`) && !rawCity.endsWith(` ${countryVal}`)) {
              displayCity = rawCity ? `${rawCity} (${countryVal})` : countryVal;
            }
          }

          parsedShipments.push({
            reference: refVal || '',
            tracking: trackVal || '',
            recipient: recipientVal,
            city: displayCity,
            country: countryVal,
            packages: parseInt(getVal(pkgIdx) || 1, 10) || 1,
            weight: parseFloat(getVal(weightIdx) || 0) || 0,
            cod: parseFloat(getVal(codIdx) || 0) || 0,
            service: getVal(serviceIdx) || detectedCarrier
          });
        }
      }
    } else {
      return res.status(400).json({ error: 'Nessun file o elenco spedizioni fornito.' });
    }

    if (parsedShipments.length === 0) {
      return res.status(400).json({ error: 'Non è stata trovata alcuna spedizione valida nei dati forniti.' });
    }

    // Auto-enrich missing recipient, city, weight, and cod from PrestaShop
    parsedShipments = await enrichShipmentsFromPrestaShop(parsedShipments);

    const manifestCode = generateManifestCode();

    res.json({
      success: true,
      manifestCode,
      carrier: detectedCarrier,
      shipper,
      shipments: parsedShipments,
      totalCount: parsedShipments.length
    });
  } catch (error) {
    console.error('Error parsing manifest data:', error);
    res.status(500).json({ error: error.message || 'Errore durante l\'analisi dei dati del borderò.' });
  }
});

/**
 * POST /api/manifest/generate
 * Generates the official PDF manifest, saves it in data/manifests, and records it in history.
 */
router.post('/generate', async (req, res) => {
  try {
    const { manifestCode: reqCode, carrier = 'FedEx', shipper: customShipper, shipments, notes = '' } = req.body;

    if (!Array.isArray(shipments) || shipments.length === 0) {
      return res.status(400).json({ error: 'Nessuna riga di spedizione fornita per il borderò.' });
    }

    const settings = settingsStore.getSettings();
    const activeShipper = (settings.shipperTemplates && settings.shipperTemplates.find(s => s.id === settings.activeShipperTemplateId)) 
      || (settings.shipperTemplates && settings.shipperTemplates[0]) 
      || {};

    const shipper = {
      ...activeShipper,
      ...(customShipper || {}),
      accountNumber: (customShipper && customShipper.accountNumber) || (settings.fedex && settings.fedex.accountNumber) || activeShipper.accountNumber || ''
    };

    const manifestCode = reqCode || generateManifestCode();
    const fileName = `manifest_${manifestCode}.pdf`;

    // Generate PDF Buffer
    const pdfBuffer = await generateManifestPdf({
      manifestCode,
      carrier,
      shipper,
      shipments,
      notes
    });

    // Save physical file
    const filePath = path.join(historyStore.MANIFESTS_DIR, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    // Calculate totals for history log
    let totalPackages = 0;
    let totalWeight = 0;
    let totalCod = 0;

    shipments.forEach(s => {
      totalPackages += Number(s.packages) || 1;
      totalWeight += Number(s.weight) || 0;
      totalCod += Number(s.cod) || 0;
    });

    // Add entry to historyStore
    const historyEntry = historyStore.addEntry('manifest', {
      manifestCode,
      carrier,
      fileName,
      shipmentsCount: shipments.length,
      totalPackages,
      totalWeight,
      totalCod,
      notes,
      shipperCompany: shipper.company || shipper.nameVal || ''
    });

    res.json({
      success: true,
      manifestCode,
      fileName,
      historyId: historyEntry.id,
      downloadUrl: `/api/manifest/download/${manifestCode}`,
      viewUrl: `/api/manifest/download/${manifestCode}?inline=true`,
      summary: {
        shipmentsCount: shipments.length,
        totalPackages,
        totalWeight,
        totalCod
      }
    });
  } catch (error) {
    console.error('Error generating manifest PDF:', error);
    res.status(500).json({ error: error.message || 'Errore durante la creazione del PDF del borderò.' });
  }
});

/**
 * GET /api/manifest/download/:manifestCode
 * Serves the PDF file for download or in-browser display.
 */
router.get('/download/:manifestCode', (req, res) => {
  try {
    const { manifestCode } = req.params;
    const safeCode = path.basename(manifestCode).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `manifest_${safeCode}.pdf`;
    const filePath = path.join(historyStore.MANIFESTS_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Borderò non trovato.' });
    }

    const inline = req.query.inline === 'true' || req.query.print === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`
    );

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving manifest file:', error);
    res.status(500).json({ error: 'Errore nel download del file PDF.' });
  }
});

/**
 * GET /api/manifest/history
 * Returns the list of generated manifests.
 */
router.get('/history', (req, res) => {
  try {
    const history = historyStore.getHistory();
    const manifests = history.filter(h => h.type === 'manifest');
    res.json(manifests);
  } catch (error) {
    console.error('Error fetching manifest history:', error);
    res.status(500).json({ error: 'Errore nel recupero dello storico dei borderò.' });
  }
});

/**
 * POST /api/manifest/enrich
 * Completes or refreshes missing recipient, city, weight, or COD from PrestaShop for a list of shipments
 */
router.post('/enrich', async (req, res) => {
  try {
    const { shipments, forceRefresh } = req.body;
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return res.status(400).json({ error: 'Nessuna riga di spedizione fornita.' });
    }
    const enriched = await enrichShipmentsFromPrestaShop(shipments, !!forceRefresh);
    res.json({
      success: true,
      shipments: enriched,
      totalCount: enriched.length
    });
  } catch (error) {
    console.error('Error in POST /api/manifest/enrich:', error);
    res.status(500).json({ error: error.message || 'Errore durante l\'arricchimento dei dati da PrestaShop.' });
  }
});

/**
 * Helper to auto-enrich missing recipient, city, weight, and COD from PrestaShop & FedEx API
 */
async function enrichShipmentsFromPrestaShop(shipments, forceRefresh = false) {
  try {
    const psClient = settingsStore.getPrestaShopClient();
    const settings = settingsStore.getSettings();
    const defaultWeight = parseFloat((settings.package && settings.package.weight) || (config.package && config.package.weight)) || 1;

    // 1. Interroga direttamente FedEx Track API in batch per recuperare peso reale, colli e città
    const trackingsToLookup = shipments
      .filter(s => s.tracking && (forceRefresh || !s.weight || Number(s.weight) <= 0 || !s.city))
      .map(s => s.tracking);

    let fedexDetailsMap = {};
    if (trackingsToLookup.length > 0 && settings.fedex && settings.fedex.clientId) {
      try {
        fedexDetailsMap = await fedexApi.getShipmentsDetailsByTrackingNumbers(trackingsToLookup, settings.fedex);
      } catch (fErr) {
        console.warn('FedEx batch details lookup warning:', fErr.message);
      }
    }

    const addressCache = {};
    const customerCache = {};
    const countryCache = {};

    for (let i = 0; i < shipments.length; i++) {
      const s = shipments[i];
      const ref = (s.reference || '').trim();

      // Applica prima il peso reale, colli e città restituiti da FedEx API
      const fedexInfo = fedexDetailsMap[s.tracking];
      if (fedexInfo) {
        if (fedexInfo.weight > 0) {
          s.weight = fedexInfo.weight; // Peso reale da FedEx
        }
        if (fedexInfo.packages) {
          s.packages = fedexInfo.packages;
        }
        if (fedexInfo.service) {
          s.service = fedexInfo.service;
        }
        if ((!s.city || forceRefresh) && fedexInfo.city) {
          const fCity = fedexInfo.city.replace(/\b\w/g, c => c.toUpperCase());
          if (fedexInfo.country && fedexInfo.country !== 'IT' && fedexInfo.country !== 'ITA') {
            s.city = `${fCity} (${fedexInfo.country})`;
            s.country = fedexInfo.country;
          } else {
            s.city = fCity;
            s.country = 'IT';
          }
        }
      }

      if (!ref) continue;

      const hasRecipient = s.recipient && s.recipient.trim().length > 0;
      const hasCity = s.city && s.city.trim().length > 0;
      const hasWeight = s.weight !== undefined && s.weight !== null && Number(s.weight) > 0;
      const hasCod = s.cod !== undefined && s.cod !== null && Number(s.cod) > 0;

      // Skip PrestaShop lookup se destinatario, città e peso sono già completi e non è force refresh
      if (!forceRefresh && hasRecipient && hasCity && hasWeight) {
        continue;
      }

      try {
        const orders = await psClient.getOrdersByReference(ref);
        if (orders && orders.length > 0) {
          const order = orders.find(o => (o.reference || '').trim().toUpperCase() === ref.toUpperCase()) || orders[0];
          if (order) {
            // 1. Recipient and City from Delivery Address
            let address = null;
            if (order.id_address_delivery && order.id_address_delivery !== '0') {
              if (addressCache[order.id_address_delivery]) {
                address = addressCache[order.id_address_delivery];
              } else {
                address = await psClient.getAddress(order.id_address_delivery);
                if (address) addressCache[order.id_address_delivery] = address;
              }
            }

            // Customer fallback if address has no name
            let customer = null;
            if ((!address || (!address.firstname && !address.lastname)) && order.id_customer && order.id_customer !== '0') {
              if (customerCache[order.id_customer]) {
                customer = customerCache[order.id_customer];
              } else {
                customer = await psClient.getCustomer(order.id_customer);
                if (customer) customerCache[order.id_customer] = customer;
              }
            }

            // Populate Recipient
            if (!hasRecipient || forceRefresh) {
              const nameFromAddr = address ? `${address.firstname || ''} ${address.lastname || ''}`.trim() : '';
              const nameFromCust = customer ? `${customer.firstname || ''} ${customer.lastname || ''}`.trim() : '';
              const fullName = nameFromAddr || nameFromCust;
              if (fullName) {
                s.recipient = fullName;
              }
            }

            // Populate City and Country
            if (!hasCity || forceRefresh) {
              if (address && address.city) {
                const formattedCity = address.city.replace(/\b\w/g, c => c.toUpperCase());
                let countryIso = '';
                if (address.id_country && address.id_country !== '0') {
                  if (countryCache[address.id_country]) {
                    countryIso = countryCache[address.id_country];
                  } else {
                    const country = await psClient.getCountry(address.id_country);
                    if (country && country.iso_code) {
                      countryIso = country.iso_code.toUpperCase();
                      countryCache[address.id_country] = countryIso;
                    }
                  }
                }

                if (countryIso && countryIso !== 'IT' && countryIso !== 'ITA') {
                  s.city = `${formattedCity} (${countryIso})`;
                  s.country = countryIso;
                } else {
                  s.city = formattedCity;
                  s.country = 'IT';
                }
              }
            }

            // Populate Weight
            if (!hasWeight || forceRefresh) {
              const orderWeight = parseFloat(order.total_weight);
              s.weight = (orderWeight > 0) ? orderWeight : defaultWeight;
            }

            // Populate COD / Contrassegno
            if (!hasCod || forceRefresh) {
              const isCod = /contrassegno|cash.*deliv|\bcod\b/i.test(order.payment || '') || 
                            /contrassegno|\bcod\b/i.test(order.module || '');
              if (isCod) {
                s.cod = parseFloat(order.total_paid_tax_incl || order.total_paid) || 0;
              } else if (!hasCod) {
                s.cod = 0;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`Could not enrich reference "${ref}" from PrestaShop:`, err.message);
      }
    }
  } catch (globalErr) {
    console.error('Error in enrichShipmentsFromPrestaShop:', globalErr.message);
  }
  return shipments;
}

module.exports = router;
