const express = require('express');
const path = require('path');
const config = require('./src/config');
const ordersRouter = require('./src/routes/orders');
const exportRouter = require('./src/routes/export');
const settingsRouter = require('./src/routes/settings');
const trackingRouter = require('./src/routes/tracking');
const historyRouter = require('./src/routes/history');
const manifestRouter = require('./src/routes/manifest');
const fs = require('fs');

const app = express();

// Middlewares
app.use(express.json({ limit: '10mb' }));

// Serve Static Frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/templates', express.static(path.join(__dirname, 'templates')));

// API Routes
app.use('/api/orders', ordersRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/history', historyRouter);
app.use('/api/manifest', manifestRouter);

// Ensure data, exports and manifests directories exist on startup
const dataDir = path.join(__dirname, 'data');
const exportsDir = path.join(__dirname, 'data/exports');
const manifestsDir = path.join(__dirname, 'data/manifests');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
if (!fs.existsSync(manifestsDir)) fs.mkdirSync(manifestsDir, { recursive: true });

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`FedEx Batch Shipping Tool listening on port ${PORT}`);
  console.log(`Base PrestaShop URL: ${config.prestashop.baseUrl}`);
});
