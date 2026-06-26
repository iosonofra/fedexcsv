const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const historyStore = require('../services/historyStore');

// GET /api/history - Retrieve all log entries
router.get('/', (req, res) => {
  try {
    const history = historyStore.getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Errore nel recupero dello storico.' });
  }
});

// GET /api/history/download/:fileName - Download saved Excel file
router.get('/download/:fileName', (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    // Prevent directory traversal attacks
    const safeName = path.basename(fileName);
    const filePath = path.join(historyStore.EXPORTS_DIR, safeName);
    
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File Excel non trovato su questo server.' });
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Errore nel download del file.' });
  }
});

// DELETE /api/history/:id - Delete a single entry
router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const deleted = historyStore.deleteEntry(id);
    if (deleted) {
      res.json({ success: true, message: 'Operazione rimossa dallo storico con successo.' });
    } else {
      res.status(404).json({ error: 'Operazione non trovata nello storico.' });
    }
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Errore durante la rimozione dello storico.' });
  }
});

// DELETE /api/history - Clear all entries and files
router.delete('/', (req, res) => {
  try {
    historyStore.clearHistory();
    res.json({ success: true, message: 'Storico ripulito con successo.' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Errore durante lo svuotamento dello storico.' });
  }
});

module.exports = router;
