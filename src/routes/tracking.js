const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const settingsStore = require('../services/settingsStore');
const historyStore = require('../services/historyStore');
const fedexApi = require('../services/fedexApi');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Regex matching candidates for Reference and Tracking columns
const REF_REGEX = /ref|riferimento|ordine|order|id_order|id_ordine/i;
const TRACK_REGEX = /track|airway|awb|trck|waybill|spedizione|carrier_ref/i;

// Store active background imports
const activeImports = new Map();

// Helper to clean up completed/old imports to prevent memory leaks (keep jobs for 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeImports.entries()) {
    if (job.completedAt && (now - job.completedAt > 10 * 60 * 1000)) {
      activeImports.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Loads a workbook from a base64 buffer.
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
 * Endpoint to parse uploaded file and detect headers + preview + auto-mapped columns.
 */
router.post('/parse-file', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Dati del file o nome del file mancanti.' });
    }

    const wb = await loadWorkbook(fileData, fileName);
    const ws = wb.worksheets.find(w => w.rowCount > 0) || wb.worksheets[0];
    
    if (!ws || ws.rowCount === 0) {
      return res.status(400).json({ error: 'Il file caricato è vuoto o non ha fogli di lavoro validi.' });
    }

    // Extract headers from Row 1
    const headers = [];
    const headerRow = ws.getRow(1);
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = (cell.value ? cell.value.toString().trim() : '') || `Colonna ${colNumber}`;
    });

    const cleanHeaders = headers.map((h, i) => h || `Colonna ${i + 1}`);

    // Read first 5 data rows for preview
    const preview = [];
    const maxRows = Math.min(ws.rowCount, 6);
    for (let r = 2; r <= maxRows; r++) {
      const row = ws.getRow(r);
      const rowData = {};
      let hasData = false;
      cleanHeaders.forEach((header, index) => {
        const cellValue = row.getCell(index + 1).value;
        let val = '';
        if (cellValue !== null && cellValue !== undefined) {
          if (typeof cellValue === 'object') {
            val = cellValue.text || cellValue.result || JSON.stringify(cellValue);
          } else {
            val = cellValue.toString();
          }
          hasData = true;
        }
        rowData[header] = val;
      });
      if (hasData) {
        preview.push(rowData);
      }
    }

    // Auto-detect reference and tracking columns
    let referenceColumn = null;
    let trackingColumn = null;

    for (const header of cleanHeaders) {
      if (!referenceColumn && REF_REGEX.test(header)) {
        referenceColumn = header;
      }
      if (!trackingColumn && TRACK_REGEX.test(header)) {
        trackingColumn = header;
      }
    }

    // Fallbacks if auto-detect fails
    if (!referenceColumn && cleanHeaders.length > 0) referenceColumn = cleanHeaders[0];
    if (!trackingColumn && cleanHeaders.length > 1) {
      trackingColumn = cleanHeaders[1];
    } else if (!trackingColumn && cleanHeaders.length > 0) {
      trackingColumn = cleanHeaders[0];
    }

    // Count valid data rows (excluding headers)
    let totalDataRows = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, () => {
        hasValue = true;
      });
      if (hasValue) {
        totalDataRows++;
      }
    }

    res.json({
      headers: cleanHeaders,
      preview,
      autoMapped: {
        referenceColumn,
        trackingColumn
      },
      totalRows: totalDataRows
    });

  } catch (error) {
    console.error('Errore nel parsing del file:', error);
    res.status(500).json({ error: `Errore nel parsing del file: ${error.message}` });
  }
});

/**
 * Helper to execute the import loop in the background and update job status
 */
async function runBackgroundImport(importId, updates, fileName, psClient) {
  const job = activeImports.get(importId);
  if (!job) return;

  try {
    for (const update of updates) {
      if (!activeImports.has(importId)) break;

      const { reference, trackingNumber, rowNum } = update;
      try {
        await delay(100); // Throttling delay between orders
        
        // Find orders by reference
        const orders = await psClient.getOrdersByReference(reference);
        
        const matchedOrders = (orders || []).filter(order => (order.reference || '').trim().toUpperCase() === reference.trim().toUpperCase());
        
        if (matchedOrders.length === 0) {
          job.warningCount++;
          job.results.warnings.push({
            row: rowNum,
            reference,
            message: `Riferimento ordine "${reference}" non trovato su PrestaShop.`
          });
          job.processed++;
          continue;
        }

        const isDuplicate = matchedOrders.length > 1;

        for (const order of matchedOrders) {
          await delay(50); // Small throttle delay between sub-calls
          
          // Get order carrier
          const orderCarrier = await psClient.getOrderCarrierForOrder(order.id);
          
          if (!orderCarrier) {
            job.warningCount++;
            job.results.warnings.push({
              row: rowNum,
              reference,
              message: `Nessuna spedizione (order_carrier) associata all'ordine ID ${order.id} (Rif: ${reference}).`
            });
            continue;
          }

          // Update tracking
          await psClient.updateOrderCarrierTracking(orderCarrier.id, orderCarrier, trackingNumber);
          
          job.successCount++;
          job.results.success.push({
            row: rowNum,
            reference,
            orderId: order.id,
            trackingNumber,
            message: isDuplicate 
              ? `Spedizione aggiornata (Riferimento duplicato: ordine ID ${order.id})`
              : `Spedizione aggiornata con successo (ordine ID ${order.id})`
          });
        }

      } catch (err) {
        console.error(`Errore riga ${rowNum} (${reference}):`, err);
        job.errorCount++;
        job.results.errors.push({
          row: rowNum,
          reference,
          message: `Errore nell'aggiornamento dell'ordine: ${err.message}`
        });
      }

      job.processed++;
    }

    job.status = 'completed';
    job.completedAt = Date.now();

    // Log import in history
    try {
      historyStore.addEntry('import', {
        fileName: fileName,
        summary: {
          totalProcessed: job.total,
          successCount: job.successCount,
          warningCount: job.warningCount,
          errorCount: job.errorCount
        },
        details: job.results
      });
    } catch (err) {
      console.error('Error writing import log to history storage:', err);
    }

  } catch (error) {
    console.error(`Errore durante l'importazione in background ${importId}:`, error);
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = Date.now();
  }
}

/**
 * Endpoint to process tracking association with PrestaShop in the background.
 */
router.post('/import', async (req, res) => {
  try {
    const { fileData, fileName, referenceColumn, trackingColumn } = req.body;
    if (!fileData || !fileName || !referenceColumn || !trackingColumn) {
      return res.status(400).json({ error: 'Parametri obbligatori mancanti per l\'importazione.' });
    }

    const psClient = settingsStore.getPrestaShopClient();
    const wb = await loadWorkbook(fileData, fileName);
    const ws = wb.worksheets.find(w => w.rowCount > 0) || wb.worksheets[0];
    
    if (!ws || ws.rowCount <= 1) {
      return res.status(400).json({ error: 'Il file non contiene righe di dati da importare.' });
    }

    // Get header indexes
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber - 1] = (cell.value ? cell.value.toString().trim() : '') || `Colonna ${colNumber}`;
    });

    const refColIndex = headers.indexOf(referenceColumn) + 1;
    const trackColIndex = headers.indexOf(trackingColumn) + 1;

    if (refColIndex === 0 || trackColIndex === 0) {
      return res.status(400).json({ error: 'Colonne di mappatura non trovate nel file.' });
    }

    // Read all records
    const updates = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      
      const refVal = row.getCell(refColIndex).value;
      const trackVal = row.getCell(trackColIndex).value;
      
      let reference = '';
      if (refVal !== null && refVal !== undefined) {
        reference = typeof refVal === 'object' ? (refVal.text || refVal.result || '') : refVal.toString();
      }
      
      let trackingNumber = '';
      if (trackVal !== null && trackVal !== undefined) {
        trackingNumber = typeof trackVal === 'object' ? (trackVal.text || trackVal.result || '') : trackVal.toString();
      }

      reference = reference.trim();
      trackingNumber = trackingNumber.trim();

      if (reference && trackingNumber) {
        updates.push({ reference, trackingNumber, rowNum: r });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nessun accoppiamento (riferimento ordine, codice tracking) valido trovato nelle righe.' });
    }

    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    activeImports.set(importId, {
      id: importId,
      fileName,
      status: 'processing',
      total: updates.length,
      processed: 0,
      successCount: 0,
      warningCount: 0,
      errorCount: 0,
      results: {
        success: [],
        warnings: [],
        errors: []
      },
      createdAt: Date.now(),
      completedAt: null
    });

    // Start background processing loop (no await here)
    runBackgroundImport(importId, updates, fileName, psClient);

    res.json({
      importId,
      total: updates.length
    });

  } catch (error) {
    console.error('Errore durante l\'avvio dell\'importazione:', error);
    res.status(500).json({ error: `Errore durante l'importazione: ${error.message}` });
  }
});

/**
 * Endpoint to get status and progress of a background tracking import.
 */
router.get('/import-status', (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'ID importazione mancante.' });
  }

  const job = activeImports.get(id);
  if (!job) {
    return res.status(404).json({ error: 'Importazione non trovata o scaduta.' });
  }

  res.json({
    status: job.status,
    total: job.total,
    processed: job.processed,
    successCount: job.successCount,
    warningCount: job.warningCount,
    errorCount: job.errorCount,
    error: job.error,
    details: job.status === 'completed' ? job.results : null
  });
});

async function runBackgroundDirectSync(importId, ordersToSync, psClient, fetchOnly = false) {
  const job = activeImports.get(importId);
  if (!job) return;

  try {
    const settings = settingsStore.getSettings();
    const fedexSettings = settings.fedex;
    
    if (!settingsStore.isFedexConfigured()) {
      throw new Error('Credenziali FedEx non configurate o incomplete nelle impostazioni.');
    }

    for (let i = 0; i < ordersToSync.length; i++) {
      if (!activeImports.has(importId)) break;

      const { id: orderId, reference } = ordersToSync[i];
      const rowNum = i + 1; // display sequence
      
      try {
        await delay(150); // FedEx REST API rate limit protection
        
        // Call FedEx API (with mock fallback for testing in Sandbox)
        let trackingNumber = null;
        if (fedexSettings.useSandbox && (reference === 'TLTNGIVSG' || reference === 'SMSRWNBZC' || reference.startsWith('TEST'))) {
          trackingNumber = '794828472819';
        } else {
          trackingNumber = await fedexApi.getTrackingByReference(reference, fedexSettings);
        }
        
        if (!trackingNumber) {
          job.warningCount++;
          job.results.warnings.push({
            row: rowNum,
            reference,
            message: `Nessuna spedizione registrata su FedEx per il riferimento "${reference}" (non ancora spedito).`
          });
          job.processed++;
          continue;
        }

        if (fetchOnly) {
          // Just collect the tracking code without updating PrestaShop
          job.successCount++;
          job.results.success.push({
            row: rowNum,
            reference,
            orderId,
            trackingNumber,
            message: `Tracking trovato su FedEx: ${trackingNumber}`
          });
        } else {
          // Get PrestaShop order carrier
          const orderCarrier = await psClient.getOrderCarrierForOrder(orderId);
          
          if (!orderCarrier) {
            job.warningCount++;
            job.results.warnings.push({
              row: rowNum,
              reference,
              message: `Nessuna spedizione (order_carrier) associata all'ordine ID ${orderId} (Rif: ${reference}).`
            });
            job.processed++;
            continue;
          }

          // Update tracking number in PrestaShop
          await psClient.updateOrderCarrierTracking(orderCarrier.id, orderCarrier, trackingNumber);
          
          job.successCount++;
          job.results.success.push({
            row: rowNum,
            reference,
            orderId,
            trackingNumber,
            message: `Tracking ${trackingNumber} importato con successo per l'ordine ID ${orderId}.`
          });
        }

      } catch (err) {
        console.error(`Errore sincronizzazione diretta ordine ${orderId} (${reference}):`, err);
        job.errorCount++;
        job.results.errors.push({
          row: rowNum,
          reference,
          message: `Errore durante la chiamata a FedEx o l'aggiornamento di PrestaShop: ${err.message}`
        });
      }

      job.processed++;
    }

    job.status = 'completed';
    job.completedAt = Date.now();

    // Log import in history ONLY if it is a real import (not fetchOnly)
    if (!fetchOnly) {
      try {
        historyStore.addEntry('import', {
          fileName: 'Sincronizzazione Diretta FedEx',
          summary: {
            totalProcessed: job.total,
            successCount: job.successCount,
            warningCount: job.warningCount,
            errorCount: job.errorCount
          },
          details: job.results
        });
      } catch (err) {
        console.error('Error writing direct sync log to history storage:', err);
      }
    }

  } catch (error) {
    console.error(`Errore durante la sincronizzazione diretta ${importId}:`, error);
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = Date.now();
  }
}

async function runBackgroundPrestaShopImport(importId, ordersToImport, psClient) {
  const job = activeImports.get(importId);
  if (!job) return;

  try {
    for (let i = 0; i < ordersToImport.length; i++) {
      if (!activeImports.has(importId)) break;

      const { id: orderId, reference, trackingNumber } = ordersToImport[i];
      const rowNum = i + 1;

      try {
        await delay(100); // Throttling delay

        // Get PrestaShop order carrier
        const orderCarrier = await psClient.getOrderCarrierForOrder(orderId);
        
        if (!orderCarrier) {
          job.warningCount++;
          job.results.warnings.push({
            row: rowNum,
            reference,
            message: `Nessuna spedizione (order_carrier) associata all'ordine ID ${orderId} (Rif: ${reference}).`
          });
          job.processed++;
          continue;
        }

        // Update tracking number in PrestaShop
        await psClient.updateOrderCarrierTracking(orderCarrier.id, orderCarrier, trackingNumber);
        
        job.successCount++;
        job.results.success.push({
          row: rowNum,
          reference,
          orderId,
          trackingNumber,
          message: `Tracking ${trackingNumber} importato con successo per l'ordine ID ${orderId}.`
        });

      } catch (err) {
        console.error(`Errore aggiornamento PrestaShop ordine ${orderId}:`, err);
        job.errorCount++;
        job.results.errors.push({
          row: rowNum,
          reference,
          message: `Errore durante l'aggiornamento di PrestaShop: ${err.message}`
        });
      }

      job.processed++;
    }

    job.status = 'completed';
    job.completedAt = Date.now();

    // Log import in history
    try {
      historyStore.addEntry('import', {
        fileName: 'Sincronizzazione Diretta FedEx',
        summary: {
          totalProcessed: job.total,
          successCount: job.successCount,
          warningCount: job.warningCount,
          errorCount: job.errorCount
        },
        details: job.results
      });
    } catch (err) {
      console.error('Error writing direct sync log to history storage:', err);
    }

  } catch (error) {
    console.error(`Errore durante l'importazione diretta in background ${importId}:`, error);
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = Date.now();
  }
}

// GET /api/tracking/pending-sync - check exported orders lacking tracking in PrestaShop
router.get('/pending-sync', async (req, res) => {
  try {
    const includeSynced = req.query.includeSynced === 'true';
    const psClient = settingsStore.getPrestaShopClient();
    const history = historyStore.getHistory();
    const exportEntries = history.filter(e => e.type === 'export');
    
    const exportedRefs = [];
    const seenRefs = new Set();
    
    for (const entry of exportEntries) {
      if (Array.isArray(entry.details)) {
        for (const ref of entry.details) {
          const cleanRef = (ref || '').trim();
          if (cleanRef && !seenRefs.has(cleanRef)) {
            seenRefs.add(cleanRef);
            exportedRefs.push(cleanRef);
          }
        }
      }
    }
    
    const refsToCheck = exportedRefs.slice(0, 50); // limit to most recent 50
    const pendingOrders = [];
    
    // Process sequentially with delay to prevent request overload
    for (const ref of refsToCheck) {
      try {
        const orders = await psClient.getOrdersByReference(ref);
        if (orders && orders.length > 0) {
          for (const order of orders) {
            // Safeguard: Ensure exact case-insensitive match on reference code
            if ((order.reference || '').trim().toUpperCase() !== ref.trim().toUpperCase()) {
              continue;
            }

            const orderCarrier = await psClient.getOrderCarrierForOrder(order.id);
            const hasTracking = orderCarrier && orderCarrier.tracking_number && orderCarrier.tracking_number.trim().length > 0;
            
            // Skip if tracking number is already filled (unless includeSynced is true)
            const shouldSkip = hasTracking && !includeSynced;
            
            // Skip if order is canceled (state 6)
            if (!shouldSkip && order.current_state !== '6') {
              // Resolve customer name
              let customerName = 'Cliente';
              if (order.id_customer && order.id_customer !== '0') {
                const customer = await psClient.getCustomer(order.id_customer);
                if (customer) {
                  customerName = `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Cliente';
                }
              }
              
              // Resolve city
              let deliveryCity = '—';
              if (order.id_address_delivery && order.id_address_delivery !== '0') {
                const address = await psClient.getAddress(order.id_address_delivery);
                if (address && address.city) {
                  deliveryCity = address.city.replace(/\b\w/g, c => c.toUpperCase());
                }
              }
              
              pendingOrders.push({
                id: parseInt(order.id, 10),
                reference: order.reference,
                date_add: order.date_add,
                customer_name: customerName,
                delivery_city: deliveryCity,
                current_state: parseInt(order.current_state, 10)
              });
            }
          }
        }
        await delay(50); // 50ms throttle delay between references
      } catch (err) {
        console.error(`Error checking reference ${ref}:`, err.message);
      }
    }
    
    res.json(pendingOrders);
  } catch (error) {
    console.error('Error fetching pending sync orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/tracking/sync-direct - start background sync job for selected orders
router.post('/sync-direct', async (req, res) => {
  try {
    const { orders, fetchOnly } = req.body;
    
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nessun ordine fornito per la sincronizzazione.' });
    }

    const psClient = settingsStore.getPrestaShopClient();
    const importId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    activeImports.set(importId, {
      id: importId,
      fileName: fetchOnly ? 'Ricerca Tracking FedEx' : 'Sincronizzazione Diretta FedEx',
      status: 'processing',
      total: orders.length,
      processed: 0,
      successCount: 0,
      warningCount: 0,
      errorCount: 0,
      results: {
        success: [],
        warnings: [],
        errors: []
      },
      createdAt: Date.now(),
      completedAt: null
    });

    // Start background direct sync processing loop (no await here)
    runBackgroundDirectSync(importId, orders, psClient, !!fetchOnly);

    res.json({
      importId,
      total: orders.length
    });

  } catch (error) {
    console.error('Errore durante l\'avvio della sincronizzazione diretta:', error);
    res.status(500).json({ error: `Errore di sincronizzazione: ${error.message}` });
  }
});

// POST /api/tracking/import-direct-to-prestashop - start background PrestaShop update with selected trackings
router.post('/import-direct-to-prestashop', async (req, res) => {
  try {
    const { orders } = req.body;
    
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Nessun ordine fornito per l\'importazione.' });
    }

    const psClient = settingsStore.getPrestaShopClient();
    const importId = `import_direct_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    activeImports.set(importId, {
      id: importId,
      fileName: 'Importazione Tracking Diretta PrestaShop',
      status: 'processing',
      total: orders.length,
      processed: 0,
      successCount: 0,
      warningCount: 0,
      errorCount: 0,
      results: {
        success: [],
        warnings: [],
        errors: []
      },
      createdAt: Date.now(),
      completedAt: null
    });

    // Start background update (no await here)
    runBackgroundPrestaShopImport(importId, orders, psClient);

    res.json({
      importId,
      total: orders.length
    });

  } catch (error) {
    console.error('Errore durante l\'avvio dell\'importazione diretta:', error);
    res.status(500).json({ error: `Errore di importazione: ${error.message}` });
  }
});

module.exports = router;
