const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../../data/history.json');
const EXPORTS_DIR = path.join(__dirname, '../../data/exports');

let cachedHistory = null;

function ensureDirs() {
  const dataDir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
}

function getHistory() {
  if (cachedHistory) return cachedHistory;

  ensureDirs();

  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      cachedHistory = JSON.parse(raw);
      if (!Array.isArray(cachedHistory)) {
        cachedHistory = [];
      }
    } catch (err) {
      console.error('Error reading history file:', err.message);
      cachedHistory = [];
    }
  } else {
    cachedHistory = [];
  }

  return cachedHistory;
}

function saveHistory(history) {
  ensureDirs();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  cachedHistory = history;
}

function addEntry(type, data) {
  const history = getHistory();
  const entry = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  history.unshift(entry); // Add to the beginning so latest is first
  saveHistory(history);
  return entry;
}

function deleteEntry(id) {
  const history = getHistory();
  const index = history.findIndex(e => e.id === id);
  if (index === -1) return false;

  const entry = history[index];
  
  // If it's an export and has a file name, delete the physical file
  if (entry.type === 'export' && entry.fileName) {
    const filePath = path.join(EXPORTS_DIR, entry.fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Error deleting physical file ${entry.fileName}:`, err.message);
    }
  }

  history.splice(index, 1);
  saveHistory(history);
  return true;
}

function clearHistory() {
  ensureDirs();
  
  // Delete all files in exports directory
  try {
    const files = fs.readdirSync(EXPORTS_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(EXPORTS_DIR, file));
    }
  } catch (err) {
    console.error('Error clearing exports directory:', err.message);
  }

  // Save empty history
  saveHistory([]);
}

function restoreHistory(historyData, exportFiles) {
  if (!Array.isArray(historyData)) {
    throw new Error('Storico non valido nel file di backup.');
  }

  ensureDirs();

  // Clear current exports first if any
  try {
    const files = fs.readdirSync(EXPORTS_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(EXPORTS_DIR, file));
    }
  } catch (err) {
    console.error('Error clearing exports directory during restore:', err.message);
  }

  // Restore files
  if (exportFiles) {
    for (const [fileName, base64Content] of Object.entries(exportFiles)) {
      const safeName = path.basename(fileName);
      const filePath = path.join(EXPORTS_DIR, safeName);
      try {
        fs.writeFileSync(filePath, Buffer.from(base64Content, 'base64'));
      } catch (err) {
        console.error(`Error restoring file ${fileName}:`, err.message);
      }
    }
  }

  saveHistory(historyData);
}

module.exports = {
  getHistory,
  addEntry,
  deleteEntry,
  clearHistory,
  EXPORTS_DIR,
  restoreHistory
};

