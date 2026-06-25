const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const ordersRouter = require('./src/routes/orders');
const exportRouter = require('./src/routes/export');
const settingsRouter = require('./src/routes/settings');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Serve Static Frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/orders', ordersRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`FedEx Batch Shipping Tool listening on port ${PORT}`);
  console.log(`Base PrestaShop URL: ${config.prestashop.baseUrl}`);
});
